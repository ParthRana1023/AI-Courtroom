# app/services/settlement_progress.py
"""What the payments under a settlement order have come to, acted on.

settlement_payments.timeline says where the accused stands on a given day. This
module does what follows, once each: tells the owner when an instalment is missed,
paid late or the last one paid, and, when a default is left unpaid after notice,
has counsel for the complainants act on it, if that counsel is the AI.

It runs whenever the case is read and from the daily jobs. Each step is written
with a marker in one atomic update, so two readers at once can't both act.
"""

import html
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, time, timedelta
from typing import Literal

from fastapi import BackgroundTasks
from pymongo.results import UpdateResult

from app.config import settings
from app.logging_config import get_logger
from app.models.case import (
    Case,
    CourtroomProceedingsEvent,
    CourtroomProceedingsEventType,
    Enforcement,
    Settlement,
    SettlementStatus,
)
from app.models.user import User
from app.services.llm.settlement import inr
from app.services.notifications import send_optional_email
from app.services.settlement_payments import describe, timeline
from app.utils.datetime import get_current_datetime

logger = get_logger(__name__)

# Simulated time, as in settlement_payments: the court lists an application on a
# default this long after it is filed.
LIST_AFTER = timedelta(days=2)
PAY_WITHIN = timedelta(days=1)  # the time the court gives to pay the balance

# What counsel for the complainants does about a default on each route.
ENFORCE: dict[str, Literal["contempt", "recovery", "suit"]] = {
    "quash": "contempt",
    "plea": "recovery",
    "compound": "suit",
}
APPLIED = {
    "contempt": (
        "filed a contempt petition for breach of your client's undertaking to the court"
    ),
    "recovery": "applied to the court to recover the compensation as a fine",
}
YOU_CAN = {
    "quash": "file a contempt petition for breach of the undertaking to the court",
    "plea": "ask the court to recover the compensation as a fine",
    "compound": "sue on the deed in a civil court (the acquittal stands)",
}
FILED = {
    "contempt": "Contempt petition filed by the complainants for wilful breach of "
    "the undertaking to pay; listed for {day}",
    "recovery": "Application by the complainants to recover the unpaid compensation "
    "as a fine under section 461 BNSS; listed for {day}",
}


@dataclass
class Notice:
    """One thing that happened to the payments, for the owner's email."""

    key: str  # the marker: "missed:1", "cured:1", "defaulted", "closed"
    instalment: int | None = None


def watched(case: Case) -> tuple[int, Settlement] | None:
    """The recorded order whose payments are still playing out, with its index."""
    if not case.settlements:
        return None
    index = len(case.settlements) - 1
    attempt = case.settlements[index]
    if (
        attempt.status != SettlementStatus.RECORDED
        or attempt.plan is None
        or attempt.payments_done
    ):
        return None
    return index, attempt


def stage_of(case: Case) -> str | None:
    """Where the payments under the case's order stand today (see describe), for the
    case list; None when no simulated order was made."""
    attempt = case.settlements[-1] if case.settlements else None
    if (
        attempt is None
        or attempt.status != SettlementStatus.RECORDED
        or not attempt.plan
    ):
        return None
    return describe(attempt, get_current_datetime().date())["stage"]


def user_defends(case: Case) -> bool:
    profile = case.settlement_profile
    return bool(profile) and case.user_role.value == profile.accused_side


def _day(d: date) -> str:
    return d.strftime("%d %B %Y")


def events(attempt: Settlement, today: date) -> list[Notice]:
    """What the payments have come to by today that the owner hasn't been told."""
    assert attempt.plan is not None
    line = timeline(attempt.payments, attempt.plan, today)
    found = []
    for i, row in enumerate(line.rows):
        if row.status == "missed":
            found.append(Notice(f"missed:{i}", i))
        elif (
            row.status == "late"
            and not attempt.plan.draws[i].on_time
            and attempt.payments[i].paid_at is None
        ):
            found.append(Notice(f"cured:{i}", i))
    if line.stage == "defaulted":
        found.append(Notice("defaulted", line.defaulted))
    elif line.stage == "closed":
        found.append(Notice("closed"))
    enforcement = attempt.enforcement
    if (
        enforcement
        and enforcement.pay_by
        and enforcement.result is None
        and today >= enforcement.pay_by
    ):
        found.append(Notice("direction", enforcement.instalment))
    return [n for n in found if n.key not in attempt.notified]


def ai_complainants_act(
    case: Case, instalment: int, today: date
) -> tuple[Enforcement, str | None]:
    """Counsel for the complainants (the AI) acts on an uncured default: moves this
    court where the order allows it, or sues on the deed in a civil court. Returns
    the enforcement and the line it puts on the record, if any."""
    profile = case.settlement_profile
    assert profile is not None
    kind = ENFORCE[profile.route]
    if kind == "suit":
        return (
            Enforcement(kind="suit", by="ai", instalment=instalment, filed_on=today),
            None,
        )
    listed = today + LIST_AFTER
    enforcement = Enforcement(
        kind=kind, by="ai", instalment=instalment, filed_on=today, listed_for=listed
    )
    return enforcement, FILED[kind].format(day=_day(listed))


