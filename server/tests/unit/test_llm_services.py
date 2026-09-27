"""Tests for the LLM service layer: prompt building and response parsing.

Every model call goes to the scripted FakeChatModel from conftest.
"""

import re

import pytest

from app.models.party import PartyRole
from app.services.llm import case_analysis, judge, lawyer
from app.services.llm import case_generation as cg
from app.services.llm import parties_service as ps
from app.services.llm import witness_service as ws
from app.utils.llm import MAX_SHORT_RESPONSE_RETRIES, LLMGenerationError

# ---------------------------------------------------------------------------
# lawyer
# ---------------------------------------------------------------------------


async def test_short_replies_are_regenerated_automatically(fake_llm):
    fake_llm.responses.extend(["", "My Lord.", "My Lord, the deposit was never paid."])

    result = await lawyer.generate_counter_argument("arg")

    assert result == "My Lord, the deposit was never paid."
    assert len(fake_llm.calls) == 3


async def test_short_reply_kept_after_two_retries(fake_llm):
    fake_llm.responses.extend(["No.", "No!", "Nope."])

    answer = await ws.examine_witness(
        "Ravi", "witness", "bio", "plaintiff", "Q?", "ctx"
    )

    assert answer == "Nope."
    assert len(fake_llm.calls) == 1 + MAX_SHORT_RESPONSE_RETRIES


async def test_counter_argument_prompt_contains_context_and_strips_thinking(fake_llm):
    fake_llm.responses.append("<think>strategy</think>My Lord, the claim fails.")

    result = await lawyer.generate_counter_argument(
        "The deposit was paid.",
        "defendant",
        "plaintiff",
        "details",
        rag_context="RAG CONTEXT",
        history="Plaintiff: earlier point",
        evidence_context="EX-01: Lease",
    )

    prompt = fake_llm.prompts[0]
    assert result == "My Lord, the claim fails."
    assert (
        "RAG CONTEXT" in prompt
        and "Plaintiff: earlier point" in prompt
        and "EX-01: Lease" in prompt
    )


async def test_counter_argument_defaults(fake_llm):
    await lawyer.generate_counter_argument("arg")

    prompt = fake_llm.prompts[0]
    assert "No case details provided" in prompt
    assert "(Relevant history retrieved via RAG context)" in prompt
    assert "No structured evidence has been submitted." in prompt


async def test_counter_argument_truncates_case_details(fake_llm):
    await lawyer.generate_counter_argument("arg", case_details="A" * 7000)

    assert "A" * 6000 in fake_llm.prompts[0]
    assert "A" * 6001 not in fake_llm.prompts[0]


@pytest.mark.parametrize(
    "call, what",
    [
        (lambda: lawyer.generate_counter_argument("x"), "counter argument"),
        (
            lambda: lawyer.opening_statement("plaintiff", "d", "defendant"),
            "opening statement",
        ),
        (
            lambda: lawyer.closing_statement("plaintiff", "defendant"),
            "closing statement",
        ),
    ],
)
async def test_lawyer_raises_on_llm_failure(fake_llm, call, what):
    fake_llm.error = RuntimeError("provider down")

    with pytest.raises(LLMGenerationError, match=f"Failed to generate {what}"):
        await call()


async def test_opening_statement(fake_llm):
    fake_llm.responses.append("My Lord, we will prove the breach.")

    result = await lawyer.opening_statement(
        "plaintiff", "details", "defendant", evidence_context="EX-02"
    )

    assert result == "My Lord, we will prove the breach."
    assert "plaintiff's side" in fake_llm.prompts[0] and "EX-02" in fake_llm.prompts[0]


@pytest.mark.parametrize(
    "kwargs, expected",
    [
        ({"rag_context": "RAG"}, "RAG"),
        ({"case_details": "DETAILS"}, "DETAILS"),
        ({"history": "HISTORY"}, "HISTORY"),
        ({}, "No closing context provided"),
    ],
)
async def test_closing_statement_context_priority(fake_llm, kwargs, expected):
    await lawyer.closing_statement("defendant", "plaintiff", **kwargs)

    assert expected in fake_llm.prompts[0]


# ---------------------------------------------------------------------------
# judge and case analysis
# ---------------------------------------------------------------------------


