"use client"

import axios from "axios"
import { useEffect, useState } from "react"

// Create axios instance with base URL from environment variable
const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "https://api.example.com",
  headers: {
    "Content-Type": "application/json",
  },
})

// Add request interceptor to include auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("auth_token")
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error),
)

// Add response interceptor to handle common errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Handle 401 Unauthorized errors
    if (error.response && error.response.status === 401) {
      localStorage.removeItem("auth_token")
      window.location.href = "/login"
    }
    return Promise.reject(error)
  },
)

// Authentication functions
export async function register(userData: any) {
  try {
    const response = await api.post("/auth/register", userData)
    return response.data
  } catch (error: any) {
    if (error.response?.data?.detail) {
      throw new Error(error.response.data.detail)
    }
    throw new Error(error.response?.data?.message || "Registration failed. Please try again.")
  }
}

// Completely revised login function with improved error handling
export async function login(email: string, password: string) {
  try {
    // Backend expects OAuth2 format with username/password
    const formData = new FormData()
    formData.append("username", email) // Backend uses username field for email
    formData.append("password", password)

    // Log the request for debugging (remove in production)
    console.log("Login request:", { username: email, password: "***" })

    const response = await api.post("/auth/login", formData, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    })

    // Log the response for debugging (remove in production)
    console.log("Login response:", response.data)

    // Make sure we have a token before storing it
    if (response.data && response.data.access_token) {
      localStorage.setItem("auth_token", response.data.access_token)
      return response.data
    } else {
      // If we get a response but no token, log it and throw a specific error
      console.error("No access token in response:", response.data)
      throw new Error("Authentication failed: No access token received")
    }
  } catch (error: any) {
    // Log the full error for debugging
    console.error("Login error:", error)

    // Handle different error scenarios with specific messages
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      console.error("Error response data:", error.response.data)
      console.error("Error response status:", error.response.status)

      // Handle specific status codes
      if (error.response.status === 401) {
        throw new Error("Invalid email or password")
      }

      if (error.response.status === 422) {
        throw new Error("Validation error: Please check your input")
      }

      // Extract error message from different possible response formats
      const errorMessage =
        error.response.data?.detail ||
        error.response.data?.message ||
        error.response.data?.error_description ||
        (typeof error.response.data === "string" ? error.response.data : null)

      if (errorMessage) {
        throw new Error(`Login failed: ${errorMessage}`)
      }
    } else if (error.request) {
      // The request was made but no response was received
      console.error("No response received:", error.request)
      throw new Error("No response from server. Please check your internet connection.")
    }

    // For any other errors
    throw new Error(error.message || "Login failed. Please try again.")
  }
}

export async function logout() {
  try {
    // No logout endpoint in the backend, just remove the token
    localStorage.removeItem("auth_token")
  } catch (error) {
    console.error("Logout error:", error)
    // Still remove token even if API call fails
    localStorage.removeItem("auth_token")
  }
}

// User profile functions
export async function getUserProfile() {
  try {
    const response = await api.get("/auth/profile")
    return response.data
  } catch (error: any) {
    if (error.response?.data?.detail) {
      throw new Error(error.response.data.detail)
    }
    throw new Error(error.response?.data?.message || "Failed to fetch user profile.")
  }
}

// Case management functions
export async function getCases() {
  try {
    const response = await api.get("/cases")
    return response.data
  } catch (error: any) {
    if (error.response?.data?.detail) {
      throw new Error(error.response.data.detail)
    }
    throw new Error(error.response?.data?.message || "Failed to fetch cases.")
  }
}

export async function getCaseDetails(caseId: string) {
  try {
    const response = await api.get(`/cases/${caseId}`)
    return response.data
  } catch (error: any) {
    if (error.response?.data?.detail) {
      throw new Error(error.response.data.detail)
    }
    throw new Error(error.response?.data?.message || "Failed to fetch case details.")
  }
}

export async function generateCase(caseData: any) {
  try {
    const response = await api.post("/cases/generate", {
      sections_involved: caseData.numSections,
      section_numbers: caseData.sectionNumbers || [],
    })
    return response.data
  } catch (error: any) {
    if (error.response?.data?.detail) {
      throw new Error(error.response.data.detail)
    }
    throw new Error(error.response?.data?.message || "Failed to generate case.")
  }
}

// Argument submission functions
export async function submitArgument(caseId: string, role: string, argument: string) {
  try {
    const response = await api.post(`/arguments/${caseId}/arguments`, {
      role,
      argument,
    })

    // Format the response to match what our frontend expects
    return {
      response: response.data.counter_argument,
      isVerdict: !!response.data.verdict,
      isComplete: !!response.data.verdict,
    }
  } catch (error: any) {
    if (error.response?.data?.detail) {
      throw new Error(error.response.data.detail)
    }
    throw new Error(error.response?.data?.message || "Failed to submit argument.")
  }
}

// Custom hook for user data
export function useUser() {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const token = localStorage.getItem("auth_token")
        if (!token) {
          setLoading(false)
          return
        }

        const data = await getUserProfile()
        setUser(data)
      } catch (err) {
        setError("Failed to fetch user data")
        console.error(err)
      } finally {
        setLoading(false)
      }
    }

    fetchUser()
  }, [])

  return { user, loading, error }
}

export default api
