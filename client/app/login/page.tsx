"use client";

import type React from "react";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import Navigation from "@/components/navigation";
import OtpForm from "@/components/otp-form";
import type { LoginFormData } from "@/types";
import { Mail, Lock, AlertCircle, Loader2 } from "lucide-react";

export default function Login() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectPath = searchParams.get("redirect") || "/dashboard/cases";

  const {
    login,
    verifyLogin,
    isAuthenticated,
    isLoading: authLoading,
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
      <div className="min-h-screen flex flex-col bg-gradient-to-b from-zinc-50 to-white dark:from-black dark:to-black">
        <Navigation />
        <div className="flex-grow flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="animate-spin h-12 w-12 text-zinc-500 mx-auto" />
            <p className="mt-4 text-zinc-600 dark:text-zinc-400">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-zinc-50 to-white dark:from-black dark:to-black">
      <Navigation />

      <div className="flex-grow flex items-center justify-center p-6">
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
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-zinc-700 dark:text-white mb-1"
                >
                  Email Address
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Mail className="h-5 w-5 text-zinc-400" />
                  </div>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    className="pl-10 block w-full px-3 py-3 border border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:border-zinc-500"
                    placeholder="you@example.com"
                  />
                </div>
                {errors.email && (
                  <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                    {errors.email}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-zinc-700 dark:text-white mb-1"
                >
                  Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-zinc-400" />
                  </div>
                  <input
                    type="password"
                    id="password"
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    className="pl-10 block w-full px-3 py-3 border border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:border-zinc-500"
                    placeholder="••••••••"
                  />
                </div>
                {errors.password && (
                  <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                    {errors.password}
                  </p>
                )}
              </div>

              <div className="flex items-center">
                <input
                  id="remember_me"
                  name="remember_me"
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 text-black dark:text-white focus:ring-zinc-500 border-zinc-300 dark:border-zinc-700 rounded"
                />
                <label
                  htmlFor="remember_me"
                  className="ml-2 block text-sm text-zinc-900 dark:text-white"
                >
                  Remember me.
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
    </div>
  );
}