async def test_generate_verdict(fake_llm):
    fake_llm.responses.append("<think>x</think>**FACTS**\n1. The suit is decreed.")

    verdict = await judge.generate_verdict(
        ["P arg"], ["D arg"], case_details="details", title="A v. B"
    )

    assert verdict.startswith("**FACTS**")
    prompt = fake_llm.prompts[0]
    assert "A v. B" in prompt and "P arg" in prompt and "D arg" in prompt


async def test_generate_verdict_defaults_and_failure(fake_llm):
    await judge.generate_verdict([], [])
    assert "No title provided" in fake_llm.prompts[0]
    assert "No case details provided" in fake_llm.prompts[0]

    fake_llm.error = RuntimeError("down")
    with pytest.raises(LLMGenerationError, match="Failed to generate verdict"):
        await judge.generate_verdict([], [])


def test_case_analysis_builds_prompt_with_roles(fake_llm):
    fake_llm.responses.append("<think>x</think>### Outcome\nThe user won.")

    result = case_analysis.CaseAnalysisService.analyze_case(
        ["D1", "D2"],
        ["P1"],
        case_details="d",
        title="T",
        judges_verdict="Suit decreed",
        user_role="plaintiff",
        ai_role="defendant",
    )

    assert result == "### Outcome\nThe user won."
    prompt = fake_llm.prompts[0]
    assert (
        "USER'S ROLE: PLAINTIFF" in prompt
        and "D1\nD2" in prompt
        and "Suit decreed" in prompt
    )


def test_case_analysis_without_arguments_skips_llm(fake_llm):
    assert (
        case_analysis.CaseAnalysisService.analyze_case([], [])
        == "No analysis generated."
    )
    assert fake_llm.calls == []


def test_case_analysis_unknown_roles_and_failure(fake_llm):
    case_analysis.CaseAnalysisService.analyze_case(["D"])
    assert "USER'S ROLE: UNKNOWN" in fake_llm.prompts[0]

    fake_llm.error = RuntimeError("down")
    with pytest.raises(Exception, match="Internal error during analysis"):
        case_analysis.CaseAnalysisService.analyze_case(["D"])


# ---------------------------------------------------------------------------
# case generation
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "raw, cleaned",
    [
        ("1. Ravi Kumar", "Ravi Kumar"),
        ("- 2) **Asha Rao**", "Asha Rao"),
        ('"Tata Motors Ltd"', "Tata Motors Ltd"),
        ("Ravi Kumar,", "Ravi Kumar"),
    ],
)
def test_clean_generated_line(raw, cleaned):
    assert cg._clean_generated_line(raw) == cleaned


def test_extract_simple_names_filters_noise():
    response = "Here are some names:\n1. Ravi Kumar\n2. Ravi Kumar\nasha\nA Very Long Name That Has Too Many Words Here\n```\nMeera Iyer"

    assert cg._extract_simple_names(response) == ["Ravi Kumar", "Meera Iyer"]


def test_extract_simple_organizations_filters_noise():
    response = (
        "Here are the following:\n1. Reliance Industries Ltd\n2. Acme: Widgets Ltd\n"
        "3. Just A Name\n4. Akshaya Patra Foundation\n"
        + "5. "
        + "X" * 80
        + " Ltd\n6. A, B, C Ltd"
    )

    assert cg._extract_simple_organizations(response) == [
        "Reliance Industries Ltd",
        "Akshaya Patra Foundation",
    ]


async def test_random_helpers_parse_llm_output(fake_llm):
    fake_llm.responses.extend(
        [
            "Ravi Kumar\nAsha Rao\nMeera Iyer",
            "Pune\nNagpur\nSurat\nIndore\nBhopal\nPatna",
            "Tata Motors Ltd\nState Bank\nDelhi Textiles Ltd",
        ]
    )

    names = await cg.random_names()
    cities = await cg.random_cities()
    orgs = await cg.random_organizations()

    assert set(names) == {"Ravi Kumar", "Asha Rao", "Meera Iyer"}
    assert len(cities) == 5
    assert set(orgs) == {"Tata Motors Ltd", "State Bank", "Delhi Textiles Ltd"}


