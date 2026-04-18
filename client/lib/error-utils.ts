interface ErrorResponseShape {
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

export function getErrorStatus(error: unknown): number | undefined {
  return isErrorResponseShape(error) ? error.response?.status : undefined;
}

export function getErrorDetail(error: unknown): string | undefined {
  if (!isErrorResponseShape(error)) return undefined;

  const detail = error.response?.data?.detail;
  if (typeof detail === "string") return detail;

  return typeof error.message === "string" ? error.message : undefined;
}

export function getValidationErrorDetail(error: unknown): string | undefined {
  if (!isErrorResponseShape(error)) return undefined;

  const detail = error.response?.data?.detail;
  if (Array.isArray(detail)) {
    const firstError = detail[0] as
      | { loc?: unknown[]; msg?: string }
      | undefined;
    const fieldName = firstError?.loc?.slice(-1)[0] || "field";
    const message = firstError?.msg || "Validation error";
    return `${fieldName}: ${message}`;
  }

  return typeof detail === "string" ? detail : undefined;
}
