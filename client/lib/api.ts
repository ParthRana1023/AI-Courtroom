"use client";

import axios from "axios";
import { useEffect, useState } from "react";

// Add these types at the top of api.ts
export interface RegistrationData {
  first_name: string;
  last_name: string;
  date_of_birth: string; // ISO format YYYY-MM-DD
  phone_number: string;
  email: string;
  password: string;
}

// Regular expression for validating email addresses

// Update the API initialization
// Create axios instance with base URL from environment variable
const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000",
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  // Add timeout
  timeout: 10000,
  validateStatus: (status) => {
    return (status >= 200 && status < 300) || status === 422; // Allow 422 to be handled in catch block
  },
});

// Log the base URL during initialization
console.log(
  "API Base URL:",
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
);

// Add request interceptor to include auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("auth_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
      console.log("Adding auth token to request");
    } else {
      console.log("No auth token found");
    }
    return config;
  },
  (error) => {
    console.error("Request interceptor error:", error);
    return Promise.reject(error);
  }
);

// Add response interceptor to handle common errors
api.interceptors.response.use(
  (response) => {
    console.log(`Response from ${response.config.url}:`, response.status);
    return response;
  },
  (error) => {
    // Handle 401 Unauthorized errors
    if (error.response && error.response.status === 401) {
      console.log("Unauthorized access, redirecting to login");
      localStorage.removeItem("auth_token");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

export async function checkApiHealth() {
  try {
    const response = await api.get("/health");
    return response.data;
  } catch (error) {
    console.error("API health check failed:", error);
    throw new Error("Unable to connect to the server. Please try again later.");
  }
}

// Authentication functions
export async function register(userData: RegistrationData) {
  try {
    // Log initial data
    console.log("Initial registration data:", {
      ...userData,
      password: userData.password ? "[REDACTED]" : undefined,
    });

    // Ensure all required fields exist and are properly formatted
    const formattedData = {
      first_name: userData.first_name?.trim() ?? "",
      last_name: userData.last_name?.trim() ?? "",
      date_of_birth: userData.date_of_birth ?? "",
      phone_number: userData.phone_number?.replace(/\D/g, "") ?? "",
      email: userData.email?.trim() ?? "",
      password: userData.password ?? "",
    };

    // Validation
    const validationErrors: string[] = [];

    // Required field validation
    if (!formattedData.first_name)
      validationErrors.push("First name is required");
    if (!formattedData.last_name)
      validationErrors.push("Last name is required");
    if (!formattedData.date_of_birth)
      validationErrors.push("Date of birth is required");
    if (!formattedData.phone_number)
      validationErrors.push("Phone number is required");
    if (!formattedData.email) validationErrors.push("Email is required");
    if (!formattedData.password) validationErrors.push("Password is required");

    // Only proceed with additional validation if basic requirements are met
    if (validationErrors.length === 0) {
      // Email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formattedData.email)) {
        validationErrors.push("Invalid email format");
      }

      // Phone number validation
      if (formattedData.phone_number.length !== 10) {
        validationErrors.push("Phone number must be exactly 10 digits");
      }

      // Password validation
      if (formattedData.password.length < 8) {
        validationErrors.push("Password must be at least 8 characters");
      }
      if (!/\d/.test(formattedData.password)) {
        validationErrors.push("Password must contain at least 1 digit");
      }
      if (!/[a-zA-Z]/.test(formattedData.password)) {
        validationErrors.push("Password must contain at least 1 letter");
      }
      if (!/[@$!%*#?&]/.test(formattedData.password)) {
        validationErrors.push(
          "Password must contain at least 1 special character (@$!%*#?&)"
        );
      }

      // Date validation
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(formattedData.date_of_birth)) {
        validationErrors.push("Invalid date format. Use YYYY-MM-DD");
      } else {
        const date = new Date(formattedData.date_of_birth);
        const now = new Date();
        if (isNaN(date.getTime())) {
          validationErrors.push("Invalid date");
        } else if (date > now) {
          validationErrors.push("Date of birth cannot be in the future");
        }
      }
    }

    if (validationErrors.length > 0) {
      throw new Error(`Validation failed: ${validationErrors.join("; ")}`);
    }

    // Log formatted data before sending
    console.log("Sending formatted data:", {
      ...formattedData,
      password: "[REDACTED]",
    });

    const response = await api.post("/auth/register", formattedData);
    return response.data;
  } catch (error: any) {
    console.error("Registration error:", error);
    throw error;
  }
}

export async function login(email: string, password: string) {
  try {
    console.log("Logging in user:", email);

    const params = new URLSearchParams();
    params.append("username", email);
    params.append("password", password);

    const response = await api.post("/auth/login", params, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    console.log("Login response:", {
      ...response.data,
      access_token: response.data.access_token ? "[REDACTED]" : undefined,
    });

    if (!response.data.access_token) {
      console.error("No access token in response:", response.data);
      throw new Error("Authentication failed: No access token received");
    }

    // Store token and return data
    localStorage.setItem("auth_token", response.data.access_token);
    return response.data;
  } catch (error: any) {
    console.error("Login error:", error);

    if (error.response?.status === 401) {
      throw new Error("Invalid email or password");
    }

    if (error.response?.data?.detail) {
      throw new Error(error.response.data.detail);
    }

    // Include more context in the error message
    throw new Error(
      `Login failed: ${error.message || "Please try again later."}`
    );
  }
}

export async function logout() {
  try {
    // No logout endpoint in the backend, just remove the token
    localStorage.removeItem("auth_token");
  } catch (error) {
    console.error("Logout error:", error);
    // Still remove token even if API call fails
    localStorage.removeItem("auth_token");
  }
}

// User profile functions
export async function getUserProfile() {
  try {
    console.log(
      "Fetching user profile from:",
      `${api.defaults.baseURL}/auth/profile`
    );
    const token = localStorage.getItem("auth_token");
    console.log("Auth token present:", !!token);

    const response = await api.get("/auth/profile");
    console.log("User profile response:", response.data);
    return response.data;
  } catch (error: any) {
    console.error("Error fetching user profile:", error);

    // More detailed error information
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      console.error("Error response data:", error.response.data);
      console.error("Error response status:", error.response.status);
      console.error("Error response headers:", error.response.headers);

      throw new Error(
        error.response.data?.detail ||
          `Failed to fetch user profile. Server responded with status: ${error.response.status}`
      );
    } else if (error.request) {
      // The request was made but no response was received
      console.error("No response received:", error.request);
      throw new Error(
        "Failed to fetch user profile. No response received from server."
      );
    } else {
      // Something happened in setting up the request that triggered an Error
      console.error("Error message:", error.message);
      throw new Error(`Failed to fetch user profile: ${error.message}`);
    }
  }
}

// Case management functions
export async function getCases() {
  try {
    console.log("Fetching cases from:", `${api.defaults.baseURL}/cases`);
    const response = await api.get("/cases");
    console.log("Cases response:", response.data);
    return response.data;
  } catch (error: any) {
    console.error("Error fetching cases:", error);

    // More detailed error information
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      console.error("Error response data:", error.response.data);
      console.error("Error response status:", error.response.status);
      console.error("Error response headers:", error.response.headers);

      throw new Error(
        error.response.data?.detail ||
          `Failed to fetch cases. Server responded with status: ${error.response.status}`
      );
    } else if (error.request) {
      // The request was made but no response was received
      console.error("No response received:", error.request);
      throw new Error(
        "Failed to fetch cases. No response received from server."
      );
    } else {
      // Something happened in setting up the request that triggered an Error
      console.error("Error message:", error.message);
      throw new Error(`Failed to fetch cases: ${error.message}`);
    }
  }
}

export async function getCaseDetails(caseId: string) {
  try {
    const response = await api.get(`/cases/${caseId}`);
    return response.data;
  } catch (error: any) {
    if (error.response?.data?.detail) {
      throw new Error(error.response.data.detail);
    }
    throw new Error(
      error.response?.data?.message || "Failed to fetch case details."
    );
  }
}

export async function generateCase(caseData: any) {
  try {
    console.log("Generating case with data:", caseData);
    console.log(
      "Generate case endpoint:",
      `${api.defaults.baseURL}/cases/generate`
    );

    const response = await api.post("/cases/generate", {
      sections_involved: caseData.sections_involved,
      section_numbers: caseData.section_numbers || [],
      description: caseData.description,
    });

    console.log("Generate case response:", response.data);
    return response.data;
  } catch (error: any) {
    console.error("Error generating case:", error);

    // More detailed error information
    if (error.response) {
      console.error("Error response data:", error.response.data);
      console.error("Error response status:", error.response.status);

      if (error.response.data?.detail) {
        throw new Error(error.response.data.detail);
      } else if (error.response.data?.message) {
        throw new Error(error.response.data.message);
      } else if (typeof error.response.data === "string") {
        throw new Error(error.response.data);
      }

      throw new Error(
        `Failed to generate case. Server responded with status: ${error.response.status}`
      );
    } else if (error.request) {
      console.error("No response received:", error.request);
      throw new Error(
        "Failed to generate case. No response received from server."
      );
    } else {
      console.error("Error message:", error.message);
      throw new Error(`Failed to generate case: ${error.message}`);
    }
  }
}

// Argument submission functions
export async function submitArgument(
  caseId: string,
  role: string,
  argument: string
) {
  try {
    const response = await api.post(`/arguments/${caseId}/arguments`, {
      role,
      argument,
    });

    // Format the response to match what our frontend expects
    return {
      response: response.data.counter_argument,
      isVerdict: !!response.data.verdict,
      isComplete: !!response.data.verdict,
    };
  } catch (error: any) {
    if (error.response?.data?.detail) {
      throw new Error(error.response.data.detail);
    }
    throw new Error(
      error.response?.data?.message || "Failed to submit argument."
    );
  }
}

// Custom hook for user data
export function useUser() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const token = localStorage.getItem("auth_token");
        if (!token) {
          console.log("No auth token found in useUser hook");
          setLoading(false);
          return;
        }

        console.log("Fetching user profile in useUser hook");
        const data = await getUserProfile();
        console.log("User profile data received:", data);
        setUser(data);
      } catch (err: any) {
        console.error("Error in useUser hook:", err);
        setError(err.message || "Failed to fetch user data");
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, []);

  return { user, loading, error };
}

export default api;
