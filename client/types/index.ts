// User types
enum Roles {
  PLAINTIFF = "plaintiff",
  DEFENDANT = "defendant",
  NOT_STARTED = "not_started",
}

export type CaseLocationPreference = "user_location" | "specific_state" | "random";

type AuthMethod = "email" | "phone" | "google";

export interface User {
  id?: string;
  first_name: string;
  last_name: string;
  email: string | null;
  auth_method: AuthMethod;
  date_of_birth?: string | null;
  phone_number?: string | null;
  gender?: "male" | "female" | "others" | "prefer-not-to-say";
  profile_photo_url?: string;
  nickname?: string;
  // Location fields
  city?: string;
  state?: string;
  state_iso2?: string;
  country?: string;
  country_iso2?: string;
  phone_code?: string;
  // Case generation preferences
  case_location_preference?: CaseLocationPreference;
  preferred_case_state?: string;
  rag_enabled?: boolean;
  partial_scoring?: PartialScoring;
  settled_scoring?: SettledScoring;
  is_developer?: boolean; // may turn on developer mode (server allowlist)
  // Account and security
  has_password?: boolean;
  google_linked?: boolean;
  google_email?: string | null;
  password_changed_at?: string | null;
  notification_prefs?: NotificationPrefs;
  data_export_requested_at?: string | null;
  member_since?: string | null;
}

export interface NotificationPrefs {
  case_ready: boolean;
  hearing_reminders: boolean;
  product_updates: boolean;
}

/** One signed-in device (GET /auth/sessions). */
export interface DeviceSession {
  id: string;
  user_agent: string | null;
  ip: string | null;
  created_at: string;
  last_active: string;
  current: boolean;
}

// How a partly successful case counts toward the win rate
export type PartialScoring = "zero" | "half" | "exclude";

// How a settled case counts toward the win rate: left out, a win when the
// negotiator score is 70 or more (else a loss), or always a win
export type SettledScoring = "exclude" | "score" | "win";

// How the verdict went for the user, decided once after the verdict;
// "settled" when the court recorded a compromise (not a win or a loss)
export type CaseOutcome = "won" | "lost" | "partial" | "settled";

export interface OutcomeCounts {
  wins: number;
  losses: number;
  partials: number;
  settled: number; // in win_rate only as settled_scoring says
  total: number;
  win_rate: number; // percent, 0-100
}

interface RecentOutcome {
  cnr: string;
  title: string;
  role: Roles;
  outcome: CaseOutcome;
  decided_at: string;
}

interface MonthlyOutcomes {
  month: string; // "YYYY-MM"
  wins: number;
  losses: number;
  partials: number;
  settled: number;
}

interface ActivityStats {
  arguments: number;
  witnesses_examined: number;
  conferences_held: number;
  evidence: number;
  avg_arguments: number;
  avg_witnesses_examined: number;
  avg_conferences_held: number;
  avg_evidence: number;
}

// The negotiator rating: the average of the last ten negotiation scores
export interface NegotiatorStats {
  score: number | null;
  tier: string | null;
  scored: number; // every case with a negotiation score
  factors: Partial<Record<"terms" | "closed" | "offers" | "conditions", number>>;
  deals: number; // scored negotiations that ended in a deal the court recorded
  offers_to_deal: number | null;
  days_to_settle: number | null; // first offer to the last signature
  pending: number; // decided cases with talks, not scored yet
}

export interface UserStats {
  partial_scoring: PartialScoring;
  settled_scoring: SettledScoring;
  overall: OutcomeCounts;
  as_plaintiff: OutcomeCounts;
  as_defendant: OutcomeCounts;
  current_streak: number;
  best_streak: number;
  recent_form: RecentOutcome[];
  monthly: MonthlyOutcomes[];
  activity: ActivityStats;
  pending_outcomes: number;
  negotiator: NegotiatorStats;
}

// Case types
export enum CaseStatus {
  NOT_STARTED = "not started",
  ACTIVE = "active",
  ADJOURNED = "adjourned",
  RESOLVED = "resolved",
}

