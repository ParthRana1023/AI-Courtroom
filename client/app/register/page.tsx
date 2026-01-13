"use client";

import type React from "react";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/auth-context";
import Navigation from "@/components/navigation";
import OtpForm from "@/components/otp-form";
import FloatingLabelInput from "@/components/floating-label-input";
import DatePicker from "@/components/date-picker";
import type { RegisterFormData } from "@/types";
import Gender from "@/components/gender";
import {
  User,
  Mail,
  Phone,
  Calendar,
  Lock,
  AlertCircle,
  Loader2,
  ChevronDown,
} from "lucide-react";
import GoogleSignInButton from "@/components/google-signin-button";
import LocationSelector from "@/components/location-selector";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/animate-ui/components/radix/dropdown-menu";
import { HexagonBackground } from "@/components/animate-ui/components/backgrounds/hexagon";

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
    gender: undefined,
    // Location fields
    city: "",
    state: "",
    state_iso2: "",
    country: "",
    country_iso2: "",
    phone_code: "",
  });
  const [countryCode, setCountryCode] = useState("+91");
  const [googleId, setGoogleId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [otp, setOtp] = useState<string[]>(new Array(6).fill(""));
  const [isLoading, setIsLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(null);

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
          setProfilePhotoUrl(googleData.profile_photo_url || null);
          // Don't clear sessionStorage here - keep it until registration completes
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
    if (!formData.date_of_birth || isNaN(formData.date_of_birth.getTime())) {
      newErrors.date_of_birth = "Date of birth is required";
    } else {
      // Check if user is at least 18 years old
      const today = new Date();
      const birthDate = formData.date_of_birth;
      let age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      if (
        monthDiff < 0 ||
        (monthDiff === 0 && today.getDate() < birthDate.getDate())
      ) {
        age--;
      }
      if (age < 18) {
        newErrors.date_of_birth =
          "You must be at least 18 years old to register";
      }
    }

    if (!formData.gender) {
      newErrors.gender = "Please select a gender";
    }

    // Location validation
    if (!formData.city) {
      newErrors.city = "City is required";
    }
    if (!formData.state) {
      newErrors.state = "State is required";
    }
    if (!formData.country) {
      newErrors.country = "Country is required";
    }

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

  // Handle location selection
  const handleLocationSelect = (location: {
    city: string;
    state: string;
    state_iso2: string;
    country: string;
    country_iso2: string;
    phone_code: string;
  }) => {
    setFormData((prev) => ({
      ...prev,
      city: location.city,
      state: location.state,
      state_iso2: location.state_iso2,
      country: location.country,
      country_iso2: location.country_iso2,
      phone_code: location.phone_code,
    }));

    // Auto-update phone code dropdown based on country
    if (location.phone_code) {
      const newCode = `+${location.phone_code}`;
      // Check if this code exists in our list
      const matchingCode = countryCodes.find((cc) => cc.code === newCode);
      if (matchingCode) {
        setCountryCode(newCode);
      }
    }
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
      // Format date_of_birth as YYYY-MM-DD string for the API
      const formattedDob = formData.date_of_birth.toISOString().split("T")[0];

      // Include googleId if this is a Google sign-up
      const registrationData = googleId
        ? { ...formData, date_of_birth: formattedDob, google_id: googleId }
        : { ...formData, date_of_birth: formattedDob };
      const response = await register(registrationData);

      // If Google registration, auth context handles redirect, nothing more to do here
      if (response?.skip_otp) {
        // Clear Google data on successful registration
        if (typeof window !== "undefined") {
          sessionStorage.removeItem("googleUserData");
        }
        return;
      }

      // Regular registration - show OTP form
      setIsOtpSent(true);
      setSuccessMessage("OTP sent successfully to your email.");
    } catch (error: any) {
      if (error.response?.data?.detail) {
        // Handle Pydantic validation errors (422) which return an array of error objects
        const detail = error.response.data.detail;
        if (Array.isArray(detail)) {
          // Extract the first validation error message
          const firstError = detail[0];
          const fieldName = firstError.loc?.slice(-1)[0] || "field";
          const message = firstError.msg || "Validation error";
          setErrors({ form: `${fieldName}: ${message}` });
        } else if (typeof detail === "string") {
          setErrors({ form: detail });
        } else {
          setErrors({ form: "Validation failed. Please check your input." });
        }
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
      // Format date_of_birth as YYYY-MM-DD string for the API
      const formattedDob = formData.date_of_birth.toISOString().split("T")[0];
      const formattedData = { ...formData, date_of_birth: formattedDob };
      await verifyRegistration(formattedData, otp.join(""));
      // Clear Google data on successful registration
      if (typeof window !== "undefined") {
        sessionStorage.removeItem("googleUserData");
      }
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
      // Format date_of_birth as YYYY-MM-DD string for the API
      const formattedDob = formData.date_of_birth.toISOString().split("T")[0];
      await register({ ...formData, date_of_birth: formattedDob });
      setErrors({});
    } catch (err: any) {
      setErrors({ form: err.message || "Failed to resend OTP." });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <HexagonBackground className="min-h-screen flex flex-col">
      <Navigation />

      <div className="grow flex items-center justify-center p-4 pt-20">
        <div
          className={`w-full max-w-3xl rounded-xl shadow-lg p-6 border transition-colors duration-500 ${
            formData.gender === "male"
              ? "bg-slate-50 border-slate-200 dark:bg-slate-900 dark:border-slate-700"
              : formData.gender === "female"
              ? "bg-rose-50 border-rose-100 dark:bg-rose-950 dark:border-rose-900"
              : formData.gender === "others"
              ? "bg-violet-50 border-violet-100 dark:bg-violet-950 dark:border-violet-900"
              : formData.gender === "prefer-not-to-say"
              ? "bg-stone-50 border-stone-200 dark:bg-stone-900 dark:border-stone-700"
              : "bg-white border-zinc-200 dark:bg-zinc-900 dark:border-gray-800"
          }`}
        >
          <div className="text-center mb-6">
            <h1 className="text-3xl font-bold text-zinc-800 dark:text-white">
              {isOtpSent
                ? "Verify OTP"
                : isGoogleSignUp
                ? "Complete Registration"
                : "Create Account"}
            </h1>
            <p className="text-zinc-600 mt-2 dark:text-gray-300">
              {isOtpSent
                ? "Enter the code sent to your email"
                : isGoogleSignUp
                ? "Please set a password and complete your registration"
                : "Join the AI Courtroom simulation"}
            </p>
          </div>

          {errors.form && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg mb-6 flex items-center">
              <AlertCircle className="h-5 w-5 mr-2" />
              <span>{errors.form}</span>
            </div>
          )}

          {!isOtpSent ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Profile Photo Preview for Google Sign-up */}
              {isGoogleSignUp && (
                <div className="flex justify-center mb-4">
                  <div className="text-center">
                    <div className="w-20 h-20 mx-auto rounded-full overflow-hidden bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center shadow-md text-zinc-600 dark:text-zinc-300 text-xl font-bold">
                      {profilePhotoUrl ? (
                        <img
                          src={profilePhotoUrl}
                          alt="Profile"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span>
                          {(formData.first_name?.[0] || "").toUpperCase()}
                          {(formData.last_name?.[0] || "").toUpperCase() || "?"}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-2">
                      {profilePhotoUrl
                        ? "Google profile photo"
                        : "No photo available"}
                    </p>
                  </div>
                </div>
              )}

              {/* First Name and Last Name - side by side */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FloatingLabelInput
                  type="text"
                  id="first_name"
                  name="first_name"
                  label="First Name"
                  icon={User}
                  value={formData.first_name}
                  onChange={handleChange}
                  error={errors.first_name}
                  labelBg={
                    formData.gender === "male"
                      ? "bg-slate-50 dark:bg-slate-900"
                      : formData.gender === "female"
                      ? "bg-rose-50 dark:bg-rose-950"
                      : formData.gender === "others"
                      ? "bg-violet-50 dark:bg-violet-950"
                      : formData.gender === "prefer-not-to-say"
                      ? "bg-stone-50 dark:bg-stone-900"
                      : "bg-white dark:bg-zinc-900"
                  }
                />

                <FloatingLabelInput
                  type="text"
                  id="last_name"
                  name="last_name"
                  label="Last Name"
                  icon={User}
                  value={formData.last_name}
                  onChange={handleChange}
                  error={errors.last_name}
                  labelBg={
                    formData.gender === "male"
                      ? "bg-slate-50 dark:bg-slate-900"
                      : formData.gender === "female"
                      ? "bg-rose-50 dark:bg-rose-950"
                      : formData.gender === "others"
                      ? "bg-violet-50 dark:bg-violet-950"
                      : formData.gender === "prefer-not-to-say"
                      ? "bg-stone-50 dark:bg-stone-900"
                      : "bg-white dark:bg-zinc-900"
                  }
                />
              </div>

              {/* Gender on left, DOB and Phone stacked on right */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Gender
                  value={formData.gender}
                  onChange={(gender) =>
                    setFormData((prev) => ({ ...prev, gender }))
                  }
                  error={errors.gender}
                />

                <div className="flex flex-col gap-4">
                  <div title="Date of birth cannot be changed after registration">
                    <DatePicker
                      value={formData.date_of_birth}
                      onChange={(date) =>
                        setFormData((prev) => ({
                          ...prev,
                          date_of_birth: date,
                        }))
                      }
                      label="Date of Birth"
                      error={errors.date_of_birth}
                      labelBg={
                        formData.gender === "male"
                          ? "bg-slate-50 dark:bg-slate-900"
                          : formData.gender === "female"
                          ? "bg-rose-50 dark:bg-rose-950"
                          : formData.gender === "others"
                          ? "bg-violet-50 dark:bg-violet-950"
                          : formData.gender === "prefer-not-to-say"
                          ? "bg-stone-50 dark:bg-stone-900"
                          : "bg-white dark:bg-zinc-900"
                      }
                    />
                  </div>

                  <div>
                    <div className="flex">
                      {/* Country Code Dropdown */}
                      <DropdownMenu>
                        <DropdownMenuTrigger className="shrink-0 px-3 py-3 border-2 border-r-0 border-zinc-300 rounded-l-lg bg-white dark:bg-zinc-800 dark:border-zinc-600 dark:text-white focus:outline-none focus:border-blue-500 dark:focus:border-blue-400 flex items-center gap-1 transition-colors">
                          <span>
                            {
                              countryCodes.find((cc) => cc.code === countryCode)
                                ?.flag
                            }{" "}
                            {countryCode}
                          </span>
                          <ChevronDown className="h-4 w-4 opacity-50" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="start"
                          className="w-56 max-h-64 overflow-y-auto"
                        >
                          {countryCodes.map((cc) => (
                            <DropdownMenuItem
                              key={cc.code}
                              onClick={() => setCountryCode(cc.code)}
                              className="flex items-center gap-2 cursor-pointer"
                            >
                              <span className="text-lg">{cc.flag}</span>
                              <span className="flex-1">{cc.country}</span>
                              <span className="text-zinc-500 dark:text-zinc-400">
                                {cc.code}
                              </span>
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                      {/* Phone Number Input */}
                      <div className="relative grow">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-400 z-10" />
                        <input
                          type="tel"
                          id="phone_number"
                          name="phone_number"
                          value={formData.phone_number}
                          onChange={(e) => {
                            const value = e.target.value.replace(/\D/g, "");
                            setFormData((prev) => ({
                              ...prev,
                              phone_number: value,
                            }));
                          }}
                          maxLength={10}
                          className="block w-full pl-10 px-3 py-3 border-2 border-zinc-300 rounded-r-lg focus:outline-none focus:border-blue-500 dark:focus:border-blue-400 dark:border-zinc-600 dark:bg-transparent dark:text-white transition-colors"
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
              </div>

              {/* Location Selector */}
              <LocationSelector
                onLocationSelect={handleLocationSelect}
                initialValue={{
                  city: formData.city,
                  state: formData.state,
                  country: formData.country,
                }}
                errors={{
                  city: errors.city,
                  state: errors.state,
                  country: errors.country,
                }}
                labelBg={
                  formData.gender === "male"
                    ? "bg-slate-50 dark:bg-slate-900"
                    : formData.gender === "female"
                    ? "bg-rose-50 dark:bg-rose-950"
                    : formData.gender === "others"
                    ? "bg-violet-50 dark:bg-violet-950"
                    : formData.gender === "prefer-not-to-say"
                    ? "bg-stone-50 dark:bg-stone-900"
                    : "bg-white dark:bg-zinc-900"
                }
              />

              {/* Email and Password - side by side */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FloatingLabelInput
                  type="email"
                  id="email"
                  name="email"
                  label="Email Address"
                  icon={Mail}
                  value={formData.email}
                  onChange={handleChange}
                  disabled={isGoogleSignUp}
                  error={errors.email}
                  labelBg={
                    formData.gender === "male"
                      ? "bg-slate-50 dark:bg-slate-900"
                      : formData.gender === "female"
                      ? "bg-rose-50 dark:bg-rose-950"
                      : formData.gender === "others"
                      ? "bg-violet-50 dark:bg-violet-950"
                      : formData.gender === "prefer-not-to-say"
                      ? "bg-stone-50 dark:bg-stone-900"
                      : "bg-white dark:bg-zinc-900"
                  }
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
                  labelBg={
                    formData.gender === "male"
                      ? "bg-slate-50 dark:bg-slate-900"
                      : formData.gender === "female"
                      ? "bg-rose-50 dark:bg-rose-950"
                      : formData.gender === "others"
                      ? "bg-violet-50 dark:bg-violet-950"
                      : formData.gender === "prefer-not-to-say"
                      ? "bg-stone-50 dark:bg-stone-900"
                      : "bg-white dark:bg-zinc-900"
                  }
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition-colors"
              >
                {isLoading ? "Registering..." : "Create Account"}
              </button>

              <div className="text-center">
                <p className="text-sm text-zinc-600 dark:text-gray-300">
                  Already have an account?{" "}
                  <Link
                    href="/login"
                    className="font-medium text-zinc-900 dark:text-white hover:text-zinc-700 dark:hover:text-gray-300"
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
                      <div className="w-full border-t border-zinc-300 dark:border-zinc-700"></div>
                    </div>
                    <div className="relative flex justify-center text-sm">
                      <span
                        className={`px-2 text-zinc-500 dark:text-zinc-400 ${
                          formData.gender === "male"
                            ? "bg-slate-50 dark:bg-slate-900"
                            : formData.gender === "female"
                            ? "bg-rose-50 dark:bg-rose-950"
                            : formData.gender === "others"
                            ? "bg-violet-50 dark:bg-violet-950"
                            : formData.gender === "prefer-not-to-say"
                            ? "bg-stone-50 dark:bg-stone-900"
                            : "bg-white dark:bg-zinc-900"
                        }`}
                      >
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
    </HexagonBackground>
  );
}
