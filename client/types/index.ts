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

export interface User {
  first_name: string;
  last_name: string;
  email: string;
  date_of_birth: Date;
  phone_number: string;
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
}

// Case types
export enum CaseStatus {
  NOT_STARTED = "not started",
  ACTIVE = "active",
  ADJOURNED = "adjourned",
  RESOLVED = "resolved",
}

export interface CaseListItem {
  id: string;
  cnr: string;
  title: string;
  created_at: string;
  status: CaseStatus;
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
  status: CaseStatus;
  title: string;
  case_number?: string;
  court?: string;
  case_text?: string; // Add the raw markdown text field
  plaintiff_arguments: Argument[];
  defendant_arguments: Argument[];
  verdict: string | null;
  created_at: string;
  role?: Roles; // User's role for this specific case (backwards compat)
  user_role?: Roles; // User's role in the case
  ai_role?: Roles; // AI's role in the case
  session_args_at_start?: number; // User args count when session became ACTIVE
}

export interface CaseHistory {
  plaintiff_arguments: Argument[];
  defendant_arguments: Argument[];
  verdict: string | null;
}

// Form types
export type Gender = "male" | "female" | "others" | "prefer-not-to-say";

export interface RegisterFormData {
  first_name: string;
  last_name: string;
  date_of_birth: Date;
  phone_number: string;
  email: string;
  password: string;
  gender?: Gender;
  // Location fields
  city: string;
  state: string;
  state_iso2: string;
  country: string;
  country_iso2: string;
  phone_code?: string;
}

export interface LoginFormData {
  email: string;
  password: string;
}

export interface OtpFormData {
  otp: string;
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

export interface ChatResponse {
  user_message: ChatMessage;
  party_response: ChatMessage;
}

export interface ChatHistoryResponse {
  person_id: string;
  person_name: string;
  messages: ChatMessage[];
}
