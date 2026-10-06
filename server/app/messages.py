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
