import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    /** Server-only. The public session endpoint strips this field. */
    accessToken?: string;
    error?: "RefreshAccessTokenError";
    googleAuthStatus: "ready" | "reauth-required";
    accountKey: string;
    user: DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
    error?: "RefreshAccessTokenError";
  }
}
