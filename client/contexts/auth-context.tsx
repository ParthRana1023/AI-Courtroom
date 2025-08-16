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
    setIsLoading(true);
    try {
      const response = await authAPI.login({
        email,
        password,
        remember_me: rememberMe,
      });
      setIsLoading(false);
      return response;
    } catch (error) {
      setIsLoading(false);
      throw error;
    }
  };

  const verifyLogin = async (
    email: string,
    otp: string,
    rememberMe: boolean,
    redirectPath: string = "/dashboard/cases"
  ) => {
    setIsLoading(true);
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
      setIsLoading(false);

      // Force navigation to the specified redirect path
      window.location.href = redirectPath;
      return response;
    } catch (error) {
      setIsLoading(false);
      throw error;
    }
  };

  const register = async (userData: any) => {
    setIsLoading(true);
    try {
      const response = await authAPI.register(userData);
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
