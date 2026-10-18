"""Daily jobs: the 30-day purge and its notice, hearing reminders, product-update
batches, and the runner's lock (services/purge.py, daily_jobs.py, announcements.py)."""

from datetime import timedelta

import pytest

from app.config import settings
from app.models.announcement import Announcement
from app.models.case import (
    Case,
    CaseOutcome,
    CaseStatus,
    CourtroomProceedingsEvent,
    CourtroomProceedingsEventType,
    EvidenceItem,
    Roles,
)
from app.models.case_memory import CaseMemoryChunk, CaseMemorySourceType
from app.models.case_outcome import CaseOutcomeRecord
from app.models.client_log import ClientLog
from app.models.feedback import Feedback
from app.models.job_run import JobRun
from app.models.otp import OTP
from app.models.rate_limit import RateLimitEntry
from app.models.report import Report
from app.models.user import User
from app.models.user_session import UserSession
from app.services import announcements, daily_jobs, purge
from app.utils.datetime import get_current_datetime
from tests.helpers import boom, reload

NOW = get_current_datetime()


def days_ago(n: float):
    return NOW - timedelta(days=n)


@pytest.fixture
def cloudinary_calls(monkeypatch):
    """Record the image deletes the purge asks Cloudinary for."""
    calls: list[tuple[str, str]] = []
    monkeypatch.setattr(purge, "delete_image", lambda pid: calls.append(("image", pid)))
    monkeypatch.setattr(
        purge, "delete_case_images", lambda cnr: calls.append(("case", cnr))
    )
    return calls


async def owned_everything(user: User, make_case) -> Case:
    """A user with one of every record the purge must remove."""
    case = await make_case(
        user,
        is_deleted=True,
        evidence=[
            EvidenceItem(
                exhibit_ref="EX-01",
                title="Photo",
                evidence_type="photo",
                description="d",
                image_public_id="ai-courtroom/evidence/x/evidence_1",
            )
        ],
    )
    assert user.id is not None and case.id is not None
    uid = str(user.id)
    await CaseMemoryChunk(
        case_id=case.id,
        cnr=case.cnr,
        user_id=user.id,
        source_type=CaseMemorySourceType.CASE_DETAILS,
        source_id="s",
        content="c",
        content_hash="h",
    ).insert()
    await CaseOutcomeRecord(
        user_id=user.id,
        case_id=case.id,
        cnr=case.cnr,
        role=Roles.PLAINTIFF,
        outcome=CaseOutcome.WON,
    ).insert()
    await UserSession(
        sid="s1", user_id=user.id, created_at=NOW, last_active=NOW, expires_at=NOW
    ).insert()
    await Report(user_id=user.id, cnr=case.cnr, entry_id="e", reason="law").insert()
    await ClientLog(
        level="error",
        category="api",
        message="m",
        session_id="x",
        url="/",
        user_agent="ua",
        user_id=uid,
    ).insert()
    await OTP(email=user.email or "", otp="123456", expiry=NOW).insert()
    await RateLimitEntry(
        user_id=uid, rate_limiter_type="argument", expiration_time=NOW
    ).insert()
    await Feedback(
        user_id=uid,
        first_name="A",
        last_name="B",
        email=user.email,
        phone_number=user.phone_number,
        feedback_category="general",
        message="Signed-in message",
        ip="1.2.3.4",
    ).insert()
    # A recovery request sent as a guest, naming the account.
    await Feedback(
        name="Guest",
        email="guest@example.com",
        feedback_category="account_recovery",
        account_identifier=user.email,
        message="Please restore my account",
        ip="5.6.7.8",
    ).insert()
    return case


# ---------------------------------------------------------------------------
# purge
# ---------------------------------------------------------------------------


