import api from "./api";

/**
 * Wraps the api instance to automatically include authentication headers.
 * Use this for making authenticated API calls.
 */
export const fetchWithAuth = async (url: string, options?: any) => {
  try {
    const response = await api({
      method: options?.method || "get",
      url: url,
      data: options?.body,
      headers: {
        ...options?.headers,
      },
      params: options?.params,
    });
    // Simulate fetch API response structure for compatibility
    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      json: async () => response.data,
      text: async () => JSON.stringify(response.data), // Or handle text response if needed
      // Add other fetch-like properties/methods as needed
    };
  } catch (error: any) {
    // Re-throw the error after handling (e.g., logging, redirect in interceptor)
    throw error;
  }
};
