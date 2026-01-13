import axios, { type AxiosError } from "axios";
import { ContactFormData } from "@/types";
import {
  getCookie,
  setAuthTokenCookie,
  clearAuthTokenCookie,
  COOKIE_NAMES,
} from "./cookies";

// Create axios instance with base URL from environment variables
const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
console.log(`🔧 API Base URL: ${apiBaseUrl}`);

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
  (error) => Promise.reject(error)
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
  }
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
        if (serverError.response) {
          if (serverError.response.status === 429) {
            throw new Error(
              serverError.response.data.detail ||
                "Too many case generation requests. Please try again later."
            );
          }
          console.error("API Error:", serverError.response.data);
          console.error("API Error Status:", serverError.response.status);
          console.error("API Error Headers:", serverError.response.headers);
        } else if (serverError.request) {
          console.error("API Error: No response received", serverError.request);
        } else {
          console.error("API Error:", serverError.message);
        }
      } else {
        console.error("Unexpected error:", error);
      }
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
      if (axios.isAxiosError(error)) {
        const serverError = error;
        if (serverError.response) {
          console.error("API Error:", serverError.response.data);
          console.error("API Error Status:", serverError.response.status);
          console.error("API Error Headers:", serverError.response.headers);
        } else if (serverError.request) {
          console.error("API Error: No response received", serverError.request);
        } else {
          console.error("API Error:", serverError.message);
        }
      } else {
        console.error("Unexpected error:", error);
      }
      throw error;
    }
  },

  login: async (loginData: any) => {
    try {
      const response = await api.post("/auth/login/initiate", loginData);
      // Remove the immediate call to verifyLogin
      // await authAPI.verifyLogin({ ...response.data, remember_me: remember });
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const serverError = error;
        if (serverError.response) {
          console.error("API Error:", serverError.response.data);
          console.error("API Error Status:", serverError.response.status);
          console.error("API Error Headers:", serverError.response.headers);
        } else if (serverError.request) {
          console.error("API Error: No response received", serverError.request);
        } else {
          console.error("API Error:", serverError.message);
        }
      } else {
        console.error("Unexpected error:", error);
      }
      throw error;
    }
  },

  verifyLogin: async (data: any) => {
    try {
      console.log("Data received by authAPI.verifyLogin:", data);
      const response = await api.post("/auth/login/verify", data);
      if (response.data.access_token) {
        // Set token in both localStorage and cookie
        setAuthToken(response.data.access_token, data.remember_me);
      }
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const serverError = error;
        if (serverError.response) {
          console.error("API Error:", serverError.response.data);
          console.error("API Error Status:", serverError.response.status);
          console.error("API Error Headers:", serverError.response.headers);
        } else if (serverError.request) {
          console.error("API Error: No response received", serverError.request);
        } else {
          console.error("API Error:", serverError.message);
        }
      } else {
        console.error("Unexpected error:", error);
      }
      throw error;
    }
  },

  getProfile: async () => {
    try {
      const response = await api.get("/auth/profile");
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const serverError = error;
        if (serverError.response) {
          console.error("API Error:", serverError.response.data);
          console.error("API Error Status:", serverError.response.status);
          console.error("API Error Headers:", serverError.response.headers);
        } else if (serverError.request) {
          console.error("API Error: No response received", serverError.request);
        } else {
          console.error("API Error:", serverError.message);
        }
      } else {
        console.error("Unexpected error:", error);
      }
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
    rememberMe?: boolean;
  }) => {
    try {
      const { credential, access_token, rememberMe = false } = data;
      const response = await api.post("/auth/google", {
        credential,
        access_token,
        remember_me: rememberMe,
      });
      if (response.data.access_token) {
        setAuthToken(response.data.access_token, rememberMe);
      }
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const serverError = error;
        if (serverError.response) {
          console.error("API Error:", serverError.response.data);
          console.error("API Error Status:", serverError.response.status);
        }
      }
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
        cookie.trim().startsWith("token=")
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
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const serverError = error;
        if (serverError.response) {
          console.error("API Error:", serverError.response.data);
          throw new Error(
            serverError.response.data.detail || "Failed to upload photo"
          );
        }
      }
      throw error;
    }
  },

  // Delete profile photo
  deleteProfilePhoto: async () => {
    try {
      const response = await api.delete("/auth/profile/photo");
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const serverError = error;
        if (serverError.response) {
          console.error("API Error:", serverError.response.data);
          throw new Error(
            serverError.response.data.detail || "Failed to delete photo"
          );
        }
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
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const serverError = error;
        if (serverError.response) {
          console.error("API Error:", serverError.response.data);
          throw new Error(
            serverError.response.data.detail || "Failed to update profile"
          );
        }
      }
      throw error;
    }
  },
};