async def test_purge_erases_everything_and_anonymises_contact(
    make_user, make_case, cloudinary_calls
):
    user = await make_user(
        deleted_at=days_ago(31),
        profile_photo_url="https://res.cloudinary.com/demo/image/upload/v1/ai-courtroom/profile-photos/user_1.jpg",
    )
    case = await owned_everything(user, make_case)
    keep = await make_user()  # someone else's data stays
    await make_case(keep)

    counts = await purge.purge_due_users(NOW)

    assert counts == {"purge_due": 1, "purged": 1, "purge_failed": 0}
    assert ("case", case.cnr) in cloudinary_calls
    assert ("image", "ai-courtroom/profile-photos/user_1") in cloudinary_calls
    assert await User.get(user.id) is None
    for model, field in (
        (Case, Case.user_id),
        (CaseMemoryChunk, CaseMemoryChunk.user_id),
        (CaseOutcomeRecord, CaseOutcomeRecord.user_id),
        (UserSession, UserSession.user_id),
        (Report, Report.user_id),
    ):
        assert await model.find(field == user.id).count() == 0, model.__name__
    assert await ClientLog.find(ClientLog.user_id == str(user.id)).count() == 0
    assert await OTP.find(OTP.email == user.email).count() == 0
    assert (
        await RateLimitEntry.find(RateLimitEntry.user_id == str(user.id)).count() == 0
    )
    letters = await Feedback.find_all().to_list()
    assert sorted(f.message for f in letters) == [
        "Please restore my account",
        "Signed-in message",
    ]
    for f in letters:
        assert (f.user_id, f.name, f.first_name, f.email, f.phone_number) == (
            None,
            None,
            None,
            None,
            None,
        )
        assert (f.account_identifier, f.ip) == (None, None)
    assert await User.get(keep.id) is not None
    assert await Case.find(Case.user_id == keep.id).count() == 1


@pytest.mark.parametrize("days, purged", [(29, False), (31, True)])
async def test_purge_waits_the_full_30_days(make_user, cloudinary_calls, days, purged):
    user = await make_user(deleted_at=days_ago(days))

    await purge.purge_due_users(NOW)

    assert (await User.get(user.id) is None) is purged


async def test_live_accounts_are_never_purged(make_user, cloudinary_calls):
    user = await make_user()
    assert (await purge.purge_due_users(NOW))["purge_due"] == 0
    assert await User.get(user.id) is not None


async def test_cloudinary_down_still_erases_on_time_and_queues_the_images(
    make_user, make_case, monkeypatch, cloudinary_calls
):
    user = await make_user(
        deleted_at=days_ago(40),
        profile_photo_url="https://res.cloudinary.com/demo/image/upload/v1/ai-courtroom/profile-photos/user_9.jpg",
    )
    case = await owned_everything(user, make_case)

    def down(ref):
        raise RuntimeError("401 disabled api_key")

    monkeypatch.setattr(purge, "delete_case_images", down)
    monkeypatch.setattr(purge, "delete_image", down)
    counts = await purge.purge_due_users(NOW)

    assert counts["purged"] == 1 and counts["purge_failed"] == 0
    assert await User.get(user.id) is None
    assert await Case.find(Case.user_id == user.id).count() == 0
    assert await purge.retry_image_cleanups(NOW, dry_run=True) == {
        "image_cleanups_pending": 2,
        "image_cleanups_done": 0,
    }

    # Still down: the queue keeps them.
    assert (await purge.retry_image_cleanups(NOW))["image_cleanups_done"] == 0

    # Back up: the retry clears them and the queue empties.
    monkeypatch.setattr(
        purge, "delete_case_images", lambda r: cloudinary_calls.append(("case", r))
    )
    monkeypatch.setattr(
        purge, "delete_image", lambda r: cloudinary_calls.append(("image", r))
    )
    assert (await purge.retry_image_cleanups(NOW))["image_cleanups_done"] == 2
    assert ("case", case.cnr) in cloudinary_calls
    assert ("image", "ai-courtroom/profile-photos/user_9") in cloudinary_calls
    assert (await purge.retry_image_cleanups(NOW))["image_cleanups_pending"] == 0


async def test_permanent_delete_works_while_cloudinary_is_down(
    make_user, make_case, monkeypatch
):
    user = await make_user()
    case = await owned_everything(user, make_case)

    def down(ref):
        raise RuntimeError("cloudinary down")

    monkeypatch.setattr(purge, "delete_case_images", down)
    await purge.purge_case(case)
    await purge.purge_case(case)  # queuing the same folder twice keeps one entry

    assert await Case.get(case.id) is None
    assert (await purge.retry_image_cleanups(NOW, dry_run=True))[
        "image_cleanups_pending"
    ] == 1


