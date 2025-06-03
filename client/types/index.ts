// User types
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

export interface Petitioner {
  name: string;
  details: string;
  address: string;
}

export interface Respondent {
  name: string;
  details: string;
  address: string;
}

export interface Witness {
  name: string;
  testimony: string;
}

export interface Evidence {
  title: string;
  description: string;
}

export interface Argument {
  id?: string; // Added optional id field
  type: string;
  content: string;
  user_id: string | null;
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

export interface ContactFormData {
  first_name: string;
  last_name: string;
  email: string;
  phone_number: string;
  message: string;
}
