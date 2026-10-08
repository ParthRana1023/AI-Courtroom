// User types
export enum Roles {
  PLAINTIFF = "plaintiff",
  DEFENDANT = "defendant",
  NOT_STARTED = "not_started",
}

// Location types
export interface LocationSearchResult {
  type: "city" | "state" | "country";
  name: string;
  city: string | null;
  state: string | null;
  state_iso2: string | null;
  country: string;
  country_iso2: string;
  phone_code: string;
}

export interface IndianState {
  state_iso2: string;
  state_name: string;
  high_court: string;
}

export type CaseLocationPreference =
  | "user_location"
  | "specific_state"
  | "random";

export type AuthMethod = "email" | "phone" | "google";

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
  is_developer?: boolean; // may turn on developer mode (server allowlist)
}

// How a partly successful case counts toward the win rate
export type PartialScoring = "zero" | "half" | "exclude";

// How the verdict went for the user, decided once after the verdict
export type CaseOutcome = "won" | "lost" | "partial";

export interface OutcomeCounts {
  wins: number;
  losses: number;
  partials: number;
  total: number;
  win_rate: number; // percent, 0-100
}

export interface RecentOutcome {
  cnr: string;
  title: string;
  role: Roles;
  outcome: CaseOutcome;
  decided_at: string;
}

export interface MonthlyOutcomes {
  month: string; // "YYYY-MM"
  wins: number;
  losses: number;
  partials: number;
}

export interface ActivityStats {
  arguments: number;
  witnesses_examined: number;
  conferences_held: number;
  evidence: number;
  avg_arguments: number;
  avg_witnesses_examined: number;
  avg_conferences_held: number;
  avg_evidence: number;
}

export interface UserStats {
  partial_scoring: PartialScoring;
  overall: OutcomeCounts;
  as_plaintiff: OutcomeCounts;
  as_defendant: OutcomeCounts;
  current_streak: number;
  best_streak: number;
  recent_form: RecentOutcome[];
  monthly: MonthlyOutcomes[];
  activity: ActivityStats;
  pending_outcomes: number;
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
}

export interface CaseListItem {
  id: string;
  cnr: string;
  title: string;
  created_at: string;
  status: CaseStatus;
  outcome?: CaseOutcome | null;
}

export type EvidenceMediaStatus =
  | "not_requested"
  | "pending"
  | "generated"
  | "failed";

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
}

export interface Argument {
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
}

// Form types
export type Gender = "male" | "female" | "others" | "prefer-not-to-say";

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
  | "legal_inquiry"
  | "other";

export interface ContactFormData {
  feedback_category: FeedbackCategory;
  message: string;
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
}

export interface ChatMessage {
  id: string;
  sender: "user" | "person";
  content: string;
  timestamp: string;
}

export interface PartiesListResponse {
  parties: PersonInvolved[];
  user_role: string;
  can_access_courtroom: boolean;
  is_in_courtroom: boolean;
  case_status: string;
}

// Witness types
export interface ExaminationItem {
  id: string;
  examiner: string;
  question: string;
  answer: string;
  objection?: string;
  objection_ruling?: string;
  timestamp: string;
}

export interface WitnessInfo {
  id: string;
  name: string;
  role: string;
  has_testified: boolean;
}

export interface CurrentWitnessResponse {
  has_witness: boolean;
  witness_id?: string;
  witness_name?: string;
  witness_role?: string;
  called_by?: string;
  examination_history: ExaminationItem[];
  is_ai_examining?: boolean;
}

export interface WitnessExaminationResponse {
  witness_id: string;
  witness_name: string;
  question: string;
  answer: string;
  examination_id: string;
  timestamp: string;
  ai_followup?: string;
}