async def test_dry_run_changes_nothing(make_user, cloudinary_calls):
    user = await make_user(deleted_at=days_ago(45))

    counts = await purge.purge_due_users(NOW, dry_run=True)

    assert counts == {"purge_due": 1, "purged": 0, "purge_failed": 0}
    assert await User.get(user.id) is not None
    assert cloudinary_calls == []


async def test_case_without_images_skips_cloudinary(
    make_user, make_case, cloudinary_calls
):
    user = await make_user()
    case = await make_case(user)

    await purge.purge_case(case)

    assert cloudinary_calls == []
    assert await Case.get(case.id) is None


# ---------------------------------------------------------------------------
# the 3-day notice
# ---------------------------------------------------------------------------


async def test_notice_goes_once_in_the_last_three_days(make_user, outbox):
    soon = await make_user(deleted_at=days_ago(28))
    later = await make_user(deleted_at=days_ago(20))
    no_email = await make_user(deleted_at=days_ago(28), email=None)

    first = await purge.send_purge_notices(NOW)
    second = await purge.send_purge_notices(NOW)

    assert first == {"purge_notices_due": 2, "purge_notices_sent": 1}
    assert second["purge_notices_sent"] == 0
    assert [m["to"] for m in outbox] == [soon.email]
    assert "erased for good" in outbox[0]["body"]
    assert "/contact?cat=account_recovery" in outbox[0]["body"]
    assert (await reload(soon)).purge_notice_sent_at is not None
    assert (await reload(later)).purge_notice_sent_at is None
    assert (await reload(no_email)).purge_notice_sent_at is None


async def test_notice_dry_run_sends_nothing(make_user, outbox):
    await make_user(deleted_at=days_ago(28))
    assert (await purge.send_purge_notices(NOW, dry_run=True))[
        "purge_notices_sent"
    ] == 0
    assert outbox == []


# ---------------------------------------------------------------------------
# hearing reminders
# ---------------------------------------------------------------------------


def adjourned_at(when):
    return [
        CourtroomProceedingsEvent(
            type=CourtroomProceedingsEventType.ARGUMENT, content="a", timestamp=when
        )
    ]


async def test_reminder_once_per_adjournment(make_user, make_case, outbox):
    user = await make_user()
    case = await make_case(
        user,
        status=CaseStatus.ADJOURNED,
        courtroom_proceedings=adjourned_at(days_ago(8)),
    )

    first = await daily_jobs.send_hearing_reminders(NOW)
    again = await daily_jobs.send_hearing_reminders(NOW)

    assert first == {"reminders_due": 1, "reminders_sent": 1}
    assert again["reminders_due"] == 0
    assert [m["to"] for m in outbox] == [user.email]
    assert f"/cases/{case.cnr}/courtroom" in outbox[0]["body"]
    assert "List-Unsubscribe" in outbox[0]["headers"]

    # The court sat again later; after 7 more idle days, a new reminder.
    case = await reload(case)
    case.courtroom_proceedings += adjourned_at(NOW + timedelta(hours=1))
    await case.save()
    later = NOW + timedelta(days=9)
    assert (await daily_jobs.send_hearing_reminders(later))["reminders_sent"] == 1


@pytest.mark.parametrize(
    "case_overrides, user_overrides",
    [
        ({"courtroom_proceedings": adjourned_at(days_ago(6))}, {}),  # not 7 days yet
        ({"status": CaseStatus.ACTIVE}, {}),  # still in session
        ({"is_deleted": True}, {}),  # archived
        ({}, {"notification_prefs": {"hearing_reminders": False}}),  # switched off
        ({}, {"email": None}),  # nowhere to send it
        ({"courtroom_proceedings": []}, {}),  # never sat
    ],
)
async def test_no_reminder_when_not_due(
    make_user, make_case, outbox, case_overrides, user_overrides
):
    user = await make_user(**user_overrides)
    data = {
        "status": CaseStatus.ADJOURNED,
        "courtroom_proceedings": adjourned_at(days_ago(8)),
        **case_overrides,
    }
    await make_case(user, **data)

    await daily_jobs.send_hearing_reminders(NOW)

    assert outbox == []