async def test_random_helpers_fall_back(fake_llm):
    fake_llm.responses.extend(["nothing useful", "only one city", "nothing useful"])

    assert await cg.random_names() == cg.FALLBACK_NAMES
    assert await cg.random_cities() == ["only one city"]
    assert await cg.random_organizations() == cg.FALLBACK_ORGANIZATIONS

    fake_llm.error = RuntimeError("down")
    assert await cg.random_names() == cg.FALLBACK_NAMES
    assert await cg.random_cities() == []
    assert await cg.random_organizations() == cg.FALLBACK_ORGANIZATIONS


@pytest.mark.parametrize(
    "high_court, city, prefix",
    [
        ("Bombay High Court", "Pune", "MHPU"),
        ("High Court of Karnataka at Bengaluru", "B", None),
        ("Unknown Court", "", "DL"),
        ("Madras High Court", "1A", None),
    ],
)
def test_generate_realistic_cnr_is_always_16_chars(high_court, city, prefix):
    cnr = cg.generate_realistic_cnr(high_court, city)

    assert len(cnr) == 16
    assert re.fullmatch(r"[A-Z]{4}\d{12}", cnr)
    if prefix:
        assert cnr.startswith(prefix)


def test_generate_realistic_cnr_partial_court_match():
    from app.services.high_court_mapping import INDIAN_HIGH_COURTS

    code, court = next(iter(INDIAN_HIGH_COURTS.items()))

    assert cg.generate_realistic_cnr(f"{court} (Bench)", "Xy").startswith(code)


def case_markdown(title_block):
    return (
        f"**IN THE Bombay High Court**\n{title_block}\n**FACTS:**\nSomething happened."
    )


async def test_generate_case_shell_with_given_location(fake_llm):
    fake_llm.responses.extend(
        [
            "Ravi Kumar\nAsha Rao",
            "Tata Motors Ltd\nDelhi Textiles Ltd",
            "<think>x</think>"
            + case_markdown("**IN THE MATTER OF:**\n**Ravi Kumar vs. Asha Rao**"),
        ]
    )

    shell = await cg.generate_case_shell(
        2, [303, 318], high_court="Bombay High Court", city="Pune"
    )

    assert shell["title"] == "Ravi Kumar vs. Asha Rao"
    assert shell["status"] == "not started"
    assert shell["cnr"].startswith("MHPU")
    case_prompt = fake_llm.prompts[2]
    assert "303, 318" in case_prompt and "Use this city: Pune" in case_prompt


async def test_generate_case_shell_random_location_and_title_fallbacks(fake_llm):
    fake_llm.responses.extend(
        [
            "nothing",
            "nothing",
            "Pune\nNagpur\nSurat\nIndore\nBhopal",
            case_markdown("**Under Section 303 of BNS**"),
        ]
    )

    shell = await cg.generate_case_shell(1, [])

    assert shell["title"] == "Under Section 303 of BNS"
    assert "sections XXX" in fake_llm.prompts[3]


async def test_generate_case_shell_without_title_and_default_city(fake_llm):
    fake_llm.responses.extend(["nothing", "nothing", "", "plain text case"])

    shell = await cg.generate_case_shell(1, [1])

    assert shell["title"] == ""
    assert "Use this city: Mumbai" in fake_llm.prompts[3]


async def test_generate_case_shell_rejects_empty_output(fake_llm):
    fake_llm.responses.extend(["nothing", "nothing", "<think>only reasoning</think>"])

    with pytest.raises(ValueError, match="empty response"):
        await cg.generate_case_shell(1, [1], city="Pune")


# ---------------------------------------------------------------------------
# parties
# ---------------------------------------------------------------------------


async def test_extract_names_dedupes_and_strips_numbering(fake_llm):
    fake_llm.responses.append(
        "<think>x</think>1. Ravi Kumar\n2. ravi kumar\n\nAcme Ltd"
    )

    names = await ps.extract_names_from_case("case text", rag_context="ctx")

    assert names == ["Ravi Kumar", "Acme Ltd"]
    assert "ctx" in fake_llm.prompts[0]


async def test_extract_names_failure_returns_empty(fake_llm):
    fake_llm.error = RuntimeError("down")

    assert await ps.extract_names_from_case("case") == []


APPLICANT_BIO = """## Role
**APPLICANT** - the petitioner who filed the case.
## Basic Details
- **Occupation**: Teacher
- **Age**: 42
- **Address**: 12 MG Road, Pune
## Background
Ravi filed the case."""

NON_APPLICANT_BIO = """## Role
**NON-APPLICANT** (respondent)
## Basic Details
- **Occupation**: unknown
- **Address**: N/A"""


