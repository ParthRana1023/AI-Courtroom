import axios, { type AxiosError } from "axios";
import type {
  ArgumentResponse,
  CaseGenerationFormData,
  ContactFormData,
  DeviceSession,
  LoginFormData,
  NotificationPrefs,
  PartialScoring,
  RegisterFormData,
  Settlement,
  SystemStatus,
  User,
  UserStats,
  WitnessExaminationResponse,
} from "@/types";

import { getCookie, setAuthTokenCookie, clearAuthTokenCookie, COOKIE_NAMES } from "./cookies";
import { getLogger } from "./logger";
import { LLM_TRACE_HEADER, recordLLMTrace } from "./llm-trace";

// Initialize logger for API calls
const logger = getLogger("api");

type RegistrationPayload = RegisterFormData;

interface VerifyRegistrationPayload {
  user_data: RegistrationPayload;
  otp: string;
  remember_me: boolean;
}

type LoginPayload = LoginFormData & {
  remember_me: boolean;
};

interface VerifyLoginPayload {
  email: string;
  otp: string;
  remember_me: boolean;
}

export interface PhonePayload {
  phone_code: string;
  phone_number: string;
  purpose: "login" | "register";
  first_name?: string;
  last_name?: string;
  confirm_adult?: boolean;
}

/**
 * Helper function to log API errors in a structured way
 */
function logApiError(error: unknown, context?: string): void {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError;
    logger.error(context || "API request failed", axiosError, {
      status: axiosError.response?.status,
      statusText: axiosError.response?.statusText,
      url: axiosError.config?.url,
      method: axiosError.config?.method?.toUpperCase(),
      data: axiosError.response?.data,
    });
  } else {
    logger.error(context || "Unexpected error", error as Error);
  }
}

// Create axios instance with base URL from environment variables
const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
logger.info("API initialized", { baseUrl: apiBaseUrl });

const api = axios.create({
  baseURL: apiBaseUrl,
  headers: {
    "Content-Type": "application/json",
  },
});

// Add request interceptor to include auth token in requests
api.interceptors.request.use(
  (config) => {
    // Try to get token from localStorage first, then from cookie
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("token") ?? getCookie(COOKIE_NAMES.AUTH_TOKEN);

      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }

    return config;
  },
  (error) => Promise.reject(error),
);

// Add response interceptor to handle common errors
api.interceptors.response.use(
  (response) => {
    recordLLMTrace(response.headers[LLM_TRACE_HEADER], response.config.method, response.config.url, response.status);
    return response;
  },
  (error: AxiosError) => {
    if (error.response) {
      recordLLMTrace(error.response.headers[LLM_TRACE_HEADER], error.config?.method, error.config?.url, error.response.status);
    }
    // Handle unauthorized errors (401)
    if (error.response?.status === 401) {
      // Check if the error is from the login initiation endpoint
      if (error.config?.url?.includes("/auth/login/initiate") || error.config?.url?.includes("/auth/logout")) {
        // Do not redirect for login initiation 401 errors, let the component handle it
        return Promise.reject(error);
      }
      if (typeof window !== "undefined") {
        localStorage.removeItem("token");
        clearAuthTokenCookie();
        window.location.href = "/login?session=expired";
      }
    }
    return Promise.reject(error);
  },
);

// Helper function to set token in both localStorage and cookie
export const setAuthToken = (token: string, rememberMe = false) => {
  if (typeof window !== "undefined") {
    localStorage.setItem("token", token);
    setAuthTokenCookie(token, rememberMe);
  }
};