export enum CourtroomProceedingsEventType {
  OPENING_STATEMENT = "opening_statement",
  ARGUMENT = "user_argument",
  AI_ARGUMENT = "ai_argument",
  WITNESS_CALLED = "witness_called",
  WITNESS_DISMISSED = "witness_dismissed",
  WITNESS_EXAMINED_Q = "witness_examined_q",
  WITNESS_EXAMINED_A = "witness_examined_a",
  SYSTEM_MESSAGE = "system_message",
  CLOSING_STATEMENT = "closing_statement",
  LEAVE_REQUEST = "leave_request",
  OBJECTION = "objection",
  RULING = "ruling",
  SETTLEMENT = "settlement", // the court rules on a compromise put before it
}

export interface CourtroomProceedingsEvent {
  id?: string;
  type: CourtroomProceedingsEventType;
  timestamp: string;
  content: string;
  speaker_role?: string;
  speaker_name?: string;
  witness_id?: string;
  question?: string;
  answer?: string;
  // Exhibits the speaker relied on (EvidenceItem.exhibit_ref)
  exhibit_refs?: string[];
  objection?: { target_id: string; grounds: string; details: string } | null;
  sustained?: boolean | null; // on rulings; on settlement rulings, granted
  tag?: string | null; // on settlement lines: the State's stand, the ruling, "Unsure"
  // A sustained objection struck it from the record, or withdrew the question
  struck?: "struck" | "withdrawn" | null;
}

interface PendingLeave {
  event_id: string;
  witness_id: string;
  witness_name: string;
  called_by: string;
}

type EvidenceMediaStatus = "not_requested" | "pending" | "generated" | "failed";

export interface EvidenceItem {
  id: string;
  exhibit_ref: string;
  title: string;
  evidence_type: string;
  description: string;
  source?: string | null;
  image_prompt?: string | null;
  image_url?: string | null;
  image_public_id?: string | null;
  media_status: EvidenceMediaStatus;
  // "<party_id>:<message_id>" for an interview answer, a proceedings event id for testimony
  origin_id?: string | null;
  /** the side whose AI counsel logged it in court; null when the user did */
  extracted_by?: string | null;
  /** from the user's own interviews: privileged, hidden from the court until cited there */
  private?: boolean;
}

// Settling out of court. The talks are without prejudice: the court deciding the
// merits never sees them, only the agreed terms once they are put before it.
export type SettlementStatus =
  | "negotiating" // offers going back and forth
  | "agreed" // both sides agree; the deed is drafted
  | "signed" // every signatory has signed the deed
  | "filed" // filed; the hearing is listed
  | "adjourned" // the court put the hearing off to another date
  | "recorded" // the court accepted it; the case is over
  | "refused" // the court refused it; the case goes on to be heard on merits
  | "rejected" // the other side walked away
  | "withdrawn"; // the user called it off

// How the case can be settled: quash = s.528 BNSS (High Court), compound = s.359 BNSS
// (trial court), plea = plea bargaining, ss.289–295 BNSS; none = no route open.
export type SettlementRoute = "quash" | "compound" | "plea" | "none";

export interface RouteItem {
  section: string; // "§ 318(4)"
  title: string;
  note: string;
}

export interface SettlementCondition {
  key: string;
  label: string; // the offer toggle
  short: string; // in the negotiation log
  clause: string; // in the deed
  favours: "accused" | "complainants";
}

/** Worked out once from the case file. */
export interface SettlementProfile {
  route: SettlementRoute;
  title: string;
  court: string;
  offences: RouteItem[];
  must: string;
  must_detail: string;
  footnote: string;
  closed: RouteItem[]; // route "none": why each route is shut
  conditions: SettlementCondition[];
  accused: string;
  accused_side: "plaintiff" | "defendant";
  complainants: string[]; // the lead first
  claim: number; // rupees in dispute
}

export const INSTALMENTS = [1, 2, 3, 4, 6] as const;
export const MONTHS = [3, 6, 9, 12, 18] as const;

export interface SettlementTerms {
  amount: number; // rupees
  instalments: (typeof INSTALMENTS)[number];
  months: (typeof MONTHS)[number];
  interest: number; // per cent a year, 0–18
  conditions: string[]; // SettlementCondition keys
}

