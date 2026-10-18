"use client";

import { SessionProvider as NextAuthSessionProvider, useSession } from "next-auth/react";
import { useEffect, type ReactNode } from "react";

function SessionBoundary({ children }: { children: ReactNode }) {
    const { data, status } = useSession();
    const denied = status === "unauthenticated" || (data?.authMode === "local" && !data.localOwner);
    useEffect(() => {
        if (denied) window.location.replace("/");
    }, [denied]);
    if (denied) return <p role="status" className="m-auto p-6 text-text-2">Your session ended. Returning to sign in…</p>;
    return children;
}

export default function SessionProvider({ children }: { children: ReactNode }) {
    return <NextAuthSessionProvider refetchInterval={60}><SessionBoundary>{children}</SessionBoundary></NextAuthSessionProvider>;
}
