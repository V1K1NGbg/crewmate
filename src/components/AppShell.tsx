"use client";

import { useState, useEffect, lazy, Suspense } from "react";
import { useApp } from "@/context/AppContext";
import { detectOpencodeServer } from "@/lib/opencode";
import Navigation from "./Navigation";
import TopBar from "./TopBar";
import Notification from "./Notification";

const AIAssistant = lazy(() => import("./AIAssistant"));
const SettingsPanel = lazy(() => import("./SettingsPanel"));
const GmailPage = lazy(() => import("./pages/GmailPage"));
const CalendarPage = lazy(() => import("./pages/CalendarPage"));
const NotesPage = lazy(() => import("./pages/NotesPage"));
const TasksPage = lazy(() => import("./pages/TasksPage"));
const CustomPage = lazy(() => import("./pages/CustomPage"));

function PageFallback() {
    return (
        <div className="flex-1 flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-[#21262d] border-t-[#58a6ff] rounded-full animate-spin" />
        </div>
    );
}

export default function AppShell() {
    const { state, dispatch } = useApp();
    const [settingsOpen, setSettingsOpen] = useState(false);

    // Detect opencode server
    useEffect(() => {
        detectOpencodeServer(state.opencodeUrl).then((url) => {
            dispatch({ type: "SET_OPENCODE_AVAILABLE", available: !!url });
        });
    }, [state.opencodeUrl, dispatch]);

    // Global keyboard shortcuts
    useEffect(() => {
        function handleKey(e: KeyboardEvent) {
            const tag = (e.target as HTMLElement).tagName;
            const isEditing =
                tag === "INPUT" ||
                tag === "TEXTAREA" ||
                tag === "SELECT" ||
                (e.target as HTMLElement).isContentEditable;
            if (isEditing) return;

            // Number keys 1-9: switch pages
            if (
                !e.ctrlKey &&
                !e.metaKey &&
                !e.altKey &&
                /^[1-9]$/.test(e.key)
            ) {
                const page = state.pages.find((p) => p.keybinding === e.key);
                if (page) {
                    e.preventDefault();
                    dispatch({ type: "SET_ACTIVE_PAGE", id: page.id });
                }
                return;
            }
            // O: toggle AI assistant
            if (e.key === "o" && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                dispatch({
                    type: "SET_OPENCODE_OVERLAY_OPEN",
                    open: !state.opencodeOverlayOpen,
                });
                return;
            }
            // Escape: close overlay or settings
            if (e.key === "Escape") {
                if (state.opencodeOverlayOpen) {
                    dispatch({
                        type: "SET_OPENCODE_OVERLAY_OPEN",
                        open: false,
                    });
                } else if (settingsOpen) {
                    setSettingsOpen(false);
                }
            }
        }
        window.addEventListener("keydown", handleKey);
        return () => window.removeEventListener("keydown", handleKey);
    }, [state.pages, state.opencodeOverlayOpen, settingsOpen, dispatch]);

    const activePage =
        state.pages.find((p) => p.id === state.activePage) ?? state.pages[0];

    return (
        <div className="flex h-screen overflow-hidden bg-[#010409]">
            <Navigation />
            <div className="flex flex-col flex-1 overflow-hidden min-w-0">
                <TopBar
                    onSettingsToggle={() => setSettingsOpen(!settingsOpen)}
                    settingsOpen={settingsOpen}
                />
                <div className="flex flex-1 overflow-hidden relative">
                    <Suspense fallback={<PageFallback />}>
                        {/* Keep all pages mounted; hide inactive ones with CSS */}
                        {state.pages.map((page) => {
                            const isActive = page.id === activePage?.id;
                            if (page.type === "mail")
                                return (
                                    <div
                                        key={page.id}
                                        className="flex-1 flex overflow-hidden"
                                        style={{
                                            display: isActive ? "flex" : "none",
                                        }}
                                    >
                                        <GmailPage />
                                    </div>
                                );
                            if (page.type === "calendar")
                                return (
                                    <div
                                        key={page.id}
                                        className="flex-1 flex overflow-hidden"
                                        style={{
                                            display: isActive ? "flex" : "none",
                                        }}
                                    >
                                        <CalendarPage />
                                    </div>
                                );
                            if (page.type === "notes")
                                return (
                                    <div
                                        key={page.id}
                                        className="flex-1 flex overflow-hidden"
                                        style={{
                                            display: isActive ? "flex" : "none",
                                        }}
                                    >
                                        <NotesPage />
                                    </div>
                                );
                            if (page.type === "tasks")
                                return (
                                    <div
                                        key={page.id}
                                        className="flex-1 flex overflow-hidden"
                                        style={{
                                            display: isActive ? "flex" : "none",
                                        }}
                                    >
                                        <TasksPage />
                                    </div>
                                );
                            if (page.type === "custom")
                                return (
                                    <div
                                        key={page.id}
                                        className="flex-1 flex overflow-hidden"
                                        style={{
                                            display: isActive ? "flex" : "none",
                                        }}
                                    >
                                        <CustomPage url={page.url} />
                                    </div>
                                );
                            return null;
                        })}
                        {!activePage && (
                            <div className="flex-1 flex items-center justify-center text-[#484f58] text-base">
                                Unknown page
                            </div>
                        )}
                    </Suspense>
                    {state.opencodeOverlayOpen && (
                        <Suspense fallback={null}>
                            <AIAssistant />
                        </Suspense>
                    )}
                    {settingsOpen && (
                        <Suspense fallback={null}>
                            <SettingsPanel
                                onClose={() => setSettingsOpen(false)}
                            />
                        </Suspense>
                    )}
                </div>

                {/* Status bar */}
                <div className="h-9 flex items-center px-5 bg-[#010409] border-t border-[#21262d]/50 gap-5 flex-shrink-0 overflow-hidden">
                    {state.pages.slice(0, 9).map((p) => (
                        <button
                            key={p.id}
                            onClick={() =>
                                dispatch({ type: "SET_ACTIVE_PAGE", id: p.id })
                            }
                            className={`flex items-center gap-1.5 text-sm transition-colors ${
                                state.activePage === p.id
                                    ? "text-[#58a6ff]"
                                    : "text-[#30363d] hover:text-[#484f58]"
                            }`}
                        >
                            <kbd className="font-mono text-sm">
                                {p.keybinding}
                            </kbd>
                            <span>{p.label}</span>
                        </button>
                    ))}
                    <span className="ml-auto flex items-center gap-1.5 text-sm text-[#30363d]">
                        <kbd className="font-mono text-sm">O</kbd>
                        <span>AI</span>
                    </span>
                </div>
            </div>
            <Notification />
        </div>
    );
}
