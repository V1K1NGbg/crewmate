/** Defensive copy used before an Auth.js session is serialized to browser JavaScript. */
export function sanitizeBrowserSession(value: Record<string, unknown>): Record<string, unknown> {
  const session = { ...value };
  delete session.accessToken;
  delete session.refreshToken;
  return session;
}
