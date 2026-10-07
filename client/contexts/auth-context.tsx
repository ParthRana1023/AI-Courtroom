"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { authAPI, setAuthToken, type PhonePayload } from "@/lib/api";
import { getLogger, Logger } from "@/lib/logger";

import type { RegisterFormData, User } from "@/types";

const logger = getLogger("auth");

/** What /auth/google returns for a Google account that has no AI Courtroom account yet. */
export interface GoogleSignupData {
  first_name: string;
  last_name: string;
  email: string;
  profile_photo_url?: string | null;
  google_signup_token: string;
}

export type GoogleResult = { newUser: GoogleSignupData } | { user: User };

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  /** Checks email + password and emails a sign-in code. */
  login: (email: string, password: string, rememberMe: boolean) => Promise<void>;
  verifyLogin: (email: string, otp: string, rememberMe: boolean) => Promise<User>;
  /** Emails a sign-up code; Google sign-ups are signed in straight away (returns the user). */
  register: (data: RegisterFormData) => Promise<User | null>;
  verifyRegistration: (data: RegisterFormData, otp: string) => Promise<User>;
  loginWithGoogle: (
    authData: { credential?: string; code?: string; state?: string },
    rememberMe?: boolean,
  ) => Promise<GoogleResult>;
  sendPhoneCode: (data: PhonePayload) => Promise<void>;
  verifyPhone: (data: PhonePayload, otp: string, rememberMe: boolean) => Promise<User>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const router = useRouter();

  // Restore the session on load.
  useEffect(() => {
    const checkAuth = async () => {
      try {
        if (authAPI.isAuthenticated()) {
          const userData = await authAPI.getProfile();
          setUser(userData);
          setIsAuthenticated(true);
          Logger.setUserId(userData.id);
          logger.info("User session restored", { userId: userData.id });
        }
      } catch {
        logger.debug("Auth check failed, clearing state");
        localStorage.removeItem("token");
        document.cookie = "token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
      } finally {
        setIsLoading(false);
      }
    };
    checkAuth();
  }, []);

  /** The token is stored; load the profile and mark the user signed in. */
  const adopt = useCallback(async (): Promise<User> => {
    const userData: User = await authAPI.getProfile();
    setUser(userData);
    setIsAuthenticated(true);
    Logger.setUserId(userData.id);
    logger.info("Signed in", { userId: userData.id });
    return userData;
  }, []);

  const login = async (email: string, password: string, rememberMe: boolean) => {
    await authAPI.login({ email, password, remember_me: rememberMe });
  };

  const verifyLogin = async (email: string, otp: string, rememberMe: boolean) => {
    await authAPI.verifyLogin({ email, otp, remember_me: rememberMe });
    return adopt();
  };

  const register = async (data: RegisterFormData) => {
    const response = await authAPI.register(data);
    if (response.skip_otp && response.access_token) {
      setAuthToken(response.access_token);
      return adopt();
    }
    return null;
  };

  const verifyRegistration = async (data: RegisterFormData, otp: string) => {
    await authAPI.verifyRegistration({ user_data: data, otp, remember_me: false });
    return adopt();
  };

  const loginWithGoogle = async (
    authData: { credential?: string; code?: string; state?: string },
    rememberMe = false,
  ): Promise<GoogleResult> => {
    const response = await authAPI.googleLogin({ ...authData, rememberMe });
    if (response.is_new_user && response.google_user_data) {
      return { newUser: response.google_user_data as GoogleSignupData };
    }
    return { user: await adopt() };
  };

  const sendPhoneCode = async (data: PhonePayload) => {
    await authAPI.sendPhoneCode(data);
  };

  const verifyPhone = async (data: PhonePayload, otp: string, rememberMe: boolean) => {
    await authAPI.verifyPhoneCode({ ...data, otp, remember_me: rememberMe });
    return adopt();
  };

  const logout = () => {
    logger.info("User logged out");
    Logger.setUserId(undefined);
    setUser(null);
    setIsAuthenticated(false);
    // Navigate only once the token cookie is cleared, or the proxy bounces /login back to /cases.
    void authAPI.logout().finally(() => router.replace("/login?signedout=1"));
  };

  const refreshUser = async () => {
    try {
      if (authAPI.isAuthenticated()) setUser(await authAPI.getProfile());
    } catch (error) {
      logger.error("Failed to refresh user data", error as Error);
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
        loginWithGoogle,
        sendPhoneCode,
        verifyPhone,
        logout,
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