@dataclass
class Step:
    """What one notice changes: the enforcement, instalments paid (by index), whether
    the payments are over, and a line for the record."""

    enforcement: Enforcement | None = None
    paid: dict[int, datetime] = field(default_factory=dict)
    finished: bool = False
    note: str | None = None


def balance(attempt: Settlement, on: date) -> list[int]:
    """The instalments still unpaid on a day: what the court directs be paid."""
    assert attempt.plan is not None
    rows = timeline(attempt.payments, attempt.plan, on).rows
    return [i for i, r in enumerate(rows) if r.status not in ("paid", "late")]


def direction_met(attempt: Settlement) -> Step:
    """The day the court gave has come: the accused pays the balance (drawn once,
    against their reliability), or the court acts: on contempt, it sentences; on
    recovery, the warrant levies the amount."""
    enforcement = attempt.enforcement
    assert enforcement and enforcement.pay_by and enforcement.hearing and attempt.plan
    owed = balance(attempt, enforcement.pay_by)
    total = inr(sum(attempt.payments[i].amount for i in owed)).replace("Rs. ", "₹")
    on = datetime.combine(enforcement.pay_by, time(12), tzinfo=UTC)
    levied = enforcement.hearing.outcome == "warrant"
    if attempt.plan.complies and not levied:
        result, note = "paid", f"The accused paid the balance of {total} as directed"
    elif enforcement.kind == "recovery":
        result, note = "recovered", (
            f"The balance of {total} was recovered under the warrant, by attachment "
            "of the accused's property"
        )
    else:
        result, note = "punished", (
            "The accused did not pay as directed. The court held the breach of the "
            "undertaking wilful and sentenced the accused under Section 12 of the "
            "Contempt of Courts Act, 1971 to simple imprisonment for one month and a "
            f"fine of ₹2,000. The balance of {total} remains recoverable by a suit on "
            "the deed"
        )
    step = Step(
        enforcement=enforcement.model_copy(update={"result": result}), note=note
    )
    if result == "punished":
        step.finished = True
    else:
        step.paid = {i: on for i in owed}
    return step


def consequence(case: Case, attempt: Settlement, notice: Notice, today: date) -> Step:
    if notice.key == "closed":
        return Step(finished=True)
    if notice.key == "direction":
        return direction_met(attempt)
    if notice.key == "defaulted" and user_defends(case):
        assert notice.instalment is not None
        enforcement, note = ai_complainants_act(case, notice.instalment, today)
        return Step(
            enforcement=enforcement, finished=enforcement.kind == "suit", note=note
        )
    return Step()


async def catch_up(case: Case, now: datetime | None = None) -> list[Notice]:
    """Act on what the payments have come to, once each, and return what to tell the
    owner. The case in hand is updated to match what was written."""
    found = watched(case)
    if found is None:
        return []
    index, attempt = found
    now = now or get_current_datetime()
    path = f"settlements.{index}"
    done = []
    for notice in events(attempt, now.date()):
        step = consequence(case, attempt, notice, now.date())
        push: dict = {f"{path}.notified": notice.key}
        changes: dict = {
            f"{path}.payments.{i}.paid_at": paid for i, paid in step.paid.items()
        }
        if step.enforcement:
            changes[f"{path}.enforcement"] = step.enforcement
        if step.finished:
            changes[f"{path}.payments_done"] = True
        event = step.note and CourtroomProceedingsEvent(
            type=CourtroomProceedingsEventType.SYSTEM_MESSAGE,
            content=step.note,
            timestamp=now,
        )
        if event:
            # A different array from settlements, so one update may do both.
            push["courtroom_proceedings"] = event
        update: dict = {"$push": push}
        if changes:
            update["$set"] = changes
        result = await Case.find_one(
            {
                "_id": case.id,
                f"{path}.id": attempt.id,
                f"{path}.notified": {"$ne": notice.key},
            }
        ).update_one(update)
        if not isinstance(result, UpdateResult) or not result.modified_count:
            continue  # another reader got there first
        attempt.notified.append(notice.key)
        for i, paid in step.paid.items():
            attempt.payments[i].paid_at = paid
        if step.enforcement:
            attempt.enforcement = step.enforcement
        if step.finished:
            attempt.payments_done = True
        if event:
            case.courtroom_proceedings.append(event)
        logger.info(f"Settlement payments in {case.cnr}: {notice.key}")
        done.append(notice)
    if any(n.key == "direction" for n in done):
        done += await catch_up(case, now)  # paid as directed: the order is now closed
    return done


