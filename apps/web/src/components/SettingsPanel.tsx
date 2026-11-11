"use client";

import { useState, Suspense } from "react";
import { X, Settings, Bot, Palette, Package } from "lucide-react";
import { useApp } from "@crewmate/state";
import { useDialogFocus } from "@crewmate/lib";
import type { FeaturePackageId } from "@crewmate/types";
import { PLUGINS } from "@/plugins/registry";
import GeneralSection from "./settings/GeneralSection";
import PackagesSection from "./settings/PackagesSection";
import AISection from "./settings/AISection";

interface SectionDef {
  id: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

const STATIC_SECTIONS: SectionDef[] = [
  { id: "general", label: "General", icon: Palette },
  { id: "packages", label: "Packages", icon: Package },
  { id: "ai", label: "AI Assistant", icon: Bot },
];

export default function SettingsPanel({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useApp();
  const dialogRef = useDialogFocus();
  const [activeSection, setActiveSection] = useState<string>("general");

  const isInstalled = (feature: FeaturePackageId) =>
    state.installedFeatures.find((f) => f.id === feature)?.installed ?? true;
  const isFeatureEnabled = (pluginId: string) =>
    state.pages.some((p) => p.type === pluginId);

  const pluginSections: SectionDef[] = PLUGINS.filter(
    (p) => isInstalled(p.id) && isFeatureEnabled(p.id) && p.SettingsSection,
  ).map((p) => ({ id: p.id, label: p.label, icon: p.icon }));

  const SECTIONS = [...STATIC_SECTIONS, ...pluginSections];
  const resolvedActiveSection = SECTIONS.some((s) => s.id === activeSection)
    ? activeSection
    : "general";
  const activePlugin = PLUGINS.find((p) => p.id === resolvedActiveSection);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="flex flex-col bg-surface border border-border-2 rounded-2xl shadow-2xl overflow-hidden"
        style={{
          width: "90%",
          height: "90%",
          maxWidth: 940,
          maxHeight: 1170,
          animation: "fadeIn 200ms cubic-bezier(0.16,1,0.3,1) both",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="h-14 flex items-center justify-between px-6 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-3">
            <Settings size={18} className="text-accent" />
            <span className="text-sm font-semibold text-text">Settings</span>
          </div>
          <button
            onClick={onClose}
            aria-label="Close settings"
            className="w-8 h-8 flex items-center justify-center text-text-3 hover:text-text hover:bg-surface-2 rounded-lg transition-colors"
            title="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar — wider tabs */}
          <nav className="w-60 flex-shrink-0 border-r border-border bg-surface overflow-y-auto py-4">
            {SECTIONS.map((s) => {
              const Icon = s.icon;
              const isActive = resolvedActiveSection === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => setActiveSection(s.id)}
                  className={`w-full flex items-center gap-3 px-5 py-3.5 text-sm font-medium transition-colors ${
                    isActive
                      ? "text-text bg-surface-2 border-l-2 border-accent"
                      : "text-text-2 hover:text-text hover:bg-surface-2/50 border-l-2 border-transparent"
                  }`}
                >
                  <Icon size={18} className={isActive ? "text-accent" : ""} />
                  {s.label}
                </button>
              );
            })}
          </nav>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-xl mx-auto px-8 py-6">
              <h2 className="text-base font-semibold text-text mb-1">
                {SECTIONS.find((s) => s.id === resolvedActiveSection)?.label}
              </h2>
              <p className="text-sm text-text-3 mb-6">
                {resolvedActiveSection === "general" &&
                  "Global preferences that apply across all pages."}
                {resolvedActiveSection === "packages" &&
                  "Each menu is its own package. Enable or disable any combination — disabled pages disconnect entirely: no nav icon, no data fetching, no AI actions targeting them."}
                {resolvedActiveSection === "ai" &&
                  "Configure the AI assistant server and model selection."}
                {activePlugin && activePlugin.description}
              </p>

              <div className="flex flex-col gap-5">
                {resolvedActiveSection === "packages" && <PackagesSection />}
                {resolvedActiveSection === "general" && <GeneralSection />}
                {resolvedActiveSection === "ai" && <AISection />}

                {activePlugin?.SettingsSection && (
                  <Suspense fallback={null}>
                    <activePlugin.SettingsSection
                      settings={
                        (state.pageSettings.features[activePlugin.id] as
                          | Record<string, unknown>
                          | undefined) ?? activePlugin.defaultSettings
                      }
                      onChange={(partial) =>
                        dispatch({
                          type: "UPDATE_FEATURE_SETTINGS",
                          featureId: activePlugin.id,
                          settings: partial as Record<string, unknown>,
                        })
                      }
                    />
                  </Suspense>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
