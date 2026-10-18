import { localAuthEnabled, signOut } from "@/auth";
import { isSameOriginMutation, privateServiceOrigin } from "@crewmate/lib/server";
import { privateJson } from "@/lib/home.server";

export async function POST(request: Request) {
  if (!isSameOriginMutation(request, process.env.AUTH_URL ?? process.env.NEXTAUTH_URL)) return privateJson({ error: "Invalid request origin" }, 403);
  let redirectUrl = "/";
  if (localAuthEnabled) {
    try {
      const origin = privateServiceOrigin(process.env.CREWMATE_IDENTITY_URL ?? process.env.AUTH_OIDC_ISSUER);
      if (!origin) throw new Error("Missing identity origin");
      redirectUrl = `${origin}/logout`;
    } catch { return privateJson({ error: "Identity logout address is not configured" }, 503); }
  }
  await signOut({ redirect: false, redirectTo: "/" });
  return privateJson({ redirectUrl });
}
