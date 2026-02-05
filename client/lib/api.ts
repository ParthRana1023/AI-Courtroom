import axios, { type AxiosError } from "axios";
import { ContactFormData } from "@/types";
import {
  getCookie,
  setAuthTokenCookie,
  clearAuthTokenCookie,
  COOKIE_NAMES,
} from "./cookies";
import { getLogger } from "./logger";

// Initialize logger for API calls
const logger = getLogger("api");

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
    let token = null;

    if (typeof window !== "undefined") {
      token = localStorage.getItem("token");

      // If token not in localStorage, try to get from cookie using our utility
      if (!token) {
        token = getCookie(COOKIE_NAMES.AUTH_TOKEN);
      }

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
  (response) => response,
  (error: AxiosError) => {
    // Handle unauthorized errors (401)
    if (error.response?.status === 401) {
      // Check if the error is from the login initiation endpoint
      if (error.config?.url?.includes("/auth/login/initiate")) {
        // Do not redirect for login initiation 401 errors, let the component handle it
        return Promise.reject(error);
      }
      if (typeof window !== "undefined") {
        localStorage.removeItem("token");
        clearAuthTokenCookie();
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  },
);

// Helper function to set token in both localStorage and cookie
const setAuthToken = (token: string, rememberMe = false) => {
  if (typeof window !== "undefined") {
    localStorage.setItem("token", token);
    setAuthTokenCookie(token, rememberMe);
  }
};

// Auth API calls
export const authAPI = {
  register: async (userData: any) => {
    try {
      const response = await api.post("/auth/register/initiate", userData);
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const serverError = error;
        if (serverError.response?.status === 429) {
          throw new Error(
            serverError.response.data.detail ||
              "Too many case generation requests. Please try again later.",
          );
        }
      }
      logApiError(error, "Registration initiation failed");
      throw error;
    }
  },

  verifyRegistration: async (data: any) => {
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

  login: async (loginData: any) => {
    try {
      const response = await api.post("/auth/login/initiate", loginData);
      return response.data;
    } catch (error) {
      logApiError(error, "Login initiation failed");
      throw error;
    }
  },

  verifyLogin: async (data: any) => {
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

  logout: () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("token");
      clearAuthTokenCookie();
      window.location.href = "/";
    }
  },

  // Google OAuth login
  googleLogin: async (data: {
    credential?: string;
    access_token?: string;
    code?: string;
    state?: string;
    rememberMe?: boolean;
  }) => {
    try {
      const {
        credential,
        access_token,
        code,
        state,
        rememberMe = false,
      } = data;
      const response = await api.post("/auth/google", {
        credential,
        access_token,
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
      const tokenCookie = cookies.find((cookie) =>
        cookie.trim().startsWith("token="),
      );
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
        throw new Error(error.response.data.detail || "Failed to upload photo");
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
        throw new Error(error.response.data.detail || "Failed to delete photo");
      }
      throw error;
    }
  },

  // Update profile
  updateProfile: async (data: {
    first_name?: string;
    last_name?: string;
    nickname?: string;
    gender?: string;
    city?: string;
    state?: string;
    state_iso2?: string;
    country?: string;
    country_iso2?: string;
    phone_code?: string;
  }) => {
    try {
      const response = await api.put("/auth/profile", data);
      logger.info("Profile updated");
      return response.data;
    } catch (error) {
      logApiError(error, "Failed to update profile");
      if (axios.isAxiosError(error) && error.response) {
        throw new Error(
          error.response.data.detail || "Failed to update profile",
        );
      }
      throw error;
    }
  },
};

// Case API calls
export const caseAPI = {
  listCases: async () => {
    try {
      const response = await api.get("/cases");
      logger.debug("Cases fetched", {
        count: Array.isArray(response.data)
          ? response.data.length
          : response.data?.cases?.length,
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

  updateCaseStatus: async (cnr: string, status: string) => {
    try {
      const response = await api.put(`/cases/${cnr}/status`, { status });
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
      const response = await api.post(
        `/cases/${cnr}/generate-plaintiff-opening`,
      );
      return response.data;
    } catch (error) {
      logApiError(error, "Failed to generate plaintiff opening");
      throw error;
    }
  },

  generateCase: async (caseData: any) => {
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
  submitArgument: async (
    caseCnr: string,
    role: "plaintiff" | "defendant",
    argument: string,
  ) => {
    try {
      logger.debug("Submitting argument", {
        caseCnr,
        role,
        argumentLength: argument.length,
      });
      const response = await api.post(`/cases/${caseCnr}/arguments`, {
        role,
        argument,
      });
      logger.info("Argument submitted", { caseCnr, role });
      return response.data;
    } catch (error) {
      logApiError(error, "Failed to submit argument");
      throw error;
    }
  },

  submitClosingStatement: async (
    caseCnr: string,
    role: string,
    statement: string,
  ) => {
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

// Contact API calls
export const contactAPI = {
  submitContactForm: async (formData: ContactFormData) => {
    const response = await api.post("/feedback/submit", formData);
    return response.data;
  },
};

export const analyzeCase = async (
  caseId: string,
  plaintiffArguments: string[],
  defendantArguments: string[],
  details: string,
  title: string,
  verdict: string,
) => {
  const response = await api.post(`/cases/${caseId}/analyze`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      plaintiff_arguments: plaintiffArguments,
      counter_arguments: defendantArguments,
      case_details: details,
      title: title,
      judge_verdict: verdict,
    }),
  });
  if (response.status !== 200) {
    const errorData = response.data;
    throw new Error(errorData.detail || "Failed to analyze case");
  }
  return response.data;
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

  chatWithParty: async (cnr: string, partyId: string, message: string) => {
    try {
      logger.debug("Chatting with party", { cnr, partyId });
      const response = await api.post(`/cases/${cnr}/parties/${partyId}/chat`, {
        message,
      });
      return response.data;
    } catch (error) {
      logApiError(error, "Failed to chat with party");
      throw error;
    }
  },

  getPartyChatHistory: async (cnr: string, partyId: string) => {
    try {
      const response = await api.get(
        `/cases/${cnr}/parties/${partyId}/chat-history`,
      );
      return response.data;
    } catch (error) {
      logApiError(error, "Failed to get party chat history");
      throw error;
    }
  },
};

// Witness API calls
export const witnessAPI = {
  getAvailableWitnesses: async (cnr: string) => {
    try {
      const response = await api.get(`/cases/${cnr}/witness/available`);
      return response.data;
    } catch (error) {
      logApiError(error, "Failed to get available witnesses");
      throw error;
    }
  },

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

  examineWitness: async (cnr: string, question: string) => {
    try {
      logger.debug("Examining witness", { cnr });
      const response = await api.post(`/cases/${cnr}/witness/examine`, {
        question,
      });
      return response.data;
    } catch (error) {
      logApiError(error, "Failed to examine witness");
      throw error;
    }
  },

  aiExamineWitness: async (cnr: string) => {
    try {
      logger.debug("AI examining witness", { cnr });
      const response = await api.post(`/cases/${cnr}/witness/ai-examine`);
      return response.data;
    } catch (error) {
      logApiError(error, "Failed to get AI examination");
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

  dismissWitness: async (cnr: string) => {
    try {
      logger.debug("Dismissing witness", { cnr });
      const response = await api.post(`/cases/${cnr}/witness/dismiss`);
      logger.info("Witness dismissed", { cnr });
      return response.data;
    } catch (error) {
      logApiError(error, "Failed to dismiss witness");
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

  getTestimonies: async (cnr: string) => {
    try {
      const response = await api.get(`/cases/${cnr}/witness/testimonies`);
      return response.data;
    } catch (error) {
      logApiError(error, "Failed to get testimonies");
      throw error;
    }
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
      const response = await api.get(
        `/location/cities/${countryIso2}/${stateIso2}`,
      );
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
      const response = await api.put(
        "/auth/profile/case-location-preference",
        data,
      );
      logger.info("Case location preference updated");
      return response.data;
    } catch (error) {
      logApiError(error, "Failed to update case location preference");
      if (axios.isAxiosError(error) && error.response) {
        throw new Error(
          error.response?.data?.detail || "Failed to update preference",
        );
      }
      throw error;
    }
  },
};

export default api;
