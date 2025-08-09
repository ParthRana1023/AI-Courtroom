// API service for rate limit information
import { fetchWithAuth } from "./fetchWithAuth";

export interface RateLimitInfo {
  remaining_attempts: number;
  max_attempts: number;
  seconds_until_next: number | null;
}

export const argumentRateLimitAPI = {
  getArgumentRateLimit: async (): Promise<RateLimitInfo> => {
    const response = await fetchWithAuth("/limit/argument");
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || "Failed to get rate limit information");
    }
    return response.json();
  },
};

export const caseGenerationRateLimitAPI = {
  getCaseGenerationRateLimit: async (): Promise<RateLimitInfo> => {
    const response = await fetchWithAuth("/limit/case-generation");
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || "Failed to get rate limit information");
    }
    return response.json();
  },
};
