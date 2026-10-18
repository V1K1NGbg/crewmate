import { auth, localAuthEnabled } from "@/auth";
import { NextResponse } from "next/server";
import { isSameOriginMutation } from "@crewmate/lib/server";

export function privateJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}

export async function authorizeHome(request: Request, mutation = false) {
  const session = await auth();
  if (!session || !localAuthEnabled || !session.localOwner) return privateJson({ error: "Owner authentication required" }, 401);
  if (mutation && !isSameOriginMutation(request, process.env.AUTH_URL ?? process.env.NEXTAUTH_URL)) {
    return privateJson({ error: "Invalid request origin or content type" }, 403);
  }
  return null;
}
