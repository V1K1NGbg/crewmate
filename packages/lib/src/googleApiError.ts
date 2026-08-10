/**
 * Returns true when a Google API error indicates an expired/revoked/invalid
 * access token. API routes use this to respond with 401 so the client can
 * trigger a re-authentication flow.
 */
export function isAuthError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as Record<string, unknown>;

  const status = (e.status ?? e.code) as number | string | undefined;
  if (status === 401 || status === "401")
    return true;

  const msg = String(e.message ?? "").toLowerCase();
  if (
    msg.includes("invalid_grant") ||
    msg.includes("invalid credentials") ||
    msg.includes("request had invalid authentication") ||
    msg.includes("unauthorized") ||
    msg.includes("insufficientpermissions")
  )
    return true;

  const response = e.response as Record<string, unknown> | undefined;
  if (response) {
    const rStatus = response.status as number | undefined;
    if (rStatus === 401) return true;
  }

  return false;
}

export type GoogleApiErrorCode =
  | "AUTH_EXPIRED"
  | "INSUFFICIENT_SCOPE"
  | "READ_ONLY_RESOURCE"
  | "RATE_LIMITED"
  | "RESOURCE_NOT_FOUND"
  | "REVISION_CONFLICT"
  | "PROVIDER_ERROR";

export interface PublicGoogleApiError {
  status: number;
  code: GoogleApiErrorCode;
  message: string;
  retryable: boolean;
}

/** Converts provider failures to stable, non-sensitive client errors. */
export function mapGoogleApiError(err: unknown): PublicGoogleApiError {
  if (isAuthError(err)) {
    return { status: 401, code: "AUTH_EXPIRED", message: "Google authorization expired", retryable: false };
  }
  const value = err && typeof err === "object" ? err as Record<string, unknown> : {};
  const response = value.response && typeof value.response === "object" ? value.response as Record<string, unknown> : {};
  const status = Number(value.status ?? value.code ?? response.status ?? 500);
  const message = String(value.message ?? "").toLowerCase();
  if (status === 404) return { status: 404, code: "RESOURCE_NOT_FOUND", message: "The Google resource no longer exists", retryable: false };
  if (status === 409 || /revision|conflict/.test(message)) return { status: 409, code: "REVISION_CONFLICT", message: "The resource changed since it was loaded", retryable: false };
  if (status === 429 || /rate|quota/.test(message)) return { status: 429, code: "RATE_LIMITED", message: "Google rate limit reached; try again later", retryable: true };
  if (status === 403 && /read.?only/.test(message)) return { status: 403, code: "READ_ONLY_RESOURCE", message: "This Google resource is read-only", retryable: false };
  if (status === 403) return { status: 403, code: "INSUFFICIENT_SCOPE", message: "Google did not grant permission for this operation", retryable: false };
  return { status: status >= 500 ? status : 502, code: "PROVIDER_ERROR", message: "Google could not complete the request", retryable: status >= 500 };
}