/** The settlement desk as the server sees it: the route, the latest attempt, and what is allowed. */
export interface SettlementView {
  profile: SettlementProfile;
  attempt: Settlement | null;
  attempts: number;
  closed: string | null; // why no move can be made now (court sitting, case closed…)
  can_start: boolean;
  start_blocked: string | null; // why talks can't open now
  max_offers: number;
  deed: SettlementDeed | null; // once terms are agreed
}

/** A line of the settlement hearing after counsel's submission. */
export interface HearingLine {
  kind: "speech" | "question" | "answer" | "system";
  role: "court" | "other" | "state" | "complainant" | "accused" | "system";
  who: string;
  tag: string; // the State's stand: "No objection", "Opposes", "Agrees"
  unsure: boolean;
  text: string;
}

export interface SettlementHearing {
  submission: string;
  lines: HearingLine[];
  checks: { label: string; state: "ok" | "unsure" | "fail"; text: string }[];
  outcome: "granted" | "refused" | "adjourned";
  judge: string;
  order: string[];
  next_date: string | null; // YYYY-MM-DD
  held_at: string;
}

export interface SettlementPayment {
  amount: number; // interest included on the last
  due: string; // YYYY-MM-DD
  paid_at: string | null;
  remedy: "recall" | "notice" | "recover" | null;
  remedy_at: string | null;
  // As of today. Simulated orders add "defaulted" (unpaid after notice) and "held" (after a default).
  status: "paid" | "late" | "due" | "upcoming" | "missed" | "defaulted" | "held";
  paid_on?: string | null; // simulated orders: the day it was paid
  notice_until?: string | null; // simulated orders, a missed instalment: the last day to pay it
}

/** How the user negotiated, judged once the case is decided. */
export interface NegotiationAnalysis {
  score: number; // 0-100, the factors weighted
  tier: string;
  factors: { key: "terms" | "closed" | "offers" | "conditions"; label: string; weight: number; value: number; text: string }[];
  best: SettlementTerms | null; // the best terms the other side would likely have taken
  best_text: string;
  call: "right" | "mixed" | "wrong"; // settling rather than fighting it out
  call_text: string;
  notes: { kind: "worked" | "improve"; text: string }[];
  review: string; // Markdown
  analyzed_at: string;
}

/** The compromise deed (or plea-bargaining report) drawn up from the agreed terms. */
export interface SettlementDeed {
  title: string;
  header: string[]; // court, then case and FIR numbers
  parties: string;
  clauses: string[];
  signatories: { name: string; role: string; side: "user" | "other" }[];
  file_label: string;
}

export interface SettlementEntry {
  id: string;
  by: "user" | "ai";
  kind: "offer" | "counter" | "accept" | "refuse" | "ended";
  terms: SettlementTerms | null;
  note: string;
  at: string;
}

export interface Settlement {
  id: string;
  status: SettlementStatus;
  entries: SettlementEntry[];
  agreed: SettlementTerms | null;
  signatures: Record<string, string>; // signer → signed at
  filed_at: string | null;
  hearing_date: string | null; // YYYY-MM-DD
  hearing: SettlementHearing | null;
  payments: SettlementPayment[];
  user_pays?: boolean; // the user acts for the accused, who pays
  // "days": the accused pays on their own, an instalment a day; "months": orders before that.
  pace?: "days" | "months";
  stage?: "paying" | "notice" | "defaulted" | "closed"; // simulated orders
  closed_on?: string | null; // simulated orders: the day the last instalment was paid
  ruling: string | null; // the court's ruling, as said in court
  court_order: string | null; // Markdown
  started_at: string;
  ended_at: string | null;
}

interface Argument {
  id?: string; // Added optional id field
  type: string;
  content: string;
  user_id: string | null;
  user_role: Roles;
  timestamp?: string;
}

