"use client";

import type React from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Navigation from "@/components/navigation";
import { caseAPI } from "@/lib/api";
import type { CaseGenerationFormData } from "@/types";

export default function GenerateCase() {
  const router = useRouter();
  const [formData, setFormData] = useState<CaseGenerationFormData>({
    sections_involved: 1,
    section_numbers: [],
  });
  const [sectionInput, setSectionInput] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);

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
      router.push(`/dashboard/cases/${newCase.cnr}`);
    } catch (error: any) {
      if (error.response?.data?.detail) {
        setErrors({ form: error.response.data.detail });
      } else {
        setErrors({ form: "Failed to generate case. Please try again." });
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />

      <div className="flex-grow container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto bg-white rounded-lg shadow-md p-6">
          <h1 className="text-2xl font-bold mb-6">Generate New Case</h1>

          {errors.form && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
              {errors.form}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label
                htmlFor="sections_involved"
                className="block text-sm font-medium text-gray-700"
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
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
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
                className="block text-sm font-medium text-gray-700"
              >
                Section Numbers
              </label>
              <div className="mt-1 flex">
                <input
                  type="number"
                  id="section_input"
                  value={sectionInput}
                  onChange={(e) => setSectionInput(e.target.value)}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-l-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
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
                <div className="mt-2">
                  <p className="text-sm font-medium text-gray-700 mb-2">
                    Added Sections:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {formData.section_numbers.map((section, index) => (
                      <div
                        key={index}
                        className="bg-gray-100 px-3 py-1 rounded-full flex items-center"
                      >
                        <span className="text-sm">{section}</span>
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
                disabled={isLoading}
                className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
              >
                {isLoading ? "Generating..." : "Generate Case"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
