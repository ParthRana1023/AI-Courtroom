import { SERVER_UNREACHABLE } from "@/lib/messages";

interface ErrorResponseShape {
  code?: string;
  response?: {
    status?: number;
    data?: {
      detail?: unknown;
    };
  };
  message?: string;
}

function isErrorResponseShape(error: unknown): error is ErrorResponseShape {
  return typeof error === "object" && error !== null;
}

export function getErrorDetail(error: unknown): string | undefined {
  if (!isErrorResponseShape(error)) return undefined;

  const detail = error.response?.data?.detail;
  if (typeof detail === "string") return detail;
  // FastAPI validation errors: a list; show the first message.
  if (Array.isArray(detail) && typeof detail[0]?.msg === "string") {
    return (detail[0].msg as string).replace(/^Value error, /, "");
  }

  // Axios network failure: no response reached us at all.
  if (!error.response && error.code === "ERR_NETWORK") return SERVER_UNREACHABLE;

  return typeof error.message === "string" ? error.message : undefined;
}
