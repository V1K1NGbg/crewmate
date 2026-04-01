import { auth } from "@/auth";
import { redirect } from "next/navigation";
import SignInPage from "@/components/SignInPage";

export default async function Home() {
    const session = await auth();
    if (session) redirect("/app");
    return <SignInPage />;
}
