import api from "./api";
import type { AxiosRequestHeaders, Method } from "axios";

interface FetchWithAuthOptions {
  method?: Method;
  body?: unknown;
  headers?: AxiosRequestHeaders;
  params?: Record<string, unknown>;
}

/**
 * Wraps the api instance to automatically include authentication headers.
 * Use this for making authenticated API calls.
 */
export const fetchWithAuth = async (
  url: string,
  options?: FetchWithAuthOptions,
) => {
  const response = await api({
    method: options?.method || "get",
    url,
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
    text: async () => JSON.stringify(response.data),
  };
};
