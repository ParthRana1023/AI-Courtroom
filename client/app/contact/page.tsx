"use client";

import type React from "react";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Navigation from "@/components/navigation";
import { contactAPI, authAPI } from "@/lib/api";
import type { ContactFormData, FeedbackCategory } from "@/types";
import {
  MessageSquare,
  AlertCircle,
  CheckCircle,
  ChevronDown,
  FolderKanban,
} from "lucide-react";
import { HexagonBackground } from "@/components/animate-ui/components/backgrounds/hexagon";
import { useLifecycleLogger } from "@/hooks/use-performance-logger";

const feedbackCategories: { value: FeedbackCategory; label: string }[] = [
  { value: "general", label: "General Feedback" },
  { value: "courtroom", label: "Courtroom Experience" },
  { value: "case_generation", label: "Case Generation" },
  { value: "user_interface", label: "User Interface" },
  { value: "performance", label: "Performance" },
  { value: "bug_report", label: "Bug Report" },
  { value: "feature_request", label: "Feature Request" },
  { value: "other", label: "Other" },
];

export default function Contact() {
  useLifecycleLogger("Contact");

  const router = useRouter();
  const [formData, setFormData] = useState<ContactFormData>({
    feedback_category: "general",
    message: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.feedback_category)
      newErrors.feedback_category = "Please select a category";

    if (!formData.message) newErrors.message = "Message is required";
    if (formData.message.length < 10)
      newErrors.message = "Message must be at least 10 characters";

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Check if user is authenticated
    if (!authAPI.isAuthenticated()) {
      setErrors({ form: "Please login to submit feedback." });
      return;
    }

    if (!validateForm()) return;

    setIsLoading(true);
    try {
      await contactAPI.submitContactForm(formData);
      setIsSuccess(true);
      setFormData({
        feedback_category: "general",
        message: "",
      });
    } catch (error: any) {
      if (error.response?.status === 401) {
        setErrors({ form: "Please login to submit feedback." });
      } else if (error.response?.data?.detail) {
        setErrors({ form: error.response.data.detail });
      } else {
        setErrors({ form: "Failed to submit form. Please try again." });
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <HexagonBackground className="min-h-screen flex flex-col flex-1 p-0 pt-16">
      <Navigation />

      <div className="grow container mx-auto px-4 py-8">
        <div className="max-w-3xl mx-auto bg-white dark:bg-zinc-900 rounded-xl shadow-lg p-8 border border-zinc-200 dark:border-zinc-800">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-zinc-800 dark:text-zinc-100">
              Feedback Form
            </h1>
            <p className="text-zinc-600 dark:text-zinc-400 mt-2">
              We'd love to hear from you. Please share your valuable insights.
            </p>
          </div>

          {isSuccess && (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 px-4 py-3 rounded-lg mb-6 flex items-center">
              <CheckCircle className="h-5 w-5 mr-2" />
              <span>
                Your feedback has been sent successfully! We're grateful for
                your feedback!
              </span>
            </div>
          )}

          {errors.form && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg mb-6 flex items-center">
              <AlertCircle className="h-5 w-5 mr-2" />
              <span>{errors.form}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label
                htmlFor="feedback_category"
                className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1"
              >
                What would you like to give feedback about?
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <FolderKanban className="h-5 w-5 text-zinc-400" />
                </div>
                <select
                  id="feedback_category"
                  name="feedback_category"
                  value={formData.feedback_category}
                  onChange={handleChange}
                  className="pl-10 pr-10 block w-full px-3 py-3 border border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:border-zinc-500 appearance-none cursor-pointer"
                >
                  {feedbackCategories.map((category) => (
                    <option key={category.value} value={category.value}>
                      {category.label}
                    </option>
                  ))}
                </select>
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                  <ChevronDown className="h-5 w-5 text-zinc-400" />
                </div>
              </div>
              {errors.feedback_category && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                  {errors.feedback_category}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="message"
                className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1"
              >
                Your Feedback
              </label>
              <div className="relative">
                <div className="absolute top-3 left-3 pointer-events-none">
                  <MessageSquare className="h-5 w-5 text-zinc-400" />
                </div>
                <textarea
                  id="message"
                  name="message"
                  rows={5}
                  value={formData.message}
                  onChange={handleChange}
                  className="pl-10 block w-full px-3 py-3 border border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:border-zinc-500"
                  placeholder="Please provide us with your valuable feedback or suggestions for improvement."
                />
              </div>
              {errors.message && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                  {errors.message}
                </p>
              )}
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isLoading}
                className="px-6 py-3 border border-transparent rounded-lg shadow-sm text-base font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-zinc-500 disabled:opacity-50 transition-colors flex items-center"
              >
                {isLoading ? (
                  <>
                    <span className="animate-spin mr-2">
                      <svg
                        className="h-5 w-5"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                    </span>
                    <span>Sending...</span>
                  </>
                ) : (
                  "Send Feedback"
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </HexagonBackground>
  );
}
