"use client";

import { signIn } from "next-auth/react";

export default function SignInPage() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-[#010409]">
            <div
                className="absolute inset-0 pointer-events-none"
                style={{
                    background:
                        "radial-gradient(ellipse 60% 40% at 50% 40%, #1f6feb18 0%, transparent 70%)",
                }}
            />

            <div className="relative flex flex-col items-center gap-8 px-8 py-10 bg-[#0d1117] border border-[#30363d] rounded-2xl shadow-2xl w-[340px]">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-12 h-12 bg-[#161b22] border border-[#30363d] rounded-xl flex items-center justify-center shadow-inner">
                        <svg
                            width="22"
                            height="22"
                            viewBox="0 0 22 22"
                            fill="none"
                        >
                            <circle
                                cx="4"
                                cy="4"
                                r="2.5"
                                fill="#58a6ff"
                                opacity="0.9"
                            />
                            <circle
                                cx="11"
                                cy="4"
                                r="2.5"
                                fill="#58a6ff"
                                opacity="0.6"
                            />
                            <circle
                                cx="18"
                                cy="4"
                                r="2.5"
                                fill="#58a6ff"
                                opacity="0.3"
                            />
                            <circle
                                cx="4"
                                cy="11"
                                r="2.5"
                                fill="#58a6ff"
                                opacity="0.6"
                            />
                            <circle
                                cx="11"
                                cy="11"
                                r="2.5"
                                fill="#58a6ff"
                                opacity="0.9"
                            />
                            <circle
                                cx="18"
                                cy="11"
                                r="2.5"
                                fill="#58a6ff"
                                opacity="0.6"
                            />
                            <circle
                                cx="4"
                                cy="18"
                                r="2.5"
                                fill="#58a6ff"
                                opacity="0.3"
                            />
                            <circle
                                cx="11"
                                cy="18"
                                r="2.5"
                                fill="#58a6ff"
                                opacity="0.6"
                            />
                            <circle
                                cx="18"
                                cy="18"
                                r="2.5"
                                fill="#58a6ff"
                                opacity="0.9"
                            />
                        </svg>
                    </div>
                    <div className="text-center">
                        <h1 className="text-xl font-bold text-[#e6edf3] tracking-tight">
                            Crewmate
                        </h1>
                        <p className="text-xs text-[#484f58] mt-0.5">
                            Personal productivity dashboard
                        </p>
                    </div>
                </div>

                <div className="w-full border-t border-[#21262d]" />

                <div className="w-full flex flex-col gap-4">
                    <p className="text-xs text-[#8b949e] text-center leading-relaxed">
                        Sign in to access your Gmail and Google Calendar.
                    </p>

                    <button
                        onClick={() =>
                            signIn("google", { callbackUrl: "/app" })
                        }
                        className="w-full flex items-center justify-center gap-2.5 py-2.5 bg-[#21262d] border border-[#30363d] text-[#e6edf3] text-sm font-semibold rounded-lg hover:border-[#58a6ff] hover:text-[#58a6ff] hover:bg-[#161b22] active:bg-[#0d1117] transition-colors"
                    >
                        <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                        >
                            <path
                                fill="#4285F4"
                                d="M23.745 12.27c0-.79-.07-1.54-.19-2.27h-11.3v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
                            />
                            <path
                                fill="#34A853"
                                d="M12.255 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96h-3.98v3.09C3.515 21.3 7.615 24 12.255 24z"
                            />
                            <path
                                fill="#FBBC05"
                                d="M5.525 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62h-3.98a11.86 11.86 0 000 10.76l3.98-3.09z"
                            />
                            <path
                                fill="#EA4335"
                                d="M12.255 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C18.205 1.19 15.495 0 12.255 0c-4.64 0-8.74 2.7-10.71 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"
                            />
                        </svg>
                        Continue with Google
                    </button>
                </div>

                <p className="text-xs text-[#30363d] text-center leading-relaxed">
                    Requires Gmail and Google Calendar access
                </p>
            </div>
        </div>
    );
}