// Case API calls
export const caseAPI = {
  listCases: async () => {
    try {
      // Use the configured api instance instead of axios directly
      const response = await api.get("/cases");
      console.log("API response status:", response.status);
      console.log("API response data:", response.data);

      // Make sure we're returning the actual array of cases
      // The backend might be wrapping the cases in an object
      if (response.data && response.data.cases) {
        return response.data.cases;
      } else if (Array.isArray(response.data)) {
        return response.data;
      } else {
        console.error("Unexpected API response format:", response.data);
        return []; // Return empty array instead of undefined
      }
    } catch (error) {
      console.error("Error in listCases API call:", error);
      // Re-throw the error so it can be caught by the component
      throw error;
    }
  },

  getCase: async (cnr: string) => {
    try {
      const response = await api.get(`/cases/${cnr}`);
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const serverError = error;
        if (serverError.response) {
          console.error("API Error:", serverError.response.data);
          console.error("API Error Status:", serverError.response.status);
          console.error("API Error Headers:", serverError.response.headers);
        } else if (serverError.request) {
          console.error("API Error: No response received", serverError.request);
        } else {
          console.error("API Error:", serverError.message);
        }
      } else {
        console.error("Unexpected error:", error);
      }
      throw error;
    }
  },

  getCaseHistory: async (caseId: string) => {
    try {
      const response = await api.get(`/cases/${caseId}/history`);
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const serverError = error;
        if (serverError.response) {
          console.error("API Error:", serverError.response.data);
          console.error("API Error Status:", serverError.response.status);
          console.error("API Error Headers:", serverError.response.headers);
        } else if (serverError.request) {
          console.error("API Error: No response received", serverError.request);
        } else {
          console.error("API Error:", serverError.message);
        }
      } else {
        console.error("Unexpected error:", error);
      }
      throw error;
    }
  },

  analyzeCase: async (caseId: string) => {
    try {
      const response = await api.post(`/cases/${caseId}/analyze-case`);
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const serverError = error;
        if (serverError.response) {
          console.error("API Error:", serverError.response.data);
          console.error("API Error Status:", serverError.response.status);
          console.error("API Error Headers:", serverError.response.headers);
        } else if (serverError.request) {
          console.error("API Error: No response received", serverError.request);
        } else {
          console.error("API Error:", serverError.message);
        }
      } else {
        console.error("Unexpected error:", error);
      }
      throw error;
    }
  },

  updateCaseStatus: async (cnr: string, status: string) => {
    try {
      const response = await api.put(`/cases/${cnr}/status`, { status });
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const serverError = error;
        if (serverError.response) {
          console.error("API Error:", serverError.response.data);
          console.error("API Error Status:", serverError.response.status);
          console.error("API Error Headers:", serverError.response.headers);
        } else if (serverError.request) {
          console.error("API Error: No response received", serverError.request);
        } else {
          console.error("API Error:", serverError.message);
        }
      } else {
        console.error("Unexpected error:", error);
      }
      throw error;
    }
  },

  updateCaseRoles: async (cnr: string, user_role: string, ai_role: string) => {
    try {
      const response = await api.put(`/cases/${cnr}/roles`, {
        user_role,
        ai_role,
      });
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const serverError = error;
        if (serverError.response) {
          console.error("API Error:", serverError.response.data);
          console.error("API Error Status:", serverError.response.status);
          console.error("API Error Headers:", serverError.response.headers);
        } else if (serverError.request) {
          console.error("API Error: No response received", serverError.request);
        } else {
          console.error("API Error:", serverError.message);
        }
      } else {
        console.error("Unexpected error:", error);
      }
      throw error;
    }
  },

  generatePlaintiffOpening: async (cnr: string) => {
    try {
      const response = await api.post(
        `/cases/${cnr}/generate-plaintiff-opening`
      );
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const serverError = error;
        if (serverError.response) {
          console.error("API Error:", serverError.response.data);
          console.error("API Error Status:", serverError.response.status);
          console.error("API Error Headers:", serverError.response.headers);
        } else if (serverError.request) {
          console.error("API Error: No response received", serverError.request);
        } else {
          console.error("API Error:", serverError.message);
        }
      } else {
        console.error("Unexpected error:", error);
      }
      throw error;
    }
  },

  generateCase: async (caseData: any) => {
    try {
      const response = await api.post("/cases/generate", caseData);
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const serverError = error;
        if (serverError.response) {
          console.error("API Error:", serverError.response.data);
          console.error("API Error Status:", serverError.response.status);
          console.error("API Error Headers:", serverError.response.headers);
        } else if (serverError.request) {
          console.error("API Error: No response received", serverError.request);
        } else {
          console.error("API Error:", serverError.message);
        }
      } else {
        console.error("Unexpected error:", error);
      }
      throw error;
    }
  },

  deleteCase: async (cnr: string) => {
    try {
      const response = await api.delete(`/cases/${cnr}`);
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const serverError = error;
        if (serverError.response) {
          console.error("API Error:", serverError.response.data);
          console.error("API Error Status:", serverError.response.status);
          console.error("API Error Headers:", serverError.response.headers);
        } else if (serverError.request) {
          console.error("API Error: No response received", serverError.request);
        } else {
          console.error("API Error:", serverError.message);
        }
      } else {
        console.error("Unexpected error:", error);
      }
      throw error;
    }
  },

  listDeletedCases: async () => {
    try {
      const response = await api.get("/cases/deleted/list");
      return Array.isArray(response.data) ? response.data : [];
    } catch (error) {
      console.error("Error in listDeletedCases API call:", error);
      throw error;
    }
  },

  restoreCase: async (cnr: string) => {
    try {
      const response = await api.post(`/cases/${cnr}/restore`);
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const serverError = error;
        if (serverError.response) {
          console.error("API Error:", serverError.response.data);
          console.error("API Error Status:", serverError.response.status);
        }
      }
      throw error;
    }
  },

  permanentDeleteCase: async (cnr: string) => {
    try {
      const response = await api.delete(`/cases/${cnr}/permanent`);
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const serverError = error;
        if (serverError.response) {
          console.error("API Error:", serverError.response.data);
          console.error("API Error Status:", serverError.response.status);
        }
      }
      throw error;
    }
  },
};

