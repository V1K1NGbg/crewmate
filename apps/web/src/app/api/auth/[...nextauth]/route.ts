import { handlers } from "@/auth";
import { NextResponse, type NextRequest } from "next/server";
import { sanitizeBrowserSession } from "@crewmate/lib/server";

/**
 * Keep Google bearer credentials out of the browser-visible session JSON.
 * Both GET (read) and POST (`update()`) on `/session` return the session, so
 * both must be sanitized.
 */
async function sanitizeSessionResponse(req: NextRequest, response: Response): Promise<Response> {
  if (!req.nextUrl.pathname.endsWith("/session") || !response.ok) return response;
  const body: unknown = await response.json().catch(() => null);
  const session = body && typeof body === "object" && !Array.isArray(body)
    ? sanitizeBrowserSession(body as Record<string, unknown>)
    : body;
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("content-type");
  return NextResponse.json(session, { status: response.status, headers });
}

export async function GET(req: NextRequest) {
  return sanitizeSessionResponse(req, await handlers.GET(req));
}

export async function POST(req: NextRequest) {
  return sanitizeSessionResponse(req, await handlers.POST(req));
}
