import { handlers, localAuthEnabled } from "@/auth";
import { type NextRequest } from "next/server";
import { browserAuthResponse } from "@crewmate/lib/server";

export async function POST(req: NextRequest) {
  return browserAuthResponse(req, await handlers.POST(req),
    localAuthEnabled ? process.env.CREWMATE_IDENTITY_URL ?? process.env.AUTH_OIDC_ISSUER ?? "" : undefined);
}

/** Keep Google bearer credentials out of the browser-visible session JSON. */
export async function GET(req: NextRequest) {
  return browserAuthResponse(req, await handlers.GET(req));
}
