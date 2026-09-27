// Client-side user messages in the same Indian-courtroom voice as
// server/app/messages.py (the server's `detail` text covers most errors).

export const SESSION_EXPIRED =
  "Your appearance before the court has lapsed. Kindly sign in again.";

// Shown when the user ends the session themselves. When the daily argument
// limit adjourns the court, the server's message (with the wait time) is used.
export const COURT_ADJOURNED_BY_USER =
  "The court is adjourned. You may resume the proceedings whenever you are ready.";

export const SERVER_UNREACHABLE =
  "The courthouse doors seem shut right now. Kindly check your connection and try again.";
