"use client";

import type React from "react";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/auth-context";
import Navigation from "@/components/navigation";
import OtpForm from "@/components/otp-form";
import type { RegisterFormData } from "@/types";
import {
  User,
  Mail,
  Phone,
  Calendar,
  Lock,
  AlertCircle,
  Globe,
  Loader2,
} from "lucide-react";
import GoogleSignInButton from "@/components/google-signin-button";

// Country codes for phone numbers
const countryCodes = [
  { code: "+91", country: "India", flag: "🇮🇳" },
  { code: "+1", country: "USA/Canada", flag: "🇺🇸" },
  { code: "+44", country: "UK", flag: "🇬🇧" },
  { code: "+61", country: "Australia", flag: "🇦🇺" },
  { code: "+971", country: "UAE", flag: "🇦🇪" },
  { code: "+65", country: "Singapore", flag: "🇸🇬" },
  { code: "+49", country: "Germany", flag: "🇩🇪" },
  { code: "+33", country: "France", flag: "🇫🇷" },
  { code: "+81", country: "Japan", flag: "🇯🇵" },
  { code: "+86", country: "China", flag: "🇨🇳" },
];

export default function Register() {
  const { register, verifyRegistration, loginWithGoogle } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isGoogleSignUp = searchParams.get("google") === "true";

  const [formData, setFormData] = useState<RegisterFormData>({
    first_name: "",
    last_name: "",
    date_of_birth: new Date(),
    phone_number: "",
    email: "",
    password: "",
  });
  const [countryCode, setCountryCode] = useState("+91");
  const [googleId, setGoogleId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [otp, setOtp] = useState<string[]>(new Array(6).fill(""));
  const [isLoading, setIsLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  // Load Google data from sessionStorage if this is a Google sign-up
  useEffect(() => {
    if (isGoogleSignUp && typeof window !== "undefined") {
      const googleDataStr = sessionStorage.getItem("googleUserData");
      if (googleDataStr) {
        try {
          const googleData = JSON.parse(googleDataStr);
          setFormData((prev) => ({
            ...prev,
            first_name: googleData.first_name || "",
            last_name: googleData.last_name || "",
            email: googleData.email || "",
          }));
          setGoogleId(googleData.google_id || null);
          // Clear sessionStorage after reading
          sessionStorage.removeItem("googleUserData");
        } catch (e) {
          console.error("Failed to parse Google user data", e);
        }
      }
    }
  }, [isGoogleSignUp]);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.first_name) newErrors.first_name = "First name is required";
    if (!formData.last_name) newErrors.last_name = "Last name is required";
    if (!formData.date_of_birth || isNaN(formData.date_of_birth.getTime()))
      newErrors.date_of_birth = "Date of birth is required";
    if (!formData.phone_number)
      newErrors.phone_number = "Phone number is required";
    if (!/^\d{10}$/.test(formData.phone_number))
      newErrors.phone_number = "Phone number must be 10 digits";

    if (!formData.email) newErrors.email = "Email is required";
    if (!/\S+@\S+\.\S+/.test(formData.email))
      newErrors.email = "Email is invalid";

    if (!formData.password) newErrors.password = "Password is required";
    if (formData.password.length < 8)
      newErrors.password = "Password must be at least 8 characters";
    if (!/\d/.test(formData.password))
      newErrors.password = "Password must contain at least 1 digit";
    if (!/[a-zA-Z]/.test(formData.password))
      newErrors.password = "Password must contain at least 1 letter";
    if (!/[@$!%*#?&]/.test(formData.password))
      newErrors.password = "Password must contain at least 1 special character";

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === "date_of_birth" ? new Date(value) : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setIsLoading(true);
    try {
      // Include googleId if this is a Google sign-up
      const registrationData = googleId
        ? { ...formData, google_id: googleId }
        : formData;
      await register(registrationData);
      setIsOtpSent(true);
      setSuccessMessage("OTP sent successfully to your email.");
    } catch (error: any) {
      if (error.response?.data?.detail) {
        setErrors({ form: error.response.data.detail });
      } else {
        setErrors({ form: "Registration failed. Please try again." });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!otp) {
      setErrors({ otp: "OTP is required" });
      return;
    }

    setIsLoading(true);
    try {
      await verifyRegistration(formData, otp.join(""));
      router.push("/dashboard/cases");
    } catch (error: any) {
      setErrors({ otp: "OTP verification failed. Please try again." });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRequestAgain = async () => {
    setIsLoading(true);
    try {
      await register(formData);
      setErrors({});
    } catch (err: any) {
      setErrors({ form: err.message || "Failed to resend OTP." });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-linear-to-b from-gray-50 to-gray-100 dark:from-black dark:to-black">
      <Navigation />

      <div className="grow flex items-center justify-center p-6 pt-20">
        <div className="w-full max-w-2xl bg-white rounded-xl shadow-lg p-8 border border-gray-100 dark:bg-zinc-900 dark:border-gray-800">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-800 dark:text-white">
              {isOtpSent
                ? "Verify OTP"
                : isGoogleSignUp
                ? "Complete Registration"
                : "Create Account"}
            </h1>
            <p className="text-gray-600 mt-2 dark:text-gray-300">
              {isOtpSent
                ? "Enter the code sent to your email"
                : isGoogleSignUp
                ? "Please set a password and complete your registration"
                : "Join the AI Courtroom simulation"}
            </p>
          </div>

          {errors.form && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 flex items-center dark:bg-red-900 dark:border-red-700 dark:text-red-200">
              <AlertCircle className="h-5 w-5 mr-2" />
              <span>{errors.form}</span>
            </div>
          )}

          {!isOtpSent ? (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label
                    htmlFor="first_name"
                    className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300"
                  >
                    First Name
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <User className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                    </div>
                    <input
                      type="text"
                      id="first_name"
                      name="first_name"
                      value={formData.first_name}
                      onChange={handleChange}
                      className="pl-10 block w-full px-3 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder-gray-400"
                      placeholder="John"
                    />
                  </div>
                  {errors.first_name && (
                    <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                      {errors.first_name}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="last_name"
                    className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300"
                  >
                    Last Name
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <User className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                    </div>
                    <input
                      type="text"
                      id="last_name"
                      name="last_name"
                      value={formData.last_name}
                      onChange={handleChange}
                      className="pl-10 block w-full px-3 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder-gray-400"
                      placeholder="Doe"
                    />
                  </div>
                  {errors.last_name && (
                    <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                      {errors.last_name}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label
                    htmlFor="date_of_birth"
                    className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300"
                  >
                    Date of Birth
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Calendar className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                    </div>
                    <input
                      type="date"
                      id="date_of_birth"
                      name="date_of_birth"
                      value={formData.date_of_birth.toISOString().split("T")[0]}
                      onChange={handleChange}
                      className="pl-10 block w-full px-3 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder-gray-400"
                    />
                  </div>
                  {errors.date_of_birth && (
                    <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                      {errors.date_of_birth}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="phone_number"
                    className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300"
                  >
                    Phone Number
                  </label>
                  <div className="flex">
                    {/* Country Code Dropdown */}
                    <select
                      value={countryCode}
                      onChange={(e) => setCountryCode(e.target.value)}
                      className="shrink-0 px-3 py-3 border border-r-0 border-gray-300 rounded-l-lg shadow-sm bg-white dark:bg-zinc-800 dark:border-zinc-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      {countryCodes.map((cc) => (
                        <option key={cc.code} value={cc.code}>
                          {cc.flag} {cc.code}
                        </option>
                      ))}
                    </select>
                    {/* Phone Number Input - Numerical Only */}
                    <div className="relative grow">
                      <input
                        type="tel"
                        id="phone_number"
                        name="phone_number"
                        value={formData.phone_number}
                        onChange={(e) => {
                          // Only allow numerical input
                          const value = e.target.value.replace(/\D/g, "");
                          setFormData((prev) => ({
                            ...prev,
                            phone_number: value,
                          }));
                        }}
                        maxLength={10}
                        className="block w-full px-3 py-3 border border-gray-300 rounded-r-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder-gray-400"
                        placeholder="Enter 10 digit number"
                      />
                    </div>
                  </div>
                  {errors.phone_number && (
                    <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                      {errors.phone_number}
                    </p>
                  )}
                </div>
              </div>

              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300"
                >
                  Email Address
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Mail className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                  </div>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    disabled={isGoogleSignUp}
                    className={`pl-10 block w-full px-3 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder-gray-400 ${
                      isGoogleSignUp
                        ? "bg-gray-100 dark:bg-zinc-700 cursor-not-allowed"
                        : ""
                    }`}
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
                  className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300"
                >
                  Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                  </div>
                  <input
                    type="password"
                    id="password"
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    className="pl-10 block w-full px-3 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder-gray-400"
                    placeholder="••••••••"
                  />
                </div>
                {errors.password && (
                  <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                    {errors.password}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition-colors"
              >
                {isLoading ? "Registering..." : "Create Account"}
              </button>

              <div className="text-center">
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Already have an account?{" "}
                  <Link
                    href="/login"
                    className="font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300"
                  >
                    Sign in
                  </Link>
                </p>
              </div>

              {/* Only show Google sign-up option if not already signing up via Google */}
              {!isGoogleSignUp && (
                <>
                  {/* Divider */}
                  <div className="relative my-4">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-gray-300 dark:border-zinc-700"></div>
                    </div>
                    <div className="relative flex justify-center text-sm">
                      <span className="px-2 bg-white dark:bg-zinc-900 text-gray-500 dark:text-zinc-400">
                        Or continue with
                      </span>
                    </div>
                  </div>

                  {/* Google Sign-Up Button */}
                  <GoogleSignInButton
                    onSuccess={async (credential) => {
                      try {
                        setIsLoading(true);
                        await loginWithGoogle(credential, false);
                      } catch (error: any) {
                        setErrors({
                          form:
                            error.response?.data?.detail ||
                            "Google sign-up failed. Please try again.",
                        });
                      } finally {
                        setIsLoading(false);
                      }
                    }}
                    onError={() => {
                      setErrors({
                        form: "Google sign-up failed. Please try again.",
                      });
                    }}
                    text="signup"
                    isLoading={isLoading}
                  />
                </>
              )}
            </form>
          ) : (
            <OtpForm
              otp={otp}
              setOtp={setOtp}
              handleSubmit={handleVerifyOtp}
              isLoading={isLoading}
              error={errors.otp}
              title="Verify OTP"
              description="Enter the code sent to your email"
              onRequestAgain={handleRequestAgain}
              successMessage={successMessage}
            />
          )}
        </div>
      </div>
    </div>
  );
}
