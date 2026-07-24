export type RepositoryErrorCode =
  | "not_configured"
  | "not_authenticated"
  | "permission_denied"
  | "not_found"
  | "conflict"
  | "offline"
  | "invalid"
  | "unknown";

export interface RepositoryError {
  code: RepositoryErrorCode;
  message: string;
  retryable: boolean;
  detail?: string;
}

export type RepositoryResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: RepositoryError };

interface ErrorLike {
  code?: string;
  message?: string;
  details?: string;
}

export function success<T>(data: T): RepositoryResult<T> {
  return { ok: true, data };
}

export function failure(error: unknown, fallback = "AIko could not save your changes."): RepositoryResult<never> {
  const value = typeof error === "object" && error !== null ? error as ErrorLike : {};
  const code = value.code === "PGRST116"
    ? "not_found"
    : value.code === "23505"
      ? "conflict"
      : value.code === "42501"
        ? "permission_denied"
        : typeof navigator !== "undefined" && !navigator.onLine
          ? "offline"
          : "unknown";
  if (process.env.NODE_ENV === "development") console.error("[AIko repository]", error);
  return {
    ok: false,
    error: {
      code,
      message: code === "permission_denied" ? "You do not have permission to do that." : fallback,
      retryable: code === "offline" || code === "unknown",
      detail: process.env.NODE_ENV === "development" ? value.details ?? value.message : undefined,
    },
  };
}

export function notConfigured<T>(): RepositoryResult<T> {
  return {
    ok: false,
    error: {
      code: "not_configured",
      message: "AIko is running in local demo mode.",
      retryable: false,
    },
  };
}
