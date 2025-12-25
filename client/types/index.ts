// User types
export enum Roles {
  PLAINTIFF = "plaintiff",
  DEFENDANT = "defendant",
  NOT_STARTED = "not started",
}

export interface User {
  first_name: string;
  last_name: string;
  email: string;
  date_of_birth: Date;
  phone_number: string;
}

// Case types
export enum CaseStatus {
  NOT_STARTED = "not started",
  ACTIVE = "active",
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
  role?: Roles; // User's role for this specific case
}

export interface CaseHistory {
  plaintiff_arguments: Argument[];
  defendant_arguments: Argument[];
  verdict: string | null;
}

// Form types
export interface RegisterFormData {
  first_name: string;
  last_name: string;
  date_of_birth: Date;
  phone_number: string;
  email: string;
  password: string;
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