export interface Case {
  cnr: string;
  // False when another device is running this hearing (view-only here)
  hearing_controlled_here?: boolean;
  status: CaseStatus;
  title: string;
  case_number?: string;
  court?: string;
  case_text?: string; // Add the raw markdown text field
  plaintiff_arguments: Argument[];
  defendant_arguments: Argument[];
  verdict: string | null;
  outcome?: CaseOutcome | null;
  created_at: string;
  role?: Roles; // User's role for this specific case (backwards compat)
  user_role?: Roles; // User's role in the case
  ai_role?: Roles; // AI's role in the case
  session_args_at_start?: number; // User args count when session became ACTIVE
  courtroom_proceedings?: CourtroomProceedingsEvent[];
  is_ai_examining?: boolean;
  current_witness_id?: string;
  evidence?: EvidenceItem[];
  // The other side asked leave to call a witness; the hearing waits for the user
  pending_leave?: PendingLeave | null;
  /** AI counsel's objection to the user's turn while it is heard: the ruling joins once the court gives it */
  ai_objection_live?: (Partial<AIObjection> & { kind: string; grounds: string }) | null;
  reported?: string[]; // AI responses this user already reported
  settlements?: Settlement[]; // attempts to settle out of court, oldest first
  settlement_profile?: SettlementProfile | null; // the route, once worked out
  settlement_result?: "quashed" | "compounded" | "plea" | null; // how a settled case ended
}

export interface RegisterFormData {
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  confirm_adult: boolean;
  google_signup_token?: string;
  profile_photo_url?: string;
}

export interface LoginFormData {
  email: string;
  password: string;
}

export interface CaseGenerationFormData {
  sections_involved: number;
  section_numbers: number[];
}

export type FeedbackCategory =
  | "general"
  | "courtroom"
  | "case_generation"
  | "user_interface"
  | "performance"
  | "bug_report"
  | "feature_request"
  | "account_support"
  | "account_recovery"
  | "legal_inquiry"
  | "other";

export interface ContactFormData {
  feedback_category: FeedbackCategory;
  message: string;
  /** Guests only: who to reply to. */
  name?: string;
  email?: string;
  /** Account recovery only. */
  account_identifier?: string;
  deleted_on?: string;
  /** Guests only: Cloudflare Turnstile's token. */
  turnstile_token?: string;
}

export type ServiceState = "ok" | "degraded" | "outage";

export interface SystemStatus {
  updated_at: string;
  components: { id: string; status: ServiceState }[];
  incidents: {
    id: string;
    title: string;
    impact: "degraded" | "outage";
    status: string;
    resolved: boolean;
    updates: { at: string; kind: string; text: string }[];
  }[];
}

// Parties types
export enum PersonRole {
  APPLICANT = "applicant",
  NON_APPLICANT = "non_applicant",
}

export interface PersonInvolved {
  id: string;
  name: string;
  role: PersonRole;
  occupation?: string;
  age?: number;
  address?: string;
  bio?: string;
  can_chat: boolean;
  reliability?: number | null; // developers only: the chance (0-1) they pay an instalment on time
}

export interface ChatMessage {
  id: string;
  sender: "user" | "person";
  content: string;
  timestamp: string;
  /** exhibits pinned to the question */
  exhibit_refs?: string[];
}

/** AI counsel's objection to the user's argument or question, and the court's ruling. */
export interface AIObjection {
  grounds: string;
  sustained: boolean;
  ruling: string;
}

export interface ArgumentResponse {
  /** null when AI counsel's objection was sustained: the argument is struck and the floor is the user's again */
  ai_counter_argument?: string | null;
  ai_counter_role?: string;
  ai_objection?: AIObjection | null;
  court_adjourns?: boolean;
  adjournment_message?: string;
}

export interface WitnessExaminationResponse {
  question: string;
  /** null when AI counsel's objection was sustained: the question is withdrawn */
  answer: string | null;
  ai_objection?: AIObjection | null;
}

// Witness types
interface ExaminationItem {
  id: string;
  examiner: string;
  question: string;
  answer: string;
  objection?: string;
  objection_ruling?: string;
  timestamp: string;
  phase?: "chief" | "cross" | "re_exam" | null;
}

export interface CurrentWitnessResponse {
  has_witness: boolean;
  witness_id?: string;
  witness_name?: string;
  witness_role?: string;
  called_by?: string;
  examination_history: ExaminationItem[];
  is_ai_examining?: boolean;
  phase?: "chief" | "cross" | "re_exam";
  next_examiner?: string; // whose turn it is: plaintiff or defendant
}
