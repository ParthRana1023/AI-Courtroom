"use client";

import type React from "react";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import Navigation from "@/components/navigation";
import OtpForm from "@/components/otp-form";
import FloatingLabelInput from "@/components/floating-label-input";
import type { LoginFormData } from "@/types";
import { Mail, Lock, AlertCircle, Loader2 } from "lucide-react";
import GoogleSignInButton from "@/components/google-signin-button";
import { Checkbox } from "@/components/animate-ui/components/radix/checkbox";
import { HexagonBackground } from "@/components/animate-ui/components/backgrounds/hexagon";

export default function Login() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectPath = searchParams.get("redirect") || "/dashboard/cases";

  const {
    login,
    verifyLogin,
    isAuthenticated,
    isLoading: authLoading,
    loginWithGoogle,
  } = useAuth();
  const [formData, setFormData] = useState<LoginFormData>({
    email: "",
    password: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [otp, setOtp] = useState<string[]>(Array(6).fill(""));
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | undefined>(
    undefined
  );

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated && !authLoading) {
      router.push(redirectPath);
      // Reset OTP state if authenticated while OTP form is visible
      if (isOtpSent) {
        setIsOtpSent(false);
        setOtp(Array(6).fill(""));
        setSuccessMessage(undefined);
      }
    }
  }, [isAuthenticated, authLoading, router, redirectPath, isOtpSent]);

  // Clear success message after a few seconds
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => {
        setSuccessMessage(undefined);
      }, 5000); // 5 seconds
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.email) newErrors.email = "Email is required";
    if (!formData.password) newErrors.password = "Password is required";

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setIsLoading(true);
    try {
      await login(formData.email, formData.password, rememberMe);
      setIsOtpSent(true);
      setSuccessMessage("OTP sent successfully to your email.");
      setErrors({}); // Clear any previous errors
    } catch (error: any) {
      if (error.response?.data?.detail) {
        setErrors({ form: error.response.data.detail });
      } else {
        setErrors({ form: "Login failed. Please try again." });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleRequestOtpAgain = async () => {
    setIsLoading(true);
    setSuccessMessage(undefined); // Clear any existing success messages
    try {
      await login(formData.email, formData.password, rememberMe);
      setErrors({});
      setOtp(Array(6).fill(""));
      setIsOtpSent(true); // Ensure OTP form is shown after requesting again
      setSuccessMessage("New OTP sent successfully.");
    } catch (error: any) {
      if (error.response?.data?.detail) {
        setErrors({ form: error.response.data.detail });
      } else {
        setErrors({ form: "Failed to request OTP again. Please try again." });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();

    if (otp.some((digit) => !digit)) {
      setErrors({ otp: "Please enter the complete OTP." });
      return;
    }

    setIsLoading(true);
    try {
      // Pass email, otp, and rememberMe as separate arguments
      await verifyLogin(formData.email, otp.join(""), rememberMe);
      // Redirect is handled in the auth context
    } catch (error: any) {
      if (error.response?.data?.detail) {
        setErrors({ otp: error.response.data.detail });
      } else {
        setErrors({ otp: "OTP verification failed. Please try again." });
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-linear-to-b from-zinc-50 to-white dark:from-black dark:to-black">
        <Navigation />
        <div className="grow flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="animate-spin h-12 w-12 text-zinc-500 mx-auto" />
            <p className="mt-4 text-zinc-600 dark:text-zinc-400">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <HexagonBackground className="min-h-screen flex flex-col">
      <Navigation />

      <div className="grow flex items-center justify-center p-6 pt-20">
        <div className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-xl shadow-lg p-8 border border-zinc-200 dark:border-gray-800">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-zinc-800 dark:text-white">
              {isOtpSent ? "Verify OTP" : "Welcome Back"}
            </h1>
            <p className="text-zinc-600 dark:text-gray-300 mt-2">
              {isOtpSent
                ? "Enter the code sent to your email"
                : "Sign in to your account"}
            </p>
          </div>

          {errors.form && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg mb-6 flex items-center">
              <AlertCircle className="h-5 w-5 mr-2" />
              <span>{errors.form}</span>
            </div>
          )}

          {!isOtpSent ? (
            <form onSubmit={handleSubmit} className="space-y-6">
              <FloatingLabelInput
                type="email"
                id="email"
                name="email"
                label="Email Address"
                icon={Mail}
                value={formData.email}
                onChange={handleChange}
                error={errors.email}
                labelBg="bg-white dark:bg-zinc-900"
              />

              <FloatingLabelInput
                type="password"
                id="password"
                name="password"
                label="Password"
                icon={Lock}
                value={formData.password}
                onChange={handleChange}
                error={errors.password}
                labelBg="bg-white dark:bg-zinc-900"
              />

              <div className="flex items-center gap-2 pl-2">
                <Checkbox
                  id="remember_me"
                  checked={rememberMe}
                  onCheckedChange={(checked) => setRememberMe(checked === true)}
                  size="sm"
                />
                <label
                  htmlFor="remember_me"
                  className="text-sm text-zinc-900 dark:text-white cursor-pointer select-none"
                >
                  Remember me
                </label>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition-colors"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="animate-spin h-5 w-5 mr-2" />
                    <span>Logging in...</span>
                  </>
                ) : (
                  "Sign In"
                )}
              </button>

              <div className="text-center">
                <p className="text-sm text-zinc-600 dark:text-gray-300">
                  Don't have an account?{" "}
                  <Link
                    href="/register"
                    className="font-medium text-zinc-900 dark:text-white hover:text-zinc-700 dark:hover:text-gray-300"
                  >
                    Register
                  </Link>
                </p>
              </div>

              {/* Divider */}
              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-zinc-300 dark:border-zinc-700"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400">
                    Or continue with
                  </span>
                </div>
              </div>

              {/* Google Sign-In Button */}
              <GoogleSignInButton
                onSuccess={async (credential) => {
                  try {
                    setIsLoading(true);
                    await loginWithGoogle(credential, rememberMe);
                  } catch (error: any) {
                    setErrors({
                      form:
                        error.response?.data?.detail ||
                        "Google sign-in failed. Please try again.",
                    });
                  } finally {
                    setIsLoading(false);
                  }
                }}
                onError={() => {
                  setErrors({
                    form: "Google sign-in failed. Please try again.",
                  });
                }}
                text="signin"
                isLoading={isLoading}
              />
            </form>
          ) : (
            <OtpForm
              otp={otp}
              setOtp={setOtp}
              handleSubmit={handleVerifyOtp}
              isLoading={isLoading}
              error={errors.otp}
              successMessage={successMessage}
              title="Verify OTP"
              description="Your code was sent to you via email"
              onRequestAgain={handleRequestOtpAgain}
            />
          )}
        </div>
      </div>
    </HexagonBackground>
  );
}
