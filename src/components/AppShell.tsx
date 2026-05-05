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
      <div className="w-5 h-5 border-2 border-border border-t-accent rounded-full animate-spin" />
    </div>
  );
}

export default function AppShell() {
  const { state, dispatch } = useApp();
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    detectOpencodeServer(state.opencodeUrl).then((url) => {
      dispatch({ type: "SET_OPENCODE_AVAILABLE", available: !!url });
    });
  }, [state.opencodeUrl, dispatch]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      const isEditing =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        (e.target as HTMLElement).isContentEditable;
      if (isEditing) return;

      if (!e.ctrlKey && !e.metaKey && !e.altKey && /^[1-9]$/.test(e.key)) {
        const page = state.pages.find((p) => p.keybinding === e.key);
        if (page) {
          e.preventDefault();
          dispatch({ type: "SET_ACTIVE_PAGE", id: page.id });
        }
        return;
      }
      if (e.key === "o" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        dispatch({
          type: "SET_OPENCODE_OVERLAY_OPEN",
          open: !state.opencodeOverlayOpen,
        });
        return;
      }
      if (e.key === "s" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setSettingsOpen((prev) => !prev);
        return;
      }
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
    <div className="flex h-screen overflow-hidden bg-bg">
      <Navigation />
      <div className="flex flex-col flex-1 overflow-hidden min-w-0">
        <TopBar
          onSettingsToggle={() => setSettingsOpen(!settingsOpen)}
          settingsOpen={settingsOpen}
        />
        <div className="flex flex-1 overflow-hidden relative">
          <Suspense fallback={<PageFallback />}>
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
              <div className="flex-1 flex items-center justify-center text-text-3 text-sm">
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
              <SettingsPanel onClose={() => setSettingsOpen(false)} />
            </Suspense>
          )}
        </div>

        {/* Status bar */}
        <div className="h-8 flex items-center px-5 bg-bg border-t border-border gap-4 flex-shrink-0 overflow-hidden">
          {state.pages.slice(0, 9).map((p) => (
            <button
              key={p.id}
              onClick={() => dispatch({ type: "SET_ACTIVE_PAGE", id: p.id })}
              className={`flex items-center gap-1.5 text-xs transition-colors ${
                state.activePage === p.id
                  ? "text-accent"
                  : "text-text-3 hover:text-text-2"
              }`}
            >
              <kbd className="font-mono text-xs opacity-60">{p.keybinding}</kbd>
              <span>{p.label}</span>
            </button>
          ))}
          <span className="ml-auto flex items-center gap-3 text-xs text-text-3">
            <span className="flex items-center gap-1.5">
              <kbd className="font-mono text-xs opacity-60">O</kbd>
              <span>AI</span>
            </span>
            <span className="flex items-center gap-1.5">
              <kbd className="font-mono text-xs opacity-60">S</kbd>
              <span>Settings</span>
            </span>
          </span>
        </div>
      </div>
      <Notification />
    </div>
  );
}