// Auth API calls
export const authAPI = {
  register: async (userData: RegistrationPayload) => {
    try {
      const response = await api.post("/auth/register/initiate", userData);
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const serverError = error;
        if (serverError.response?.status === 429) {
          throw new Error(serverError.response.data.detail || "Too many codes requested. Please try again later.", { cause: error });
        }
      }
      logApiError(error, "Registration initiation failed");
      throw error;
    }
  },

  verifyRegistration: async (data: VerifyRegistrationPayload) => {
    try {
      const response = await api.post("/auth/register/verify", data);
      if (response.data.access_token) {
        setAuthToken(response.data.access_token);
      }
      return response.data;
    } catch (error) {
      logApiError(error, "Registration verification failed");
      throw error;
    }
  },

  login: async (loginData: LoginPayload) => {
    try {
      const response = await api.post("/auth/login/initiate", loginData);
      return response.data;
    } catch (error) {
      logApiError(error, "Login initiation failed");
      throw error;
    }
  },

  verifyLogin: async (data: VerifyLoginPayload) => {
    try {
      logger.debug("Verifying login");
      const response = await api.post("/auth/login/verify", data);
      if (response.data.access_token) {
        // Set token in both localStorage and cookie
        setAuthToken(response.data.access_token, data.remember_me);
      }
      return response.data;
    } catch (error) {
      logApiError(error, "Login verification failed");
      throw error;
    }
  },

  getProfile: async () => {
    try {
      const response = await api.get("/auth/profile");
      return response.data;
    } catch (error) {
      logApiError(error, "Failed to get profile");
      throw error;
    }
  },

  logout: async () => {
    try {
      // Lets the server adjourn any hearing left running in this session.
      await api.post("/auth/logout");
    } catch (error) {
      logApiError(error, "Logout notification failed");
    } finally {
      if (typeof window !== "undefined") {
        localStorage.removeItem("token");
        clearAuthTokenCookie();
      }
    }
  },

  // Google OAuth login
  googleLogin: async (data: { credential?: string; code?: string; state?: string; rememberMe?: boolean }) => {
    try {
      const { credential, code, state, rememberMe = false } = data;
      const response = await api.post("/auth/google", {
        credential,
        code,
        state,
        remember_me: rememberMe,
      });
      if (response.data.access_token) {
        setAuthToken(response.data.access_token, rememberMe);
      }
      return response.data;
    } catch (error) {
      logApiError(error, "Google login failed");
      throw error;
    }
  },

  // Phone sign-in / sign-up (only when NEXT_PUBLIC_PHONE_AUTH_ENABLED)
  sendPhoneCode: async (data: PhonePayload) => {
    const response = await api.post("/auth/phone/send-otp", data);
    return response.data;
  },

  verifyPhoneCode: async (data: PhonePayload & { otp: string; remember_me: boolean }) => {
    const response = await api.post("/auth/phone/verify", data);
    setAuthToken(response.data.access_token, data.remember_me);
    return response.data;
  },

  // Forgot password: emails a link to /forgot-password?token=…
  forgotPassword: async (email: string) => {
    const response = await api.post("/auth/password/forgot", { email });
    return response.data;
  },

  resetPassword: async (token: string, password: string) => {
    const response = await api.post("/auth/password/reset", { token, password });
    return response.data;
  },

  // Get OAuth State
  getOAuthState: async () => {
    try {
      const response = await api.get("/auth/oauth/state");
      return response.data.state;
    } catch (error) {
      logApiError(error, "Failed to get OAuth state");
      throw error;
    }
  },

  // Check if user is authenticated
  isAuthenticated: () => {
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("token");
      if (token) return true;

      // Check cookies as fallback
      const cookies = document.cookie.split(";");
      const tokenCookie = cookies.find((cookie) => cookie.trim().startsWith("token="));
      return !!tokenCookie;
    }
    return false;
  },

  // Upload profile photo
  uploadProfilePhoto: async (file: File) => {
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await api.post("/auth/profile/photo", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });
      logger.info("Profile photo uploaded");
      return response.data;
    } catch (error) {
      logApiError(error, "Failed to upload profile photo");
      if (axios.isAxiosError(error) && error.response) {
        throw new Error(error.response.data.detail || "Failed to upload photo", { cause: error });
      }
      throw error;
    }
  },

  // Delete profile photo
  deleteProfilePhoto: async () => {
    try {
      const response = await api.delete("/auth/profile/photo");
      logger.info("Profile photo deleted");
      return response.data;
    } catch (error) {
      logApiError(error, "Failed to delete profile photo");
      if (axios.isAxiosError(error) && error.response) {
        throw new Error(error.response.data.detail || "Failed to delete photo", { cause: error });
      }
      throw error;
    }
  },

  // Update profile
  // Only the fields sent change; an optional one sent as null or "" is cleared.
  updateProfile: async (data: {
    first_name?: string;
    last_name?: string;
    nickname?: string | null;
    gender?: string | null;
    date_of_birth?: string | null;
    email?: string | null;
    phone_code?: string | null;
    phone_number?: string | null;
    city?: string | null;
    state?: string | null;
    state_iso2?: string | null;
    country?: string | null;
    country_iso2?: string | null;
  }) => {
    try {
      const response = await api.put("/auth/profile", data);
      logger.info("Profile updated");
      return response.data;
    } catch (error) {
      logApiError(error, "Failed to update profile");
      if (axios.isAxiosError(error) && error.response) {
        throw new Error(error.response.data.detail || "Failed to update profile", { cause: error });
      }
      throw error;
    }
  },

  updateRagPreference: async (data: { rag_enabled: boolean }) => {
    try {
      const response = await api.put("/auth/profile/rag-preference", data);
      logger.info("RAG preference updated");
      return response.data;
    } catch (error) {
      logApiError(error, "Failed to update RAG preference");
      if (axios.isAxiosError(error) && error.response) {
        throw new Error(error.response.data.detail || "Failed to update RAG preference", { cause: error });
      }
      throw error;
    }
  },
  updateStatsPreference: async (data: { partial_scoring: PartialScoring }) => {
    try {
      const response = await api.put("/auth/profile/stats-preference", data);
      logger.info("Stats preference updated");
      return response.data;
    } catch (error) {
      logApiError(error, "Failed to update stats preference");
      if (axios.isAxiosError(error) && error.response) {
        throw new Error(error.response.data.detail || "Failed to update stats preference", { cause: error });
      }
      throw error;
    }
  },

  getProfileStats: async (): Promise<UserStats> => {
    try {
      const response = await api.get("/auth/profile/stats");
      return response.data;
    } catch (error) {
      logApiError(error, "Failed to get profile stats");
      throw error;
    }
  },
};

