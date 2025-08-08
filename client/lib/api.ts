import axios, { type AxiosError } from "axios";
import { createOffsetDate } from "./datetime";
import { ContactFormData } from "@/types";

// Create axios instance with base URL from environment variables
const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000",
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

      // If token not in localStorage, try to get from cookie
      if (!token) {
        const cookies = document.cookie.split(";");
        const tokenCookie = cookies.find((cookie) =>
          cookie.trim().startsWith("token=")
        );
        if (tokenCookie) {
          token = tokenCookie.split("=")[1];
        }
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
      if (typeof window !== "undefined") {
        localStorage.removeItem("token");
        document.cookie =
          "token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
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

    // Set cookie with appropriate expiration
    const expirationDays = rememberMe ? 7 : 1;
    const date = createOffsetDate(expirationDays * 24 * 60 * 60 * 1000);
    document.cookie = `token=${token}; path=/; expires=${date.toUTCString()}; SameSite=Strict`;
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
      document.cookie = "token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
      window.location.href = "/";
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
};

// Argument API calls
export const argumentAPI = {
  submitArgument: async (caseCnr: string, role: string, argument: string) => {
    try {
      console.log(`Submitting argument for case ${caseCnr} as ${role}:`, argument.substring(0, 100) + "...");
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

export const submitArgument = async (
  caseId: string,
  role: string,
  argument: string
) => {
  // Error handling helper
  function handleApiError(error: any) {
    if (axios.isAxiosError(error)) {
      const serverError = error as AxiosError;
      if (serverError && serverError.response) {
        console.error("API Error:", serverError.response.data);
        console.error("API Error Status:", serverError.response.status);
        console.error("API Error Headers:", serverError.response.headers);
        console.error("API Error Config:", serverError.config);
      } else if (serverError.request) {
        // The request was made but no response was received
        console.error("API Error: No response received", serverError.request);
      } else {
        // Something happened in setting up the request that triggered an Error
        console.error("API Error:", serverError.message);
      }
    } else {
      console.error("Unexpected error:", error);
    }
  }
};

export default api;
