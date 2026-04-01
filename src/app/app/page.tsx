import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { AppProvider } from "@/context/AppContext";
import AppShell from "@/components/AppShell";
import SessionProvider from "@/components/SessionProvider";

export default async function AppPage() {
    const session = await auth();
    if (!session) redirect("/");
    return (
        <SessionProvider>
            <AppProvider>
                <AppShell />
            </AppProvider>
        </SessionProvider>
    );
}