// Account and security (Settings). Errors keep the server's `detail` for getErrorDetail.
export const accountAPI = {
  changePassword: async (current_password: string, new_password: string): Promise<{ signed_out: number }> =>
    (await api.put("/auth/password", { current_password, new_password })).data,
  sessions: async (): Promise<DeviceSession[]> => (await api.get("/auth/sessions")).data.sessions,
  signOutOthers: async (): Promise<{ signed_out: number }> => (await api.post("/auth/sessions/revoke-others")).data,
  /** Without a choice, different emails come back as `needs_choice` with a token for the second call. */
  linkGoogle: async (body: {
    credential?: string;
    code?: string;
    state?: string;
    link_token?: string;
    use_google_email?: boolean;
  }): Promise<User | { needs_choice: true; google_email: string; link_token: string }> => (await api.post("/auth/google/link", body)).data,
  unlinkGoogle: async (): Promise<User> => (await api.delete("/auth/google/link")).data,
  updateNotifications: async (prefs: NotificationPrefs): Promise<User> =>
    (await api.put("/auth/profile/notification-preference", prefs)).data,
  requestExport: async (): Promise<{ requested_at: string; email: string }> => (await api.post("/auth/export")).data,
  sendDeleteCode: async (): Promise<{ sent_to: string }> => (await api.post("/auth/account/delete-code")).data,
  /** A phone account adds an email by entering the code sent to it. */
  sendEmailCode: async (email: string): Promise<{ sent_to: string }> => (await api.post("/auth/profile/email/send-code", { email })).data,
  verifyEmailCode: async (code: string): Promise<User> => (await api.post("/auth/profile/email/verify", { code })).data,
  deleteAccount: async (proof: { password?: string; code?: string }): Promise<{ recoverable_until: string }> =>
    (await api.delete("/auth/account", { data: { ...proof, confirm: "DELETE" } })).data,
};