async def test_generate_party_details_applicant(fake_llm):
    fake_llm.responses.append(APPLICANT_BIO)

    party = await ps.generate_party_details("Ravi", "case")

    assert party.role == PartyRole.APPLICANT
    assert (party.occupation, party.age, party.address) == (
        "Teacher",
        42,
        "12 MG Road, Pune",
    )
    assert party.bio == APPLICANT_BIO


async def test_generate_party_details_non_applicant_placeholders(fake_llm):
    fake_llm.responses.append(NON_APPLICANT_BIO)

    party = await ps.generate_party_details("Acme", "")

    assert party.role == PartyRole.NON_APPLICANT
    assert (party.occupation, party.age, party.address) == (None, None, None)
    assert "No case details provided" in fake_llm.prompts[0]


async def test_generate_party_details_role_section_without_bold(fake_llm):
    fake_llm.responses.append("## Role\nThey are the applicant in this matter")

    assert (await ps.generate_party_details("X", "case")).role == PartyRole.APPLICANT


async def test_generate_party_details_failure(fake_llm):
    fake_llm.error = RuntimeError("down")

    party = await ps.generate_party_details("Ravi", "case")

    assert party.role == PartyRole.NON_APPLICANT
    assert party.bio == "Details for Ravi could not be generated."


async def test_extract_and_assign_parties_runs_per_party(fake_llm):
    def respond(prompt):
        if "Extract all people and organizations" in prompt:
            return "Ravi\nAcme"
        return APPLICANT_BIO if "**Ravi**" in prompt else NON_APPLICANT_BIO

    fake_llm.responder = respond

    parties = await ps.extract_and_assign_parties("case text")

    assert [(p.name, p.role) for p in parties] == [
        ("Ravi", PartyRole.APPLICANT),
        ("Acme", PartyRole.NON_APPLICANT),
    ]


async def test_extract_and_assign_parties_no_names(fake_llm):
    fake_llm.responses.append("")

    assert await ps.extract_and_assign_parties("case") == []


async def test_chat_with_party_formats_history_and_strips_name(fake_llm):
    fake_llm.responses.append("Ravi: I paid on time, sir.")
    history = [
        {"sender": "user", "content": "Hello"},
        {"sender": "party", "content": "Namaste"},
    ]

    reply = await ps.chat_with_party(
        "Ravi", "applicant", "bio", "details", history, "When did you pay?"
    )

    assert reply == "I paid on time, sir."
    prompt = fake_llm.prompts[0]
    assert "User (Lawyer): Hello" in prompt and "Ravi: Namaste" in prompt
    assert "applicant/petitioner" in prompt


async def test_chat_with_party_first_message_and_failure(fake_llm):
    await ps.chat_with_party("Acme", "non_applicant", "bio", "", [], "Hi")
    assert "(No previous conversation)" in fake_llm.prompts[0]
    assert "non-applicant/respondent" in fake_llm.prompts[0]

    fake_llm.error = RuntimeError("down")
    assert "trouble responding" in await ps.chat_with_party(
        "Acme", "non_applicant", "", "", [], "Hi"
    )


async def test_chat_with_party_accepts_curly_braces(fake_llm):
    fake_llm.responses.append("Yes.")

    assert (
        await ps.chat_with_party(
            "Ravi", "applicant", "", "", [], "Did the note say {paid}?"
        )
        == "Yes."
    )


# ---------------------------------------------------------------------------
# witness
# ---------------------------------------------------------------------------


async def test_examine_witness_formats_history_and_strips_prefixes(fake_llm):
    fake_llm.responses.append("Ravi: Answer: Yes, My Lord, I saw it.")
    history = [{"examiner": "plaintiff", "question": "Name?", "answer": "Ravi"}]

    reply = await ws.examine_witness(
        "Ravi", "applicant", "bio", "judge", "Were you there?", "d", history
    )

    assert reply == "Yes, My Lord, I saw it."
    prompt = fake_llm.prompts[0]
    assert "Q (plaintiff): Name?" in prompt and "the Honorable Judge" in prompt


