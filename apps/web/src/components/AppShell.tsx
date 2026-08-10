"use client";

import { useState, useEffect, lazy, Suspense } from "react";
import { useApp } from "@crewmate/state";
import { detectAIServer } from "@crewmate/lib";
import Navigation from "./Navigation";
import TopBar from "./TopBar";
import Notification from "./Notification";
import { getPlugin } from "@/plugins/registry";

const AIAssistant = lazy(() => import("./AIAssistant"));
const SettingsPanel = lazy(() => import("./SettingsPanel"));

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
  const rawMailSettings = state.pageSettings.features.mail;
  const mailSettings =
    rawMailSettings && typeof rawMailSettings === "object"
      ? (rawMailSettings as Record<string, unknown>)
      : {};
  const quickReviewEnabled = mailSettings.quickReviewEnabled === true;
  const configuredQuickReviewToggleKey =
    typeof mailSettings.quickReviewToggleKey === "string"
      ? mailSettings.quickReviewToggleKey.toLowerCase()
      : "";
  const quickReviewToggleKey = /^[a-z0-9]$/.test(
    configuredQuickReviewToggleKey,
  )
    ? configuredQuickReviewToggleKey
    : "r";

  useEffect(() => {
    detectAIServer(state.aiServerUrl).then((available) => {
      dispatch({ type: "SET_AI_SERVER_AVAILABLE", available });
    });
  }, [state.aiServerUrl, dispatch]);

  // Defense in depth: if installed-feature info wasn't provided server-side
  // for some reason, fetch it once client-side so the Packages settings
  // still reflect reality instead of assuming everything is installed.
  useEffect(() => {
    if (state.installedFeatures.length > 0) return;
    fetch("/api/features")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.features) {
          dispatch({ type: "SET_INSTALLED_FEATURES", features: data.features });
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      const isEditing =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        (e.target as HTMLElement).isContentEditable;
      if (isEditing) return;

      if (
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !e.shiftKey &&
        e.key.toLowerCase() === quickReviewToggleKey
      ) {
        e.preventDefault();
        const enabled = !quickReviewEnabled;
        dispatch({
          type: "UPDATE_FEATURE_SETTINGS",
          featureId: "mail",
          settings: { quickReviewEnabled: enabled },
        });
        if (enabled) {
          const mailPage = state.pages.find((page) => page.type === "mail");
          if (mailPage) dispatch({ type: "SET_ACTIVE_PAGE", id: mailPage.id });
        }
        return;
      }

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
          type: "SET_AI_OVERLAY_OPEN",
          open: !state.aiOverlayOpen,
        });
        return;
      }
      if (e.key === "s" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setSettingsOpen((prev) => !prev);
        return;
      }
      if (e.key === "Escape") {
        if (state.aiOverlayOpen) {
          dispatch({
            type: "SET_AI_OVERLAY_OPEN",
            open: false,
          });
        } else if (settingsOpen) {
          setSettingsOpen(false);
        }
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [
    state.pages,
    state.aiOverlayOpen,
    settingsOpen,
    dispatch,
    quickReviewEnabled,
    quickReviewToggleKey,
  ]);

  const activePage =
    state.pages.find((p) => p.id === state.activePage) ?? state.pages[0];

  return (
    <div
      className="crewmate-app flex h-dvh min-h-0 overflow-hidden bg-bg"
      data-component-spacing={state.pageSettings.general.componentSpacing}
    >
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
              const plugin = getPlugin(page.type);
              if (!plugin) return null;
              return (
                <div
                  key={page.id}
                  className="flex-1 flex overflow-hidden"
                  style={{ display: isActive ? "flex" : "none" }}
                >
                  <plugin.Page />
                </div>
              );
            })}
            {!activePage && (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 text-text-3 text-sm">
                <p>No pages enabled.</p>
                <button
                  onClick={() => setSettingsOpen(true)}
                  className="text-accent hover:underline text-sm"
                >
                  Open Settings to enable a page
                </button>
              </div>
            )}
          </Suspense>
          {state.aiOverlayOpen && (
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
              <kbd className="font-mono text-xs uppercase opacity-60">
                {quickReviewToggleKey}
              </kbd>
              <span>Review {quickReviewEnabled ? "on" : "off"}</span>
            </span>
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