// Case API calls
export const caseAPI = {
  listCases: async () => {
    try {
      const response = await api.get("/cases");
      logger.debug("Cases fetched", {
        count: Array.isArray(response.data) ? response.data.length : response.data?.cases?.length,
      });

      // Make sure we're returning the actual array of cases
      if (response.data && response.data.cases) {
        return response.data.cases;
      } else if (Array.isArray(response.data)) {
        return response.data;
      } else {
        logger.warn("Unexpected API response format in listCases", {
          data: response.data,
        });
        return [];
      }
    } catch (error) {
      logApiError(error, "Failed to list cases");
      throw error;
    }
  },

  getCase: async (cnr: string) => {
    try {
      const response = await api.get(`/cases/${cnr}`);
      return response.data;
    } catch (error) {
      logApiError(error, "Failed to get case");
      throw error;
    }
  },

  getCaseHistory: async (caseId: string) => {
    try {
      const response = await api.get(`/cases/${caseId}/history`);
      return response.data;
    } catch (error) {
      logApiError(error, "Failed to get case history");
      throw error;
    }
  },

  getEvidence: async (cnr: string) => {
    try {
      const response = await api.get(`/cases/${cnr}/evidence`);
      return response.data;
    } catch (error) {
      logApiError(error, "Failed to get case evidence");
      throw error;
    }
  },

  // Only a party's reply or a witness's answer can become evidence; the server
  // reads the text itself from the case.
  extractEvidence: async (cnr: string, target: { party_id: string; message_id: string } | { event_id: string }) => {
    try {
      const response = await api.post(`/cases/${cnr}/evidence/extract`, target);
      return response.data;
    } catch (error) {
      logApiError(error, "Failed to extract case evidence");
      throw error;
    }
  },

  generateMissingEvidenceImages: async (cnr: string) => {
    try {
      const response = await api.post(`/cases/${cnr}/evidence/images/generate-missing`);
      return response.data;
    } catch (error) {
      logApiError(error, "Failed to generate evidence images");
      throw error;
    }
  },

  regenerateEvidenceImage: async (cnr: string, evidenceId: string) => {
    try {
      const response = await api.post(`/cases/${cnr}/evidence/${evidenceId}/image/regenerate`);
      logger.info("Evidence image regenerated", { cnr, evidenceId });
      return response.data;
    } catch (error) {
      logApiError(error, "Failed to regenerate evidence image");
      throw error;
    }
  },

  analyzeCase: async (caseId: string) => {
    try {
      logger.info("Analyzing case", { caseId });
      const response = await api.post(`/cases/${caseId}/analyze-case`);
      logger.info("Case analysis complete", { caseId });
      return response.data;
    } catch (error) {
      logApiError(error, "Failed to analyze case");
      throw error;
    }
  },

  takeOverHearing: async (cnr: string) => {
    try {
      const response = await api.post(`/cases/${cnr}/take-over`);
      logger.info("Hearing taken over on this device", { cnr });
      return response.data;
    } catch (error) {
      logApiError(error, "Failed to take over hearing");
      throw error;
    }
  },

  // reason "limit": adjourned because the day's last argument was used;
  // "settlement": adjourned at counsel's request to explore a settlement
  updateCaseStatus: async (cnr: string, status: string, reason?: "limit" | "settlement") => {
    try {
      const response = await api.put(`/cases/${cnr}/status`, { status, reason });
      logger.info("Case status updated", { cnr, status });
      return response.data;
    } catch (error) {
      logApiError(error, "Failed to update case status");
      throw error;
    }
  },

  updateCaseRoles: async (cnr: string, user_role: string, ai_role: string) => {
    try {
      const response = await api.put(`/cases/${cnr}/roles`, {
        user_role,
        ai_role,
      });
      logger.info("Case roles updated", { cnr, user_role, ai_role });
      return response.data;
    } catch (error) {
      logApiError(error, "Failed to update case roles");
      throw error;
    }
  },

  generatePlaintiffOpening: async (cnr: string) => {
    try {
      logger.info("Generating plaintiff opening", { cnr });
      const response = await api.post(`/cases/${cnr}/generate-plaintiff-opening`);
      return response.data;
    } catch (error) {
      logApiError(error, "Failed to generate plaintiff opening");
      throw error;
    }
  },

  generateCase: async (caseData: CaseGenerationFormData) => {
    try {
      logger.info("Generating new case");
      const response = await api.post("/cases/generate", caseData);
      logger.info("Case generated successfully");
      return response.data;
    } catch (error) {
      logApiError(error, "Failed to generate case");
      throw error;
    }
  },

  deleteCase: async (cnr: string) => {
    try {
      const response = await api.delete(`/cases/${cnr}`);
      logger.info("Case deleted", { cnr });
      return response.data;
    } catch (error) {
      logApiError(error, "Failed to delete case");
      throw error;
    }
  },

  listDeletedCases: async () => {
    try {
      const response = await api.get("/cases/deleted/list");
      return Array.isArray(response.data) ? response.data : [];
    } catch (error) {
      logApiError(error, "Failed to list deleted cases");
      throw error;
    }
  },

  restoreCase: async (cnr: string) => {
    try {
      const response = await api.post(`/cases/${cnr}/restore`);
      logger.info("Case restored", { cnr });
      return response.data;
    } catch (error) {
      logApiError(error, "Failed to restore case");
      throw error;
    }
  },

  // Permanently delete every archived case
  emptyArchive: async (): Promise<{ deleted: number }> => {
    const response = await api.delete("/cases/deleted/all");
    return response.data;
  },

  permanentDeleteCase: async (cnr: string) => {
    try {
      const response = await api.delete(`/cases/${cnr}/permanent`);
      logger.info("Case permanently deleted", { cnr });
      return response.data;
    } catch (error) {
      logApiError(error, "Failed to permanently delete case");
      throw error;
    }
  },
};