// Argument API calls
export const argumentAPI = {
  submitArgument: async (
    caseCnr: string,
    role: "plaintiff" | "defendant",
    argument: string
  ) => {
    try {
      console.log(
        `Submitting argument for case ${caseCnr} as ${role}:`,
        argument.substring(0, 100) + "..."
      );
      const response = await api.post(`/cases/${caseCnr}/arguments`, {
        role,
        argument,
      });
      console.log(`Argument submission response:`, response.data);
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const serverError = error;
        if (serverError.response) {
          console.error("API Error:", serverError.response.data);
          console.error("API Error Status:", serverError.response.status);
          console.error("API Error Headers:", serverError.response.headers);
        } else if (serverError.request) {
          console.error("API Error: No response received", serverError.request);
        } else {
          console.error("API Error:", serverError.message);
        }
      } else {
        console.error("Unexpected error:", error);
      }
      throw error;
    }
  },

  submitClosingStatement: async (
    caseCnr: string,
    role: string,
    statement: string
  ) => {
    try {
      const response = await api.post(`/cases/${caseCnr}/closing-statement`, {
        role,
        statement,
      });
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const serverError = error;
        if (serverError.response) {
          console.error("API Error:", serverError.response.data);
          console.error("API Error Status:", serverError.response.status);
          console.error("API Error Headers:", serverError.response.headers);
        } else if (serverError.request) {
          console.error("API Error: No response received", serverError.request);
        } else {
          console.error("API Error:", serverError.message);
        }
      } else {
        console.error("Unexpected error:", error);
      }
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
  verdict: string
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

// export const submitArgument = async (
//   caseId: string,
//   role: string,
//   argument: string
// ) => {
//   // Error handling helper
//   function handleApiError(error: any) {
//     if (axios.isAxiosError(error)) {
//       const serverError = error as AxiosError;
//       if (serverError && serverError.response) {
//         console.error("API Error:", serverError.response.data);
//         console.error("API Error Status:", serverError.response.status);
//         console.error("API Error Headers:", serverError.response.headers);
//         console.error("API Error Config:", serverError.config);
//       } else if (serverError.request) {
//         // The request was made but no response was received
//         console.error("API Error: No response received", serverError.request);
//       } else {
//         // Something happened in setting up the request that triggered an Error
//         console.error("API Error:", serverError.message);
//       }
//     } else {
//       console.error("Unexpected error:", error);
//     }
//   }
// };

// Parties API calls
export const partiesAPI = {
  getParties: async (cnr: string) => {
    try {
      const response = await api.get(`/cases/${cnr}/parties`);
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const serverError = error;
        if (serverError.response) {
          console.error("API Error:", serverError.response.data);
          console.error("API Error Status:", serverError.response.status);
        }
      }
      throw error;
    }
  },

  getPartyDetails: async (cnr: string, partyId: string) => {
    try {
      const response = await api.get(`/cases/${cnr}/parties/${partyId}`);
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const serverError = error;
        if (serverError.response) {
          console.error("API Error:", serverError.response.data);
          console.error("API Error Status:", serverError.response.status);
        }
      }
      throw error;
    }
  },

  chatWithParty: async (cnr: string, partyId: string, message: string) => {
    try {
      const response = await api.post(`/cases/${cnr}/parties/${partyId}/chat`, {
        message,
      });
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const serverError = error;
        if (serverError.response) {
          console.error("API Error:", serverError.response.data);
          console.error("API Error Status:", serverError.response.status);
        }
      }
      throw error;
    }
  },

  getPartyChatHistory: async (cnr: string, partyId: string) => {
    try {
      const response = await api.get(
        `/cases/${cnr}/parties/${partyId}/chat-history`
      );
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const serverError = error;
        if (serverError.response) {
          console.error("API Error:", serverError.response.data);
          console.error("API Error Status:", serverError.response.status);
        }
      }
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
      if (axios.isAxiosError(error)) {
        console.error("Location search error:", error.response?.data);
      }
      throw error;
    }
  },

  // Get all countries
  getCountries: async () => {
    try {
      const response = await api.get("/location/countries");
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error("Get countries error:", error.response?.data);
      }
      throw error;
    }
  },

  // Get states for a country
  getStates: async (countryIso2: string) => {
    try {
      const response = await api.get(`/location/states/${countryIso2}`);
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error("Get states error:", error.response?.data);
      }
      throw error;
    }
  },

  // Get cities for a state
  getCities: async (countryIso2: string, stateIso2: string) => {
    try {
      const response = await api.get(
        `/location/cities/${countryIso2}/${stateIso2}`
      );
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error("Get cities error:", error.response?.data);
      }
      throw error;
    }
  },

  // Get phone code for a country
  getPhoneCode: async (countryIso2: string) => {
    try {
      const response = await api.get(`/location/phone-code/${countryIso2}`);
      return response.data.phone_code;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error("Get phone code error:", error.response?.data);
      }
      throw error;
    }
  },

  // Get all Indian states with High Courts (for settings)
  getIndianStates: async () => {
    try {
      const response = await api.get("/location/indian-states");
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error("Get Indian states error:", error.response?.data);
      }
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
        data
      );
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error(
          "Update case location preference error:",
          error.response?.data
        );
        throw new Error(
          error.response?.data?.detail || "Failed to update preference"
        );
      }
      throw error;
    }
  },
};

export default api;
