"use client";

import type React from "react";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Navigation from "@/components/navigation";
import { caseAPI } from "@/lib/api";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { CaseGenerationFormData } from "@/types";
import { caseGenerationRateLimitAPI, RateLimitInfo } from "@/lib/rateLimitAPI";
import { formatSecondsToHMS } from "@/lib/utils";
import GavelLoader from "@/components/gavel-loader";

export default function GenerateCase() {
  const router = useRouter();
  const [formData, setFormData] = useState<CaseGenerationFormData>({
    sections_involved: 1,
    section_numbers: [],
  });
  const [sectionInput, setSectionInput] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [rateLimit, setRateLimit] = useState<RateLimitInfo | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);

  useEffect(() => {
    const fetchRateLimit = async () => {
      try {
        const info =
          await caseGenerationRateLimitAPI.getCaseGenerationRateLimit();
        setRateLimit(info);
        if (info.seconds_until_next) {
          setTimeRemaining(Math.ceil(info.seconds_until_next));
        } else {
          setTimeRemaining(null);
        }
      } catch (error) {
        console.error("Failed to fetch rate limit:", error);
        setErrors({ form: "Failed to load rate limit information." });
      }
    };

    fetchRateLimit();
    // const interval = setInterval(fetchRateLimit, 5000); // Refresh every 5 seconds
    // return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (timeRemaining === null || timeRemaining <= 0) return;

    const timer = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev === null || prev <= 1) {
          const fetchRateLimit = async () => {
            try {
              const info =
                await caseGenerationRateLimitAPI.getCaseGenerationRateLimit();
              setRateLimit(info);
              if (info.seconds_until_next) {
                setTimeRemaining(Math.ceil(info.seconds_until_next));
              } else {
                setTimeRemaining(null);
              }
            } catch (error) {
              console.error("Failed to fetch rate limit:", error);
              setErrors({ form: "Failed to load rate limit information." });
            }
          };
          fetchRateLimit(); // Refresh rate limit info when timer reaches zero
          return null;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [timeRemaining]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: Number.parseInt(value) }));
  };

  const handleAddSection = () => {
    const section = Number.parseInt(sectionInput);
    if (isNaN(section)) {
      setErrors({ section: "Please enter a valid section number" });
      return;
    }

    if (formData.section_numbers.includes(section)) {
      setErrors({ section: "This section is already added" });
      return;
    }

    setFormData((prev) => ({
      ...prev,
      section_numbers: [...prev.section_numbers, section],
    }));
    setSectionInput("");
    setErrors({});
  };

  const handleRemoveSection = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      section_numbers: prev.section_numbers.filter((_, i) => i !== index),
    }));
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (formData.sections_involved < 1) {
      newErrors.sections_involved = "Number of sections must be at least 1";
    }

    if (formData.section_numbers.length === 0) {
      newErrors.section_numbers = "Please add at least one section number";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setIsLoading(true);
    try {
      const newCase = await caseAPI.generateCase(formData);
      // Don't set isLoading to false here - let the page navigate while showing loading
      router.push(`/dashboard/cases/${newCase.cnr}`);
    } catch (error: any) {
      // Only reset loading on error
      setIsLoading(false);
      if (error.response?.data?.detail) {
        setErrors({ form: error.response.data.detail });
      } else {
        setErrors({ form: "Failed to generate case. Please try again." });
      }
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navigation />
        <div className="grow flex items-center justify-center">
          <GavelLoader message="Generating case..." />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />

      <div className="grow container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto bg-white rounded-lg shadow-md p-6 dark:bg-zinc-900 dark:border-zinc-800 relative">
          <h1 className="text-2xl font-bold mb-6">Generate New Case</h1>
          {errors.form && (
            <Alert variant="destructive" className="mb-4">
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{errors.form}</AlertDescription>
            </Alert>
          )}
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label
                htmlFor="sections_involved"
                className="block text-sm font-medium text-gray-700 dark:text-white"
              >
                Number of Sections Involved
              </label>
              <input
                type="number"
                id="sections_involved"
                name="sections_involved"
                min="1"
                value={formData.sections_involved}
                onChange={handleChange}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
              />
              {errors.sections_involved && (
                <p className="mt-1 text-sm text-red-600">
                  {errors.sections_involved}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="section_numbers"
                className="block text-sm font-medium text-gray-700 dark:text-white"
              >
                Section Numbers
              </label>
              <div className="mt-1 flex">
                <input
                  type="number"
                  id="section_input"
                  value={sectionInput}
                  onChange={(e) => setSectionInput(e.target.value)}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-l-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                  placeholder="Enter section number"
                />
                <button
                  type="button"
                  onClick={handleAddSection}
                  className="inline-flex items-center px-4 py-2 border border-transparent rounded-r-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Add
                </button>
              </div>
              {errors.section && (
                <p className="mt-1 text-sm text-red-600">{errors.section}</p>
              )}

              {formData.section_numbers.length > 0 ? (
                <div className="mt-4">
                  <p className="text-sm font-medium text-gray-700 mb-2 dark:text-white">
                    Added Sections:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {formData.section_numbers.map((section, index) => (
                      <div
                        key={index}
                        className="bg-gray-100 px-3 py-1 rounded-full flex items-center"
                      >
                        <span className="text-sm text-black">{section}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveSection(index)}
                          className="ml-2 text-gray-500 hover:text-gray-700"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-4 w-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                errors.section_numbers && (
                  <p className="mt-1 text-sm text-red-600">
                    {errors.section_numbers}
                  </p>
                )
              )}
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => router.back()}
                className="mr-4 px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Cancel
              </button>
              <button
                type="submit"
                className={`inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${
                  isLoading || (rateLimit && rateLimit.remaining_attempts <= 0)
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                }`}
                disabled={
                  isLoading || (rateLimit?.remaining_attempts ?? 1) <= 0
                }
              >
                {isLoading ? "Generating..." : "Generate Case"}
              </button>
            </div>
          </form>
          {rateLimit && (
            <div className="mt-6 text-sm text-gray-600 dark:text-gray-400">
              <p>
                Remaining case generations: {rateLimit.remaining_attempts} /{" "}
                {rateLimit.max_attempts}
              </p>
              {rateLimit.remaining_attempts <= 0 && timeRemaining !== null && (
                <p className="text-red-500">
                  Rate limit exceeded. Try again in{" "}
                  {formatSecondsToHMS(timeRemaining)}.
                </p>
              )}
            </div>
          )}
          <br />
          <p className="text-sm text-gray-600 dark:text-zinc-400 mb-6">
            Note: Enter the number of sections involved and specific section
            numbers (eg. 420, 315, 149, etc) to generate a new case. The AI will
            use these section numbers to determine the type of case (e.g.,
            criminal, civil, constitutional) and generate a detailed case
            summary and analysis accordingly.
          </p>
        </div>
      </div>
    </div>
  );
}