// Argument API calls
export const argumentAPI = {
  submitArgument: async (caseCnr: string, role: "plaintiff" | "defendant", argument: string, exhibitRefs: string[] = []) => {
    try {
      logger.debug("Submitting argument", {
        caseCnr,
        role,
        argumentLength: argument.length,
      });
      const response = await api.post<ArgumentResponse>(`/cases/${caseCnr}/arguments`, {
        role,
        argument,
        exhibit_refs: exhibitRefs,
      });
      logger.info("Argument submitted", { caseCnr, role });
      return response.data;
    } catch (error) {
      logApiError(error, "Failed to submit argument");
      throw error;
    }
  },

  submitClosingStatement: async (caseCnr: string, role: string, statement: string) => {
    try {
      logger.debug("Submitting closing statement", { caseCnr, role });
      const response = await api.post(`/cases/${caseCnr}/closing-statement`, {
        role,
        statement,
      });
      logger.info("Closing statement submitted", { caseCnr, role });
      return response.data;
    } catch (error) {
      logApiError(error, "Failed to submit closing statement");
      throw error;
    }
  },
};

// Objections and reports in the courtroom
export const courtroomAPI = {
  raiseObjection: async (
    cnr: string,
    targetId: string,
    grounds: string,
    details: string,
  ): Promise<{ sustained: boolean; ruling: string }> => {
    const response = await api.post(`/cases/${cnr}/objections`, {
      target_id: targetId,
      grounds,
      details,
    });
    return response.data;
  },

  /** The user opened (on) or withdrew (off) an objection: the AI's examination waits. */
  holdObjection: async (cnr: string, on: boolean) => {
    const response = await api.post(`/cases/${cnr}/objections/hold`, { on });
    return response.data;
  },

  report: async (cnr: string, entryId: string, reason: string, details: string) => {
    const response = await api.post(`/cases/${cnr}/reports`, {
      entry_id: entryId,
      reason,
      details,
    });
    return response.data;
  },
};

