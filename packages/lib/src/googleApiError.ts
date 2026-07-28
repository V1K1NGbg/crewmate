/**
 * Returns true when a Google API error indicates an expired/revoked/invalid
 * access token. API routes use this to respond with 401 so the client can
 * trigger a re-authentication flow.
 */
export function isAuthError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as Record<string, unknown>;

  const status = (e.status ?? e.code) as number | string | undefined;
  if (status === 401 || status === 403 || status === "401" || status === "403")
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
    if (rStatus === 401 || rStatus === 403) return true;
  }

  return false;
}
