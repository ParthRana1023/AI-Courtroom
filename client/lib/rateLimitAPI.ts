// API service for rate limit information
import { fetchWithAuth } from "./fetchWithAuth";

export interface RateLimitInfo {
  remaining_attempts: number;
  max_attempts: number;
  seconds_until_next: number | null;
}

export const rateLimitAPI = {
  getArgumentRateLimit: async (): Promise<RateLimitInfo> => {
    const response = await fetchWithAuth("/arguments/limit");
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || "Failed to get rate limit information");
    }
    return response.json();
  },
};
