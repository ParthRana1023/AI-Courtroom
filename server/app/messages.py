"""User-facing error messages, written in the voice of an Indian courtroom.

Keep every message useful: say what happened, what to do next, and any wait.
Placeholders: ``{minutes}`` (whole minutes) and ``{wait}`` (e.g. "3 hours 5 minutes").
Validation and security-sensitive errors stay plain on purpose.
"""

# AI / server
LLM_UNAVAILABLE = (
    "Pardon me, I seem to have lost my train of thought and am unable to answer "
    "at the moment. Kindly try again shortly."
)

# Rate limits
ARGUMENT_LIMIT = (
    "The Court has heard enough arguments for today. "
    "You may address the Bench again in {wait}."
)
COURT_ADJOURNED = (
    "The Court has heard enough arguments for today and is adjourned for the day. "
    "The Court will be back in session in {wait}."
)
COURT_IN_RECESS = (
    "The Court is in a short recess while counsel confer with their clients. "
    "The Court will be back in session in {wait}."
)
CASE_GENERATION_LIMIT = (
    "The Registry has closed filings for the day. "
    "You may file a fresh case again in {wait}."
)
WITNESS_QUESTION_LIMIT = (
    "The Court has heard enough from the witnesses for today. "
    "You may examine witnesses again in {wait}."
)
PARTY_CHAT_LIMIT = (
    "The client wants to gather their thoughts. "
    "Please wait a minute before speaking to the client again."
)
OTP_SEND_LIMIT = (
    "The court clerk has already issued several summons to this address. "
    "Kindly wait {minutes} minute(s) before asking for another code."
)
LOGIN_LOCKED = (
    "Too many failed attempts to enter the court. "
    "Kindly try again after {minutes} minute(s)."
)

# Auth
OTP_INVALID = (
    "This code does not match the court records or has expired. "
    "Kindly check it or ask for a fresh one."
)

PHONE_NOT_REGISTERED = (
    "No account uses this number. Enrol first, or sign in another way."
)
PHONE_TAKEN = "This number is already enrolled. Sign in with it instead."
RESET_LINK_SENT = (
    "If an account exists for this email, we have sent a link to reset the password."
)
RESET_LINK_INVALID = (
    "This reset link is invalid, has expired or has already been used. "
    "Kindly ask for a new one."
)
PASSWORD_CHANGED = "Your password has been changed. Sign in with your new password."

# Account and security
ACCOUNT_DELETED = "This account was deleted. Contact us before {until} to recover it."
EMAIL_HELD = (
    "This email belongs to an account deleted on {deleted}. Contact us before "
    "{until} to recover it, or register again after that."
)
NO_PASSWORD = "This account has no password: you sign in with Google or a code."
WRONG_PASSWORD = "That password is not correct."
EMAIL_LOCKED = "You signed up with this email, so it can't be changed here."
PHONE_LOCKED = "You signed up with this number, so it can't be changed here."
EMAIL_TAKEN = "Another account already uses this email."
EMAIL_NEEDS_CODE = "Confirm a new email with the code we send to it."
CODE_INVALID = "This code is wrong or has expired. Ask for a new one."
NO_EMAIL = "Add an email address to your profile first."
DELETE_CODE_INVALID = "This code is wrong or has expired. Ask for a new one."
GOOGLE_LINKED_ELSEWHERE = (
    "This Google account is connected to another AI Courtroom account."
)
GOOGLE_ALREADY_LINKED = "Disconnect the Google account that is connected first."
GOOGLE_NOT_LINKED = "No Google account is connected."
GOOGLE_STAYS = "You signed up with Google, so it stays connected."
EXPORT_LIMIT = (
    "You can request your data once a day. Check your email for the last one."
)

# Contact
CONTACT_LIMIT = (
    "The registry has received several letters from you already. "
    "Kindly wait {minutes} minute(s) before sending another."
)
GUEST_DETAILS_REQUIRED = "Leave your name and email so we can reply, or sign in."
CAPTCHA_FAILED = "We couldn't confirm you're not a robot. Please try the check again."
CAPTCHA_UNAVAILABLE = (
    "We couldn't run the robot check just now. Please try again in a minute."
)

# Case access
CASE_NOT_FOUND = "This case file could not be found in the court registry."
CASE_FORBIDDEN = "This case file belongs to another advocate."
PARTY_NOT_FOUND = "This person is not on record in this case."
HEARING_ON_OTHER_DEVICE = (
    "This hearing is being conducted from another device. "
    "Kindly take over the case to argue from here."
)
COURT_NOT_IN_SESSION = (
    "The court is not in session at the moment. Kindly resume the proceedings first."
)
PARTY_CHAT_SESSION_ADJOURNED = (
    "You are unable to reach the parties for now. " "Kindly resume the proceedings."
)
LEAVE_PENDING = "Respond to the request to call a witness first."
NO_EXHIBITS_IN_STATEMENTS = (
    "Exhibits can be cited only in arguments, not in opening or closing statements."
)

# Settlement out of court
SETTLEMENT_NEEDS_ROLE = (
    "Choose your side in this case before you negotiate a settlement."
)
SETTLEMENT_COURT_SITTING = (
    "The court is in session. Ask for an adjournment to explore a settlement, "
    "then negotiate out of court."
)
SETTLEMENT_CASE_CLOSED = "This case is closed: there is nothing left to settle."
SETTLEMENT_REFUSED = (
    "The court has refused to record a compromise in this case. "
    "The matter will be decided on merits."
)
SETTLEMENT_ATTEMPTS_USED = (
    "Both settlement attempts in this case are used up. "
    "The matter will be decided on merits."
)
SETTLEMENT_OFFERS_USED = (
    "You have made your last offer in this round. "
    "Accept the other side's terms or withdraw."
)
SETTLEMENT_AGREED = "Terms are already agreed. Put them before the court, or withdraw."
SETTLEMENT_NONE_OPEN = "There is no settlement under negotiation."
SETTLEMENT_NO_COUNTER = "There are no terms from the other side to accept."
SETTLEMENT_FAILED = (
    "Opposing counsel could not respond to your offer. Please try again."
)
SETTLEMENT_NOT_AGREED = "Both sides must agree the terms before they go to the court."
SETTLEMENT_REVIEW_FAILED = (
    "The court could not take up the compromise just now. Please try again."
)
