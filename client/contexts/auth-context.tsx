"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { authAPI } from "@/lib/api";

import { User } from "@/types";

// Update the AuthContextType interface to include the redirectPath parameter
interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string, rememberMe: boolean) => Promise<any>;
  verifyLogin: (
    email: string,
    otp: string,
    rememberMe: boolean,
    redirectPath?: string
  ) => Promise<any>;
  register: (userData: any) => Promise<any>;
  verifyRegistration: (userData: any, otp: string) => Promise<void>;
  logout: () => void;
  redirectToDashboard: () => void;
  loginWithGoogle: (credential: string, rememberMe?: boolean) => Promise<any>;
  refreshUser: () => Promise<void>; // Refresh user data from server
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const router = useRouter();

  // Effect to check authentication status on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        // Check if authenticated using the helper method
        if (authAPI.isAuthenticated()) {
          const userData = await authAPI.getProfile();
          setUser(userData);
          setIsAuthenticated(true);
        }
      } catch (error) {
        // If error, clear auth state
        if (typeof window !== "undefined") {
          localStorage.removeItem("token");
          document.cookie =
            "token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
        }
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, []);

  // Function to redirect to dashboard using multiple approaches for reliability
  const redirectToDashboard = () => {
    if (typeof window !== "undefined") {
      // Try multiple approaches for maximum reliability
      try {
        // Approach 1: Next.js router
        router.push("/dashboard/cases");

        // Approach 2: Direct location change (more forceful)
        setTimeout(() => {
          window.location.href = "/dashboard/cases";
        }, 100);
      } catch (error) {
        // Fallback approach
        window.location.replace("/dashboard/cases");
      }
    }
  };

  const login = async (
    email: string,
    password: string,
    rememberMe: boolean
  ) => {
    try {
      const response = await authAPI.login({
        email,
        password,
        remember_me: rememberMe,
      });
      return response;
    } catch (error) {
      throw error;
    }
  };

  const verifyLogin = async (
    email: string,
    otp: string,
    rememberMe: boolean,
    redirectPath: string = "/dashboard/cases"
  ) => {
    try {
      const dataToSend = {
        email,
        otp,
        remember_me: rememberMe,
      };
      console.log("Sending data to authAPI.verifyLogin:", dataToSend);
      const response = await authAPI.verifyLogin(dataToSend);
      const userData = await authAPI.getProfile();

      // Set authentication state
      setUser(userData);
      setIsAuthenticated(true);

      router.push(redirectPath);
      return response;
    } catch (error) {
      throw error;
    }
  };

  const register = async (userData: any) => {
    setIsLoading(true);
    try {
      const response = await authAPI.register(userData);

      // If Google registration (skip_otp), set auth state immediately
      if (response.skip_otp && response.access_token) {
        // Store token in both localStorage and cookie
        if (typeof window !== "undefined") {
          localStorage.setItem("token", response.access_token);
          // Also set cookie for consistency
          document.cookie = `token=${response.access_token}; path=/; max-age=${
            60 * 60 * 24
          }; samesite=Strict`;
        }
        setIsAuthenticated(true);
        setIsLoading(false);
        // Use hard redirect to avoid race conditions
        if (typeof window !== "undefined") {
          window.location.href = "/dashboard/cases";
        }
        return response;
      }

      setIsLoading(false);
      return response;
    } catch (error) {
      setIsLoading(false);
      throw error;
    }
  };

  const verifyRegistration = async (registrationData: any, otp: string) => {
    setIsLoading(true);
    try {
      const { access_token } = await authAPI.verifyRegistration({
        user_data: registrationData,
        otp,
        remember_me: false,
      });
      localStorage.setItem("token", access_token);
      const profileData = await authAPI.getProfile();
      setUser(profileData);
      setIsAuthenticated(true);
      setIsLoading(false);
      router.push("/dashboard/cases");
    } catch (error) {
      setIsLoading(false);
      throw error;
    }
  };

  const logout = () => {
    authAPI.logout();
    setUser(null);
    setIsAuthenticated(false);
  };

  const loginWithGoogle = async (
    accessToken: string,
    rememberMe: boolean = false
  ) => {
    try {
      const response = await authAPI.googleLogin({
        access_token: accessToken,
        rememberMe,
      });

      // If this is a new Google user, redirect to register page with pre-filled data
      if (response.is_new_user && response.google_user_data) {
        // Store Google data in sessionStorage for register page
        console.log("Google user data received:", response.google_user_data);
        if (typeof window !== "undefined") {
          sessionStorage.setItem(
            "googleUserData",
            JSON.stringify(response.google_user_data)
          );
        }
        router.push("/register?google=true");
        return;
      }

      // Existing user - get profile and redirect to dashboard
      const userData = await authAPI.getProfile();
      setUser(userData);
      setIsAuthenticated(true);
      router.push("/dashboard/cases");
    } catch (error) {
      throw error;
    }
  };

  // Refresh user data from server (e.g., after profile photo update)
  const refreshUser = async () => {
    try {
      if (authAPI.isAuthenticated()) {
        const userData = await authAPI.getProfile();
        setUser(userData);
      }
    } catch (error) {
      console.error("Failed to refresh user data:", error);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated,
        login,
        verifyLogin,
        register,
        verifyRegistration,
        logout,
        redirectToDashboard,
        loginWithGoogle,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
