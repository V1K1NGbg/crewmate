import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
    title: "Crewmate",
    description: "Personal productivity dashboard",
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en" className="h-full">
            <body className="h-full bg-[#0d1117] text-[#f0f6fc] antialiased overflow-hidden">
                {children}
            </body>
        </html>
    );
}