// Settling a case out of court. Talks only while the court isn't sitting (adjourn
// with reason "settlement" first); each call returns the current attempt.
export const settlementAPI = {
  /** Put terms to the other side; AI counsel accepts, counters or rejects them. */
  makeOffer: async (cnr: string, terms: string, compensation: number | null): Promise<Settlement> => {
    const response = await api.post(`/cases/${cnr}/settlement/offers`, { terms, compensation });
    return response.data;
  },

  /** Accept the terms AI counsel last countered with. */
  acceptCounter: async (cnr: string): Promise<Settlement> => {
    const response = await api.post(`/cases/${cnr}/settlement/accept`);
    return response.data;
  },

  /** Call off the talks, or agreed terms not yet before the court. */
  withdraw: async (cnr: string): Promise<Settlement> => {
    const response = await api.post(`/cases/${cnr}/settlement/withdraw`);
    return response.data;
  },

  /** Put the agreed terms before the court: status "recorded" ends the case, "refused" doesn't. */
  present: async (cnr: string): Promise<Settlement> => {
    const response = await api.post(`/cases/${cnr}/settlement/present`);
    return response.data;
  },
};

// Optional-email unsubscribe links (no sign-in; the token is in the link).
export interface UnsubscribeState {
  kind: "case_ready" | "hearing_reminders" | "product_updates";
  label: string;
  subscribed: boolean;
}
export const notificationsAPI = {
  status: async (token: string): Promise<UnsubscribeState> => (await api.get("/notifications/unsubscribe", { params: { token } })).data,
  unsubscribe: async (token: string): Promise<UnsubscribeState> =>
    (await api.post("/notifications/unsubscribe", null, { params: { token } })).data,
};

// Contact API calls (open to guests)
export const contactAPI = {
  submitContactForm: async (formData: ContactFormData) => {
    const response = await api.post("/feedback/submit", formData);
    return response.data;
  },
};

export const statusAPI = {
  // A stalled request (API restarting, a cold start) must not leave the page on "Checking" for good.
  get: async (): Promise<SystemStatus> => (await api.get("/status", { timeout: 10_000 })).data,
};
// Parties API calls
export const partiesAPI = {
  getParties: async (cnr: string) => {
    try {
      const response = await api.get(`/cases/${cnr}/parties`);
      return response.data;
    } catch (error) {
      logApiError(error, "Failed to get parties");
      throw error;
    }
  },

  getPartyDetails: async (cnr: string, partyId: string) => {
    try {
      const response = await api.get(`/cases/${cnr}/parties/${partyId}`);
      return response.data;
    } catch (error) {
      logApiError(error, "Failed to get party details");
      throw error;
    }
  },

  chatWithParty: async (cnr: string, partyId: string, message: string, exhibitRefs: string[] = []) => {
    try {
      logger.debug("Chatting with party", { cnr, partyId });
      const response = await api.post(`/cases/${cnr}/parties/${partyId}/chat`, {
        message,
        exhibit_refs: exhibitRefs,
      });
      return response.data;
    } catch (error) {
      logApiError(error, "Failed to chat with party");
      throw error;
    }
  },

  getPartyChatHistory: async (cnr: string, partyId: string) => {
    try {
      const response = await api.get(`/cases/${cnr}/parties/${partyId}/chat-history`);
      return response.data;
    } catch (error) {
      logApiError(error, "Failed to get party chat history");
      throw error;
    }
  },
};

