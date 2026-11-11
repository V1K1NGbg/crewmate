/**
 * Client-side fetch helper for Crewmate's own `/api/*` routes.
 *
 * Every route returns `{ error, code? }` on failure (see
 * `apps/web/src/lib/google-error-response.ts`). This helper checks
 * `response.ok`, preserves that safe error code, and throws a typed
 * {@link ApiError} so hooks can react to `AUTH_EXPIRED` consistently.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  readonly retryable: boolean;

  constructor(status: number, message: string, code?: string, retryable = false) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.retryable = retryable;
  }

  /** True when the user must sign in again for the request to succeed. */
  get isAuthExpired(): boolean {
    return this.status === 401 || this.code === "AUTH_EXPIRED";
  }
}

/** Builds an {@link ApiError} from a non-OK response body of unknown shape. */
export function apiErrorFromBody(status: number, body: unknown, fallback: string): ApiError {
  const record = body && typeof body === "object" && !Array.isArray(body)
    ? body as Record<string, unknown>
    : {};
  const message = typeof record.error === "string" && record.error.trim()
    ? record.error
    : fallback;
  const code = typeof record.code === "string" ? record.code : undefined;
  return new ApiError(status, message, code, record.retryable === true);
}

/** True for errors produced by an aborted fetch; these should never be shown. */
export function isAbortError(error: unknown): boolean {
  return (
    (typeof DOMException !== "undefined" && error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

/** Returns a user-presentable message for any thrown value. */
export function apiErrorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

/**
 * Fetches JSON from an internal API route. Throws {@link ApiError} for non-2xx
 * responses and rethrows abort errors untouched.
 */
export async function apiFetch<T = unknown>(
  input: string,
  init?: RequestInit & { fallbackError?: string },
): Promise<T> {
  const { fallbackError = "Request failed", ...requestInit } = init ?? {};
  const response = await fetch(input, requestInit);
  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }
  if (!response.ok) throw apiErrorFromBody(response.status, body, fallbackError);
  return body as T;
}

/** Convenience for JSON request bodies. */
export function jsonRequest(method: string, payload: unknown, signal?: AbortSignal): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  };
}
