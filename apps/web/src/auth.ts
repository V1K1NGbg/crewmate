import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { createHmac } from "node:crypto";
import { isLocalOwner } from "@crewmate/lib/server";

export const localAuthEnabled = process.env.CREWMATE_AUTH_MODE === "local";

async function refreshAccessToken(token: {
  refreshToken?: string;
  accessToken?: string;
  expiresAt?: number;
}) {
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        grant_type: "refresh_token",
        refresh_token: token.refreshToken ?? "",
      }),
    });

    const data = await res.json();
    if (!res.ok) throw data;

    return {
      ...token,
      accessToken: data.access_token as string,
      expiresAt: Math.floor(Date.now() / 1000) + (data.expires_in as number),
      refreshToken:
        (data.refresh_token as string | undefined) ?? token.refreshToken,
      error: undefined,
    };
  } catch {
    return { ...token, error: "RefreshAccessTokenError" as const };
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.AUTH_SECRET,
  providers: localAuthEnabled ? [{
    id: "local",
    name: "Owner",
    type: "oidc",
    issuer: process.env.AUTH_OIDC_ISSUER,
    clientId: process.env.AUTH_OIDC_CLIENT_ID,
    clientSecret: process.env.AUTH_OIDC_CLIENT_SECRET,
    client: { token_endpoint_auth_method: "client_secret_basic" },
    authorization: { params: { scope: "openid profile email" } },
    checks: ["pkce", "state", "nonce"],
  }] : [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: [
            "openid",
            "email",
            "profile",
            "https://www.googleapis.com/auth/gmail.modify",
            "https://www.googleapis.com/auth/calendar",
            "https://www.googleapis.com/auth/documents",
            "https://www.googleapis.com/auth/drive.file",
            "https://www.googleapis.com/auth/tasks",
          ].join(" "),
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  session: { strategy: "jwt", maxAge: localAuthEnabled ? 3600 : 30 * 24 * 3600 },
  callbacks: {
    async signIn({ account, profile }) {
      return !localAuthEnabled || isLocalOwner(account?.provider, profile?.sub, process.env.AUTH_OWNER_SUBJECT);
    },
    async jwt({ token, account }) {
      if (account) {
        if (account.provider === "local") {
          // Local authentication never retains or refreshes Google or OIDC bearer tokens.
          return { sub: token.sub, name: token.name, email: token.email, picture: token.picture, provider: "local" };
        }
        return {
          ...token,
          provider: "google",
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          expiresAt: account.expires_at,
          error: undefined,
        };
      }

      if (localAuthEnabled || token.provider === "local") return token;

      const expiresAt = token.expiresAt as number | undefined;
      if (expiresAt && Date.now() / 1000 < expiresAt - 60) {
        return token;
      }

      return refreshAccessToken(
        token as Parameters<typeof refreshAccessToken>[0],
      );
    },
    async session({ session, token }) {
      session.authMode = localAuthEnabled ? "local" : "google";
      session.localOwner = localAuthEnabled && isLocalOwner(token.provider, token.sub, process.env.AUTH_OWNER_SUBJECT);
      session.accessToken = !localAuthEnabled && typeof token.accessToken === "string" ? token.accessToken : undefined;
      session.error = !localAuthEnabled && token.error === "RefreshAccessTokenError" ? token.error : undefined;
      session.googleAuthStatus = localAuthEnabled ? "deferred" : token.error || !session.accessToken ? "reauth-required" : "ready";
      session.accountKey = createHmac(
        "sha256",
        process.env.AUTH_SECRET ?? "crewmate-account-key",
      )
        .update(token.provider === "local" ? `local:${process.env.AUTH_OIDC_ISSUER}:${token.sub}` : token.sub ?? "unknown")
        .digest("hex");
      return session;
    },
  },
});
