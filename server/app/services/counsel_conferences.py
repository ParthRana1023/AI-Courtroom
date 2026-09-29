"""The AI lawyer's private conferences with the parties on its own side.

Mirrors what the user can do with their parties: the AI lawyer questions its
clients during case prep and while the court is adjourned. The transcripts are hidden from the user, invisible
to the judge, known to the AI lawyer, and known to a party when it testifies.
"""

import uuid

from app.config import settings
from app.logging_config import get_logger
from app.models.case import Case, CaseStatus, Roles
from app.services.llm.parties_service import (
    can_lawyer_confer_with_party,
    chat_with_party,
    generate_counsel_questions,
)
from app.services.rag import retrieve_case_context, upsert_memory_item
from app.utils.datetime import get_current_datetime

logger = get_logger(__name__)


async def run_counsel_conferences(cnr: str) -> None:
    """Background task: one short conference with each party on the AI's side.

    Only during case prep or while the court is adjourned by the user (not by a
    session ending): the same windows in which the user may talk to their parties.
    """
    case = await Case.find_one(Case.cnr == cnr)
    if (
        not case
        or case.ai_role in (None, Roles.NOT_STARTED)
        or case.status not in (CaseStatus.NOT_STARTED, CaseStatus.ADJOURNED)
        or case.adjourned_by_session_end
    ):
        return

    try:
        for party in case.parties_involved:
            if not can_lawyer_confer_with_party(case.ai_role, party.role):
                continue
            try:
                await _confer(case, party)
            except Exception:
                logger.exception(
                    f"AI counsel conference failed for {party.name} in {cnr}"
                )
    finally:
        # Conferences done (or failed): the court may sit again straight away.
        await Case.set_counsel_recess(case.id, None)


async def _confer(case: Case, party) -> None:
    stored = await Case.load_ai_party_chats(case.id, party.id)
    messages: list[dict] = stored.get(party.id, [])

    asked = sum(1 for m in messages if m.get("sender") == "counsel")
    remaining = min(
        settings.counsel_questions_per_round,
        settings.counsel_questions_per_party - asked,
    )
    if remaining <= 0:
        return

    context = await retrieve_case_context(
        case,
        f"{case.ai_role.value} counsel preparing questions for {party.name}",
        source_types=[
            "case_details",
            "evidence",
            "party_bio",
            "argument",
            "proceeding",
        ],
    )
    questions = await generate_counsel_questions(
        case.ai_role.value, party.name, context, messages, remaining
    )

    new_messages: list[dict] = []
    for question in questions[:remaining]:
        # chat_with_party labels the interviewing lawyer's turns "user".
        history = [
            {**m, "sender": "user" if m["sender"] == "counsel" else "party"}
            for m in messages
        ]
        answer = await chat_with_party(
            party.name,
            party.role.value,
            party.bio or "",
            case.details,
            history,
            question,
            rag_context=await retrieve_case_context(
                case,
                f"{party.name} answering their counsel: {question}",
                source_types=["case_details", "evidence", "party_bio", "ai_party_chat"],
                party_id=party.id,
            ),
        )
        for sender, content in (("counsel", question), ("party", answer)):
            message = {
                "id": str(uuid.uuid4()),
                "sender": sender,
                "content": content,
                "timestamp": get_current_datetime().isoformat(),
            }
            messages.append(message)
            new_messages.append(message)
            await upsert_memory_item(
                case,
                "ai_party_chat",
                message["id"],
                content,
                {"party_id": party.id, "party_name": party.name, "sender": sender},
            )

    if new_messages:
        await Case.append_ai_party_chat(case.id, party.id, new_messages)
    logger.info(f"AI counsel conferred with {party.name} in case {case.cnr}")