// Witness API calls
export const witnessAPI = {
  callWitness: async (cnr: string, witnessId: string) => {
    try {
      logger.debug("Calling witness", { cnr, witnessId });
      const response = await api.post(`/cases/${cnr}/witness/call`, {
        witness_id: witnessId,
      });
      logger.info("Witness called", { cnr, witnessId });
      return response.data;
    } catch (error) {
      logApiError(error, "Failed to call witness");
      throw error;
    }
  },

  examineWitness: async (cnr: string, question: string, exhibitRefs: string[] = []) => {
    try {
      logger.debug("Examining witness", { cnr });
      const response = await api.post<WitnessExaminationResponse>(`/cases/${cnr}/witness/examine`, {
        question,
        exhibit_refs: exhibitRefs,
      });
      return response.data;
    } catch (error) {
      logApiError(error, "Failed to examine witness");
      throw error;
    }
  },

  aiCrossExamine: async (cnr: string) => {
    try {
      logger.debug("AI cross-examining witness", { cnr });
      const response = await api.post(`/cases/${cnr}/witness/ai-cross-examine`);
      return response.data;
    } catch (error) {
      logApiError(error, "Failed to get AI cross-examination");
      throw error;
    }
  },

  concludeWitness: async (cnr: string) => {
    try {
      logger.debug("Concluding witness examination", { cnr });
      const response = await api.post(`/cases/${cnr}/witness/conclude`);
      logger.info("Witness examination concluded", { cnr });
      return response.data;
    } catch (error) {
      logApiError(error, "Failed to conclude witness examination");
      throw error;
    }
  },

  getCurrentWitness: async (cnr: string) => {
    try {
      const response = await api.get(`/cases/${cnr}/witness/current`);
      return response.data;
    } catch (error) {
      logApiError(error, "Failed to get current witness");
      throw error;
    }
  },

  // No objection (null), or object to the other side calling a witness
  respondToLeave: async (
    cnr: string,
    objection: { grounds: string; details: string } | null,
  ): Promise<{ granted: boolean; sustained?: boolean; ruling?: string; witness_name?: string }> => {
    const response = await api.post(`/cases/${cnr}/witness/leave/respond`, {
      objection,
    });
    return response.data;
  },

  aiCallWitness: async (cnr: string) => {
    try {
      logger.debug("AI evaluating witness call", { cnr });
      const response = await api.post(`/cases/${cnr}/witness/ai-call`);
      return response.data;
    } catch (error) {
      logApiError(error, "Failed to evaluate AI witness call");
      throw error;
    }
  },
};

// Location API calls
export const locationAPI = {
  // Search locations (cities, states, countries)
  search: async (query: string, limit = 20) => {
    try {
      const response = await api.get("/location/search", {
        params: { q: query, limit },
      });
      return response.data;
    } catch (error) {
      logApiError(error, "Location search failed");
      throw error;
    }
  },

  // Get all countries
  getCountries: async () => {
    try {
      const response = await api.get("/location/countries");
      return response.data;
    } catch (error) {
      logApiError(error, "Failed to get countries");
      throw error;
    }
  },

  // Get states for a country
  getStates: async (countryIso2: string) => {
    try {
      const response = await api.get(`/location/states/${countryIso2}`);
      return response.data;
    } catch (error) {
      logApiError(error, "Failed to get states");
      throw error;
    }
  },

  // Get cities for a state
  getCities: async (countryIso2: string, stateIso2: string) => {
    try {
      const response = await api.get(`/location/cities/${countryIso2}/${stateIso2}`);
      return response.data;
    } catch (error) {
      logApiError(error, "Failed to get cities");
      throw error;
    }
  },

  // Get phone code for a country
  getPhoneCode: async (countryIso2: string) => {
    try {
      const response = await api.get(`/location/phone-code/${countryIso2}`);
      return response.data.phone_code;
    } catch (error) {
      logApiError(error, "Failed to get phone code");
      throw error;
    }
  },

  // Get all Indian states with High Courts (for settings)
  getIndianStates: async () => {
    try {
      const response = await api.get("/location/indian-states");
      return response.data;
    } catch (error) {
      logApiError(error, "Failed to get Indian states");
      throw error;
    }
  },

  // Update case location preference
  updateCaseLocationPreference: async (data: {
    case_location_preference: "user_location" | "specific_state" | "random";
    preferred_case_state?: string;
  }) => {
    try {
      const response = await api.put("/auth/profile/case-location-preference", data);
      logger.info("Case location preference updated");
      return response.data;
    } catch (error) {
      logApiError(error, "Failed to update case location preference");
      if (axios.isAxiosError(error) && error.response) {
        throw new Error(error.response?.data?.detail || "Failed to update preference", { cause: error });
      }
      throw error;
    }
  },
};

export default api;