async def test_reminder_dry_run_and_missing_owner(make_user, make_case, outbox):
    user = await make_user()
    await make_case(
        user,
        status=CaseStatus.ADJOURNED,
        courtroom_proceedings=adjourned_at(days_ago(9)),
    )
    assert (await daily_jobs.send_hearing_reminders(NOW, dry_run=True)) == {
        "reminders_due": 1,
        "reminders_sent": 0,
    }
    await user.delete()
    assert (await daily_jobs.send_hearing_reminders(NOW))["reminders_sent"] == 0
    assert outbox == []


# ---------------------------------------------------------------------------
# product updates
# ---------------------------------------------------------------------------


def test_announcement_body_is_escaped_with_paragraphs():
    out = announcements.render_body("<b>Hi</b>\n\nLine one\nline two", None, "More")

    assert "<p>&lt;b&gt;Hi&lt;/b&gt;</p>" in out
    assert "<p>Line one<br>line two</p>" in out
    assert out.endswith('/changelog">More</a></p>')


async def test_announcement_goes_in_batches_to_opted_in_users(
    make_user, outbox, monkeypatch
):
    monkeypatch.setattr(settings, "announcement_batch_size", 2)
    opted = [
        await make_user(notification_prefs={"product_updates": True}) for _ in range(3)
    ]
    await make_user()  # product updates are off by default
    await make_user(notification_prefs={"product_updates": True}, deleted_at=NOW)
    author = await make_user()
    assert author.id is not None
    a = await Announcement(
        subject="New: objections", body_html="<p>x</p>", created_by=author.id
    ).insert()

    first = await announcements.send_pending(NOW)
    second = await announcements.send_pending(NOW)
    third = await announcements.send_pending(NOW)

    assert first == {"announcements_pending": 1, "announcement_emails": 2}
    assert second == {"announcements_pending": 1, "announcement_emails": 1}
    assert third == {"announcements_pending": 0, "announcement_emails": 0}
    assert sorted(m["to"] for m in outbox) == sorted(u.email for u in opted)
    assert all("List-Unsubscribe-Post" in m["headers"] for m in outbox)
    done = await reload(a)
    assert (done.sent, done.failed) == (3, 0) and done.finished_at is not None


async def test_announcement_dry_run_sends_nothing(make_user, outbox):
    author = await make_user(notification_prefs={"product_updates": True})
    assert author.id is not None
    await Announcement(subject="S", body_html="<p>x</p>", created_by=author.id).insert()

    counts = await announcements.send_pending(NOW, dry_run=True)

    assert counts == {"announcements_pending": 1, "announcement_emails": 0}
    assert outbox == []


# ---------------------------------------------------------------------------
# the runner
# ---------------------------------------------------------------------------


async def test_run_records_counts_and_releases_the_lock(make_user, cloudinary_calls):
    await make_user(deleted_at=days_ago(35))

    run = await daily_jobs.run_daily_jobs()
    assert run is not None
    saved = await JobRun.get(run.id)
    assert saved is not None and saved.finished_at is not None
    assert saved.counts["purged"] == 1 and saved.errors == []

    assert await daily_jobs.run_daily_jobs() is not None  # lock released


async def test_a_held_lock_skips_the_run():
    assert await daily_jobs._acquire_lock(NOW)

    assert await daily_jobs.run_daily_jobs() is None
    assert await JobRun.find_all().count() == 0


async def test_an_expired_lock_is_taken_over():
    assert await daily_jobs._acquire_lock(NOW - timedelta(hours=2))
    assert await daily_jobs._acquire_lock(NOW)


async def test_a_failing_step_is_recorded_and_the_rest_still_run(monkeypatch, outbox):
    monkeypatch.setattr(
        daily_jobs,
        "STEPS",
        (("purge", boom), *daily_jobs.STEPS[2:]),
    )

    run = await daily_jobs.run_daily_jobs(dry_run=True)

    assert run is not None
    assert run.errors == ["purge: RuntimeError"]
    assert "reminders_due" in run.counts and "announcements_pending" in run.counts


async def test_failed_announcement_sends_are_counted(make_user, monkeypatch):
    async def bounce(*args, **kwargs):
        return False

    monkeypatch.setattr(announcements, "send_optional_email", bounce)
    reader = await make_user(notification_prefs={"product_updates": True})
    assert reader.id is not None
    a = await Announcement(
        subject="S", body_html="<p>x</p>", created_by=reader.id
    ).insert()

    await announcements.send_pending(NOW)

    done = await reload(a)
    assert (done.sent, done.failed) == (0, 1)