@pytest.mark.parametrize(
    "kwargs, expected",
    [
        (
            {"rag_context": "RAG"},
            "(Relevant testimony history retrieved via RAG context)",
        ),
        ({}, "(This is the first question)"),
    ],
)
async def test_examine_witness_history_fallbacks(fake_llm, kwargs, expected):
    await ws.examine_witness("W", "non_applicant", "", "someone", "Q?", "", **kwargs)

    assert expected in fake_llm.prompts[0]
    assert "a lawyer" in fake_llm.prompts[0]


async def test_examine_witness_failure(fake_llm):
    fake_llm.error = RuntimeError("down")

    assert "feeling unwell" in await ws.examine_witness(
        "W", "applicant", "", "plaintiff", "Q?", "d"
    )


async def test_examine_witness_accepts_curly_braces(fake_llm):
    fake_llm.responses.append("No, I was not there.")

    assert (
        await ws.examine_witness("W", "applicant", "", "plaintiff", "Is {x} true?", "d")
        == "No, I was not there."
    )


@pytest.mark.parametrize(
    "witness_role, ai_role, stance",
    [
        ("applicant", "defendant", "hostile"),
        ("non_applicant", "plaintiff", "hostile"),
        ("applicant", "plaintiff", "friendly"),
    ],
)
async def test_cross_examination_question_stance(
    fake_llm, witness_role, ai_role, stance
):
    fake_llm.responses.append("Question: Where were you on 5 May?")

    question = await ws.generate_cross_examination_questions(
        "W",
        witness_role,
        ai_role,
        "details",
        [{"question": "Q1", "answer": "A1"}],
        case_arguments="args",
    )

    assert question == "Where were you on 5 May?"
    assert f"{stance} witness" in fake_llm.prompts[0]


async def test_cross_examination_question_defaults_and_failure(fake_llm):
    await ws.generate_cross_examination_questions("W", "applicant", "defendant", "", [])
    prompt = fake_llm.prompts[0]
    assert "(Case just started)" in prompt and "(No testimony yet" in prompt

    fake_llm.error = RuntimeError("down")
    assert (
        "clarify your earlier statement"
        in await ws.generate_cross_examination_questions("W", "a", "b", "", [])
    )


WITNESSES = [
    {"id": "w1", "name": "Ravi Kumar", "role": "applicant", "bio": "Tenant"},
    {"id": "w2", "name": "Asha Rao", "role": "non_applicant", "bio": "Landlord"},
]


@pytest.mark.parametrize(
    "response, testified, expected",
    [
        ("CALL: 2", [], "w2"),
        ("call: 1", ["w1"], "w2"),
        ("CALL: 9", [], None),
        ("CALL: Asha Rao", [], "w2"),
        ("CALL: 'Ravi'", [], "w1"),
        ("CALL: Nobody", [], None),
        ("NO_WITNESS", [], None),
    ],
)
async def test_should_ai_call_witness_parsing(fake_llm, response, testified, expected):
    fake_llm.responses.append(response)

    assert (
        await ws.should_ai_call_witness("plaintiff", "d", "args", WITNESSES, testified)
        == expected
    )


async def test_should_ai_call_witness_no_candidates_and_failure(fake_llm):
    assert (
        await ws.should_ai_call_witness(
            "plaintiff", "d", "args", WITNESSES, ["w1", "w2"]
        )
        is None
    )
    assert fake_llm.calls == []

    fake_llm.error = RuntimeError("down")
    assert (
        await ws.should_ai_call_witness("plaintiff", "", "args", WITNESSES, []) is None
    )


@pytest.mark.parametrize("response, expected", [("CONTINUE", True), ("stop", False)])
async def test_should_continue_cross_examination(fake_llm, response, expected):
    fake_llm.responses.append(response)

    assert (
        await ws.should_continue_cross_examination(
            "W", "applicant", "defendant", "d", [{"question": "q", "answer": "a"}], 2
        )
        is expected
    )
    assert "a hostile witness" in fake_llm.prompts[0]


async def test_should_continue_cross_examination_shortcuts_and_failure(fake_llm):
    assert (
        await ws.should_continue_cross_examination(
            "W", "a", "b", "", [], 5, max_questions=5
        )
        is False
    )
    assert await ws.should_continue_cross_examination("W", "a", "b", "", [], 0) is True
    assert fake_llm.calls == []

    fake_llm.error = RuntimeError("down")
    assert (
        await ws.should_continue_cross_examination(
            "W", "applicant", "plaintiff", "", [], 1
        )
        is False
    )