def message(case: Case, notice: Notice) -> tuple[str, str] | None:
    """The email for one notice: (subject, HTML). Names are escaped."""
    profile = case.settlement_profile
    if profile is None or not case.settlements:
        return None
    attempt = case.settlements[-1]
    mine = user_defends(case)
    who = "Your client" if mine else html.escape(profile.accused)
    name = case.title or case.cnr
    title = html.escape(name)
    owed = ""
    if notice.instalment is not None:
        payment = attempt.payments[notice.instalment]
        owed = (
            f"instalment {notice.instalment + 1} "
            f"({inr(payment.amount).replace('Rs. ', '₹')}, due {_day(payment.due)})"
        )
    unpaid = f"{who} didn't pay {owed} in <strong>{title}</strong>, even after notice."
    enforcement = attempt.enforcement
    if notice.key.startswith("missed"):
        given = "Counsel for the complainants has" if mine else "You have"
        subject = f"An instalment was missed: {name}"
        body = (
            f"{who} missed {owed} in <strong>{title}</strong>. {given} given notice "
            "under the deed: it must be paid within the notice period, or the "
            "complainants may act on the default."
        )
    elif notice.key.startswith("cured"):
        subject = f"A missed instalment was paid: {name}"
        body = (
            f"{who} paid {owed} in <strong>{title}</strong> within the notice period: "
            "late, but in time. The complainants took it, so nothing more comes of it."
        )
    elif notice.key == "closed":
        subject = f"Every instalment paid: {name}"
        how = {
            "paid": "The accused paid the balance as the court directed",
            "recovered": "The balance was recovered under the court's warrant",
        }.get(
            enforcement.result if enforcement and enforcement.result else "",
            f"The last instalment under the order in <strong>{title}</strong> is paid",
        )
        body = f"{how}. The case is fully closed."
    elif notice.key == "direction":  # paid or recovered: "closed" says so
        if not enforcement or enforcement.result != "punished":
            return None
        subject = f"Sentenced for contempt: {name}"
        body = (
            f"{who} didn't pay the balance in <strong>{title}</strong> as the court "
            "directed, and was sentenced for contempt. The complainants are left to "
            "sue on the deed for what is still owed."
        )
    elif mine and enforcement and enforcement.listed_for:
        subject = f"Back in court: {name}"
        body = (
            f"{unpaid} The complainants have {APPLIED[enforcement.kind]}. It is "
            f"listed for <strong>{_day(enforcement.listed_for)}</strong>; you'll "
            "answer it in the courtroom."
        )
    elif mine:
        subject = f"The complainants will sue on the deed: {name}"
        body = (
            f"{unpaid} The compounding stands, so the case can't be reopened; the "
            "complainants will sue on the deed in a civil court for the rest."
        )
    else:
        subject = f"The accused has defaulted: {name}"
        body = f"{unpaid} You can {YOU_CAN[profile.route]}, from the case's courtroom."
    return subject, f"<p>{body}</p>"


async def tell_owner(case: Case, notices: list[Notice]) -> int:
    """Email the owner what happened, if they get hearing emails. Returns how many
    went out."""
    if not notices:
        return 0
    user = await User.get(case.user_id)
    if user is None:
        return 0
    site = settings.app_url_for(None)
    sent = 0
    for notice in notices:
        mail = message(case, notice)
        if mail is None:
            continue
        subject, body = mail
        if await send_optional_email(
            user,
            "hearing_reminders",
            subject,
            f"<h2>AI Courtroom - Settlement payments</h2>{body}"
            f'<p><a href="{site}/cases/{case.cnr}">Open the case &rarr;</a></p>',
            site,
        ):
            sent += 1
    return sent


async def catch_up_and_tell(case: Case, background_tasks: BackgroundTasks) -> None:
    """On a read: act on the payments now, email the owner after the response."""
    notices = await catch_up(case)
    if notices:
        background_tasks.add_task(tell_owner, case, notices)


async def progress_settlements(now: datetime, dry_run: bool = False) -> dict[str, int]:
    """Daily job: catch every order up, so the owner hears of it without opening
    the case."""
    # $elemMatch: a "$ne" across the array would skip a case whose earlier attempt
    # (refused, withdrawn) has no plan.
    cases = await Case.find(
        {
            "settlements": {
                "$elemMatch": {"plan": {"$ne": None}, "payments_done": {"$ne": True}}
            },
            "is_deleted": {"$ne": True},
        }
    ).to_list()
    due = changed = sent = 0
    for case in cases:
        found = watched(case)
        if found is None:
            continue
        pending = events(found[1], now.date())
        due += len(pending)
        if dry_run or not pending:
            continue
        try:  # one case going wrong mustn't hold up the others
            notices = await catch_up(case, now)
            changed += len(notices)
            sent += await tell_owner(case, notices)
        except Exception:
            logger.exception(f"Settlement payments failed to catch up in {case.cnr}")
    return {
        "settlement_updates_due": due,
        "settlement_updates": changed,
        "settlement_emails": sent,
    }
