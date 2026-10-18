import { privateServiceOrigin } from "./homeAccess.ts";

/** Defensive copy used before an Auth.js session is serialized to browser JavaScript. */
export function sanitizeBrowserSession(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const session: Record<string, unknown> = { ...value };
  delete session.accessToken;
  delete session.refreshToken;
  return session;
}

/** Apply browser-only policy after Auth.js has validated CSRF and handled cookies. */
export async function browserAuthResponse(request: Request, response: Response, identityOrigin?: string): Promise<Response> {
  const path = new URL(request.url).pathname;
  const headers = new Headers(response.headers);
  if (path.endsWith("/session") && response.ok) {
    headers.delete("content-length");
    headers.delete("content-type");
    return Response.json(sanitizeBrowserSession(await response.json()), { status: response.status, headers });
  }

  const clearsSession = response.headers.getSetCookie().some(cookie =>
    /^(?:__Secure-)?authjs\.session-token(?:\.\d+)?=;/.test(cookie) && /;\s*Max-Age=0(?:;|$)/i.test(cookie));
  if (identityOrigin !== undefined && request.method === "POST" && path.endsWith("/signout") &&
      response.status >= 200 && response.status < 400 && clearsSession) {
    let url: string;
    try {
      const origin = privateServiceOrigin(identityOrigin);
      if (!origin) throw new Error("Missing identity origin");
      url = `${origin}/logout`;
    } catch {
      headers.delete("location");
      headers.delete("content-length");
      headers.delete("content-type");
      return Response.json({ error: "Identity logout address is not configured" }, { status: 503, headers });
    }
    headers.set("location", url);
    headers.delete("content-length");
    if (response.ok) {
      headers.delete("content-type");
      return Response.json({ url }, { status: response.status, headers });
    }
    return new Response(null, { status: response.status, headers });
  }
  return response;
}
