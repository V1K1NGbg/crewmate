import { handlers } from "@/auth";
import { NextResponse, type NextRequest } from "next/server";
import { sanitizeBrowserSession } from "@crewmate/lib/server";

export const POST = handlers.POST;

/** Keep Google bearer credentials out of the browser-visible session JSON. */
export async function GET(req: NextRequest) {
  const response = await handlers.GET(req);
  if (!req.nextUrl.pathname.endsWith("/session") || !response.ok) return response;

  const session = sanitizeBrowserSession(
    (await response.json()) as Record<string, unknown>,
  );
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("content-type");
  return NextResponse.json(session, { status: response.status, headers });
}
