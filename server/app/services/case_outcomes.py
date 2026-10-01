"""Decide each case's outcome once, after the verdict, and record it for stats."""

import asyncio
from collections import defaultdict

from pymongo.errors import DuplicateKeyError

from app.logging_config import get_logger
from app.models.case import Case, CaseOutcome, CaseStatus, Roles
from app.models.case_outcome import CaseOutcomeRecord
from app.services.llm.outcome_classifier import OutcomeClassifierService

logger = get_logger(__name__)

# Separate from case_lock: the verdict route still holds case_lock (through
# courtroom_control) while its background task runs, so reusing it would
# deadlock. This lock only stops two callers classifying the same case at once.
_outcome_locks: defaultdict[str, asyncio.Lock] = defaultdict(asyncio.Lock)


def user_role_in_case(case: Case) -> Roles | None:
    """The side the case owner argued: from their own arguments, else the case."""
    for arg in case.plaintiff_arguments + case.defendant_arguments:
        if (
            arg.user_id
            and str(arg.user_id) == str(case.user_id)
            and arg.role != Roles.NOT_STARTED
        ):
            return arg.role
    if case.user_role != Roles.NOT_STARTED:
        return case.user_role
    return None


def activity_snapshot(case: Case, role: Roles) -> dict[str, int]:
    """What the user did in the case, for the activity stats."""
    user_arguments = [
        arg
        for arg in case.plaintiff_arguments + case.defendant_arguments
        if arg.user_id and str(arg.user_id) == str(case.user_id)
    ]
    return {
        "arguments_count": len(user_arguments),
        "witnesses_examined": sum(
            1
            for testimony in case.witness_testimonies
            if any(exam.examiner == role.value for exam in testimony.examination)
        ),
        "conferences_held": sum(1 for chat in case.party_chats.values() if chat),
        "evidence_count": len(case.evidence),
    }


async def _sync_from_record(case: Case, record: CaseOutcomeRecord) -> CaseOutcome:
    if case.outcome != record.outcome:
        # $set only these fields; a full save could overwrite a concurrent
        # write from the request that is still finishing.
        await Case.find_one(Case.id == case.id).update_one(
            {"$set": {"outcome": record.outcome, "outcome_reason": record.reason}}
        )
        case.outcome = record.outcome
        case.outcome_reason = record.reason
    return record.outcome


async def ensure_outcome(case: Case) -> CaseOutcome | None:
    """The case's outcome, classifying and recording it the first time.

    Never raises: a failure is logged and returns None, so callers (the verdict
    flow, the analysis route) carry on without an outcome.
    """
    try:
        async with _outcome_locks[str(case.id)]:
            fresh = await Case.get(case.id)
            if fresh is None:
                return None
            if fresh.outcome is not None:
                return fresh.outcome

            existing = await CaseOutcomeRecord.find_one(
                CaseOutcomeRecord.case_id == fresh.id
            )
            if existing:
                return await _sync_from_record(fresh, existing)

            role = user_role_in_case(fresh)
            if fresh.status != CaseStatus.RESOLVED or not fresh.verdict or not role:
                return None

            result = await OutcomeClassifierService.classify_outcome(
                fresh.verdict, role.value, fresh.title
            )
            record = CaseOutcomeRecord(
                user_id=fresh.user_id,
                case_id=fresh.id,
                cnr=fresh.cnr,
                title=fresh.title,
                role=role,
                outcome=result.outcome,
                reason=result.reason,
                **activity_snapshot(fresh, role),
            )
            try:
                await record.insert()
            except DuplicateKeyError:
                record = await CaseOutcomeRecord.find_one(
                    CaseOutcomeRecord.case_id == fresh.id
                )
            outcome = await _sync_from_record(fresh, record)
            logger.info(
                "Case outcome recorded",
                extra={"case_id": str(fresh.id), "outcome": outcome.value},
            )
            return outcome
    except Exception:
        logger.exception(
            "Failed to decide case outcome", extra={"case_id": str(case.id)}
        )
        return None
