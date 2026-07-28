"use client";

import { useState, useEffect, Suspense } from "react";
import {
  X,
  Settings,
  Bot,
  RefreshCw,
  Palette,
  Check,
  ChevronDown,
  Package,
  PackageCheck,
  PackageX,
} from "lucide-react";
import { useApp } from "@crewmate/state";
import { fetchOpencodeModels, SettingRow } from "@crewmate/lib";
import { COLOR_SCHEMES } from "@crewmate/types";
import type { FeaturePackageId, FeaturePlugin, Page } from "@crewmate/types";
import { PLUGINS } from "@/plugins/registry";

interface ModelOption {
  providerId: string;
  modelId: string;
  label: string;
}

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

function pageForPlugin(plugin: FeaturePlugin): Page {
  return {
    id: plugin.id,
    type: plugin.id,
    label: plugin.label,
    keybinding: plugin.keybinding ?? "",
  };
}

export default function SettingsPanel({ onClose }: { onClose: () => void }) {
  const { state, dispatch, notify } = useApp();
  const [activeSection, setActiveSection] = useState<string>("general");
  const [checkingFeatures, setCheckingFeatures] = useState(false);

  const isInstalled = (feature: FeaturePackageId) =>
    state.installedFeatures.find((f) => f.id === feature)?.installed ?? true;

  function isFeatureEnabled(pluginId: string) {
    return state.pages.some((p) => p.type === pluginId);
  }

  function toggleFeature(plugin: FeaturePlugin) {
    const enabled = !isFeatureEnabled(plugin.id);
    dispatch({ type: "SET_FEATURE_ENABLED", page: pageForPlugin(plugin), enabled });
    notify(`${plugin.label} ${enabled ? "enabled" : "disabled"}`, "success");
  }

  const pluginSections: SectionDef[] = PLUGINS.filter(
    (p) => isInstalled(p.id) && isFeatureEnabled(p.id) && p.SettingsSection,
  ).map((p) => ({ id: p.id, label: p.label, icon: p.icon }));

  const SECTIONS = [...STATIC_SECTIONS, ...pluginSections];
  const activePlugin = PLUGINS.find((p) => p.id === activeSection);

  useEffect(() => {
    if (!SECTIONS.some((s) => s.id === activeSection)) {
      setActiveSection("general");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.installedFeatures, state.pages]);

  async function recheckInstalledFeatures() {
    setCheckingFeatures(true);
    try {
      const res = await fetch("/api/features");
      if (!res.ok) return;
      const data = await res.json();
      dispatch({ type: "SET_INSTALLED_FEATURES", features: data.features });
      notify("Package list refreshed", "success");
    } catch {
      notify("Failed to check installed packages", "error");
    } finally {
      setCheckingFeatures(false);
    }
  }

  // AI state
  const [urlDraft, setUrlDraft] = useState(state.opencodeUrl);
  const [modelDraft, setModelDraft] = useState(state.assistantModel);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [showAssistantDropdown, setShowAssistantDropdown] = useState(false);

  useEffect(() => {
    setUrlDraft(state.opencodeUrl);
    setModelDraft(state.assistantModel);
  }, [state.opencodeUrl, state.assistantModel]);

  async function loadModels() {
    setModelsLoading(true);
    try {
      const list = await fetchOpencodeModels(urlDraft);
      if (list.length > 0) setModels(list);
    } catch {
      /* ignore */
    } finally {
      setModelsLoading(false);
    }
  }

  function saveAI() {
    dispatch({ type: "SET_OPENCODE_URL", url: urlDraft });
    dispatch({ type: "SET_ASSISTANT_MODEL", model: modelDraft });
    setShowAssistantDropdown(false);
    notify("AI settings saved", "success");
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
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
              const isActive = activeSection === s.id;
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
                {SECTIONS.find((s) => s.id === activeSection)?.label}
              </h2>
              <p className="text-sm text-text-3 mb-6">
                {activeSection === "general" &&
                  "Global preferences that apply across all pages."}
                {activeSection === "packages" &&
                  "Each menu is its own package. Enable or disable any combination — disabled pages disconnect entirely: no nav icon, no data fetching, no AI actions targeting them."}
                {activeSection === "ai" &&
                  "Configure the AI assistant server and model selection."}
                {activePlugin && activePlugin.description}
              </p>

              <div className="flex flex-col gap-5">
                {activeSection === "packages" && (
                  <>
                    <div className="flex justify-end -mt-2">
                      <button
                        onClick={recheckInstalledFeatures}
                        disabled={checkingFeatures}
                        className="flex items-center gap-1.5 text-xs text-accent hover:underline disabled:opacity-50"
                      >
                        <RefreshCw
                          size={12}
                          className={checkingFeatures ? "animate-spin" : ""}
                        />
                        Recheck installed packages
                      </button>
                    </div>
                    <div className="flex flex-col gap-2.5">
                      {PLUGINS.map((plugin) => {
                        const installed = isInstalled(plugin.id);
                        const enabled = isFeatureEnabled(plugin.id);
                        const Icon = plugin.icon;
                        const info = state.installedFeatures.find(
                          (f) => f.id === plugin.id,
                        );
                        return (
                          <div
                            key={plugin.id}
                            className={`flex items-center gap-3.5 p-3.5 rounded-xl border transition-colors ${
                              enabled
                                ? "border-border-2 bg-surface-2/50"
                                : "border-border/50"
                            }`}
                          >
                            <div
                              className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                              style={{
                                backgroundColor: "var(--color-surface-2)",
                                color: enabled
                                  ? "var(--color-accent)"
                                  : "var(--color-text-3)",
                              }}
                            >
                              <Icon size={17} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-text">
                                  {plugin.label}
                                </span>
                                <span
                                  className={`flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full ${
                                    installed
                                      ? "text-success bg-success/10"
                                      : "text-danger bg-danger/10"
                                  }`}
                                >
                                  {installed ? (
                                    <PackageCheck size={10} />
                                  ) : (
                                    <PackageX size={10} />
                                  )}
                                  {installed ? "Installed" : "Not installed"}
                                </span>
                              </div>
                              <p className="text-xs text-text-3 mt-0.5 truncate">
                                {plugin.description}
                              </p>
                              <p className="text-xs text-text-3/70 mt-0.5 font-mono">
                                {info?.packageName ?? plugin.packageName}
                              </p>
                            </div>
                            <button
                              type="button"
                              disabled={!installed}
                              onClick={() => toggleFeature(plugin)}
                              title={
                                installed
                                  ? enabled
                                    ? `Disable ${plugin.label}`
                                    : `Enable ${plugin.label}`
                                  : `${plugin.label} package is not installed`
                              }
                              className={`relative rounded-full transition-colors flex-shrink-0 ${
                                enabled ? "bg-accent" : "bg-border-2"
                              } ${!installed ? "opacity-30 cursor-not-allowed" : ""}`}
                              style={{ height: 22, width: 40 }}
                            >
                              <div
                                className={`absolute top-[3px] w-4 h-4 rounded-full bg-white shadow transition-transform ${
                                  enabled
                                    ? "translate-x-[20px]"
                                    : "translate-x-[3px]"
                                }`}
                              />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                    {state.pages.filter((p) => p.type !== "custom").length ===
                      0 && (
                      <p className="text-xs text-warning bg-warning/10 rounded-lg px-3 py-2.5">
                        All built-in pages are disabled — enable at least one
                        above to use Crewmate.
                      </p>
                    )}
                  </>
                )}

                {activeSection === "general" && (
                  <>
                    <SettingRow
                      label="Color scheme"
                      description="Choose your preferred color theme"
                    >
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                        {COLOR_SCHEMES.map((scheme) => (
                          <button
                            key={scheme.id}
                            onClick={() =>
                              dispatch({
                                type: "SET_COLOR_SCHEME",
                                schemeId: scheme.id,
                              })
                            }
                            className={`flex flex-col items-center gap-1.5 p-2 rounded-lg border-2 transition-all ${
                              (state.pageSettings.general.colorScheme ??
                                "default") === scheme.id
                                ? "border-accent bg-surface-2"
                                : "border-border-2 hover:border-border hover:bg-surface-2/50"
                            }`}
                          >
                            <div className="flex gap-1">
                              <div
                                className="w-4 h-4 rounded-full"
                                style={{
                                  backgroundColor: scheme.colors.bg,
                                  border: `1px solid ${scheme.colors.border2}`,
                                }}
                              />
                              <div
                                className="w-4 h-4 rounded-full"
                                style={{
                                  backgroundColor: scheme.colors.surface,
                                }}
                              />
                              <div
                                className="w-4 h-4 rounded-full"
                                style={{
                                  backgroundColor: scheme.colors.accent,
                                }}
                              />
                            </div>
                            <span className="text-xs text-text-2">
                              {scheme.name}
                            </span>
                          </button>
                        ))}
                      </div>
                    </SettingRow>
                    <SettingRow
                      label="Auto-refresh interval"
                      description="Periodically refresh all pages to detect external changes"
                    >
                      <select
                        className="settings-select"
                        value={
                          state.pageSettings.general.autoRefreshInterval ?? 0
                        }
                        onChange={(e) =>
                          dispatch({
                            type: "UPDATE_GENERAL_SETTINGS",
                            settings: {
                              autoRefreshInterval: Number(e.target.value),
                            },
                          })
                        }
                      >
                        <option value={0}>Off</option>
                        <option value={15}>15 seconds</option>
                        <option value={30}>30 seconds</option>
                        <option value={60}>1 minute</option>
                        <option value={120}>2 minutes</option>
                        <option value={300}>5 minutes</option>
                      </select>
                    </SettingRow>
                  </>
                )}

                {activeSection === "ai" && (
                  <>
                    <SettingRow label="Server URL">
                      <input
                        className="settings-input"
                        value={urlDraft}
                        onChange={(e) => setUrlDraft(e.target.value)}
                        placeholder="http://localhost:4096"
                      />
                    </SettingRow>

                    {/* Model picker */}
                    <SettingRow
                      label="Model"
                      description={
                        <>
                          Model used for all AI features — chat assistant, email
                          suggestions, task breakdown, and more.{" "}
                          <span className="text-text-muted">
                            Append <code>:none</code> or <code>:low</code> to
                            disable/reduce thinking for local models (e.g.{" "}
                            <code>ollama/...:none</code>).
                          </span>
                        </>
                      }
                    >
                      <div className="flex gap-2">
                        <input
                          className="settings-input flex-1"
                          value={modelDraft}
                          onChange={(e) => {
                            setModelDraft(e.target.value);
                            setShowAssistantDropdown(false);
                          }}
                          placeholder="Default (server picks)"
                        />
                        <button
                          onClick={async () => {
                            if (models.length === 0) await loadModels();
                            setShowAssistantDropdown((v) => !v);
                          }}
                          disabled={modelsLoading}
                          className="flex items-center gap-1.5 text-sm text-accent border border-border-2 rounded-lg hover:bg-surface-2 transition-colors disabled:opacity-50 px-3"
                        >
                          <ChevronDown
                            size={14}
                            className={modelsLoading ? "animate-spin" : ""}
                          />{" "}
                          Browse
                        </button>
                      </div>
                      {showAssistantDropdown && models.length > 0 && (
                        <ModelDropdown
                          models={models}
                          currentValue={modelDraft}
                          label="model"
                          onSelect={(v) => {
                            setModelDraft(v);
                            setShowAssistantDropdown(false);
                          }}
                        />
                      )}
                    </SettingRow>

                    <button
                      onClick={saveAI}
                      className="w-full py-2.5 bg-accent text-white text-sm font-semibold rounded-lg hover:bg-accent-hover transition-colors flex items-center justify-center gap-2"
                    >
                      <Check size={14} /> Save AI settings
                    </button>
                  </>
                )}

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

function ModelDropdown({
  models,
  currentValue,
  label,
  onSelect,
}: {
  models: ModelOption[];
  currentValue: string;
  label: string;
  onSelect: (value: string) => void;
}) {
  return (
    <div className="max-h-48 overflow-y-auto bg-surface-2 border border-border-2 rounded-lg shadow-xl mt-1">
      <div className="px-3 py-1.5 text-xs text-text-3 uppercase tracking-wider border-b border-border sticky top-0 bg-surface-2">
        Select for {label}
      </div>
      <button
        onClick={() => onSelect("")}
        className="w-full text-left px-3 py-2 text-sm text-text-2 hover:bg-surface border-b border-border/50"
      >
        Default (server picks)
      </button>
      {models.map((m) => {
        const val = `${m.providerId}/${m.modelId}`;
        return (
          <button
            key={val}
            onClick={() => onSelect(val)}
            className={`w-full text-left px-3 py-2 text-sm hover:bg-surface flex items-center gap-2 ${currentValue === val ? "text-accent" : "text-text"}`}
          >
            {currentValue === val && (
              <Check size={12} className="flex-shrink-0" />
            )}
            <div className="min-w-0">
              <div className="truncate">{m.label}</div>
              <div className="text-xs text-text-3 truncate">{m.modelId}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
