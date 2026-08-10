"use client";

import { useState, Suspense } from "react";
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
  LockKeyhole,
  UnlockKeyhole,
  Copy,
} from "lucide-react";
import { useApp } from "@crewmate/state";
import {
  decryptEnvironmentFile,
  encryptEnvironmentFile,
  generateEnvironmentPassword,
  fetchAIModels,
  normalizeAIServerUrl,
  SettingRow,
  useDialogFocus,
} from "@crewmate/lib";
import { COLOR_SCHEMES } from "@crewmate/types";
import type {
  ComponentSpacing,
  FeaturePackageId,
  FeaturePlugin,
  Page,
} from "@crewmate/types";
import { PLUGINS } from "@/plugins/registry";

interface ModelOption {
  id: string;
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
  const { state, dispatch, notify, clearLocalData } = useApp();
  const dialogRef = useDialogFocus();
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
  const resolvedActiveSection = SECTIONS.some((s) => s.id === activeSection)
    ? activeSection
    : "general";
  const activePlugin = PLUGINS.find((p) => p.id === resolvedActiveSection);

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
  const [urlDraft, setUrlDraft] = useState(state.aiServerUrl);
  const [modelDraft, setModelDraft] = useState(state.assistantModel);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [showAssistantDropdown, setShowAssistantDropdown] = useState(false);
  const [environmentOpen, setEnvironmentOpen] = useState(false);
  const [environmentUnlocked, setEnvironmentUnlocked] = useState(false);
  const [environmentDraft, setEnvironmentDraft] = useState("");
  const [environmentPin, setEnvironmentPin] = useState("");
  const [environmentBusy, setEnvironmentBusy] = useState(false);

  async function unlockEnvironment() {
    if (!state.environmentVault) {
      setEnvironmentUnlocked(true);
      setEnvironmentDraft("");
      return;
    }
    setEnvironmentBusy(true);
    try {
      setEnvironmentDraft(
        await decryptEnvironmentFile(
          state.environmentVault,
          state.environmentPassword,
          environmentPin,
        ),
      );
      setEnvironmentUnlocked(true);
      notify("Environment file unlocked for this settings session", "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not unlock environment file", "error");
    } finally {
      setEnvironmentBusy(false);
    }
  }

  async function saveEnvironment() {
    setEnvironmentBusy(true);
    try {
      const vault = await encryptEnvironmentFile(
        environmentDraft,
        state.environmentPassword,
        environmentPin,
      );
      dispatch({ type: "SET_ENVIRONMENT_VAULT", vault });
      setEnvironmentUnlocked(false);
      setEnvironmentDraft("");
      setEnvironmentPin("");
      notify("Encrypted environment file saved; Notes will sync it", "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not encrypt environment file", "error");
    } finally {
      setEnvironmentBusy(false);
    }
  }

  async function loadModels() {
    setModelsLoading(true);
    try {
      const list = await fetchAIModels(urlDraft);
      setModels(list);
      if (list.length === 0) {
        notify("The AI server did not report any loaded models", "error");
      }
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Could not reach AI server",
        "error",
      );
    } finally {
      setModelsLoading(false);
    }
  }

  function saveAI() {
    let normalizedUrl: string;
    try {
      normalizedUrl = normalizeAIServerUrl(urlDraft);
    } catch {
      notify("Enter a valid AI server URL", "error");
      return;
    }
    const endpoint = new URL(normalizedUrl);
    const local = endpoint.hostname === "localhost" || endpoint.hostname === "127.0.0.1" || endpoint.hostname === "[::1]";
    if ((!local || endpoint.protocol !== "http:") && endpoint.protocol !== "https:") {
      notify("Remote AI endpoints must use HTTPS", "error");
      return;
    }
    if (!local && !window.confirm("This AI endpoint can receive email, calendar, notes, tasks, and conversation context. Save it anyway?")) return;
    setUrlDraft(normalizedUrl);
    dispatch({ type: "SET_AI_SERVER_URL", url: normalizedUrl });
    dispatch({ type: "SET_ASSISTANT_MODEL", model: modelDraft });
    setShowAssistantDropdown(false);
    notify("AI settings saved", "success");
  }

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
                {resolvedActiveSection === "packages" && (
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
                    {state.pages.length === 0 && (
                      <p className="text-xs text-warning bg-warning/10 rounded-lg px-3 py-2.5">
                        All built-in pages are disabled — enable at least one
                        above to use Crewmate.
                      </p>
                    )}
                  </>
                )}

                {resolvedActiveSection === "general" && (
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
                      label="Component spacing"
                      description="Control padding and gaps throughout the app"
                    >
                      <select
                        className="settings-select"
                        value={
                          state.pageSettings.general.componentSpacing ??
                          "compact"
                        }
                        onChange={(e) =>
                          dispatch({
                            type: "UPDATE_GENERAL_SETTINGS",
                            settings: {
                              componentSpacing: e.target
                                .value as ComponentSpacing,
                            },
                          })
                        }
                      >
                        <option value="minimal">Minimal</option>
                        <option value="dense">Dense</option>
                        <option value="compact">Compact</option>
                        <option value="comfortable">Comfortable</option>
                        <option value="spacious">Spacious</option>
                      </select>
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
                    <SettingRow
                      label="Local data"
                      description="Preferences and assistant history are retained only for this signed-in account on this device."
                    >
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="rounded-lg border border-danger/40 px-3 py-2 text-sm text-danger hover:bg-danger/10"
                          onClick={() => {
                            if (window.confirm("Clear local Crewmate data for this account?")) clearLocalData(false);
                          }}
                        >
                          Clear this account
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-danger/40 px-3 py-2 text-sm text-danger hover:bg-danger/10"
                          onClick={() => {
                            if (window.confirm("Clear local Crewmate data for every account on this device?")) clearLocalData(true);
                          }}
                        >
                          Clear all accounts
                        </button>
                      </div>
                    </SettingRow>
                    <SettingRow
                      label="Sensitive environment file"
                      description="Encrypted with your password and 4 digit PIN; only ciphertext is backed up below the visible Notes content."
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setEnvironmentOpen((open) => !open);
                          setEnvironmentUnlocked(false);
                          setEnvironmentDraft("");
                          setEnvironmentPin("");
                        }}
                        className="flex items-center gap-2 rounded-lg border border-border-2 px-3 py-2 text-sm text-text-2 hover:border-accent hover:text-text"
                      >
                        <LockKeyhole size={14} />
                        {state.environmentVault ? "Unlock .env" : "Create encrypted .env"}
                      </button>
                      {environmentOpen && (
                        <div className="mt-3 flex flex-col gap-3 rounded-xl border border-border bg-bg p-3">
                          <div className="flex gap-2">
                            <input
                              readOnly
                              className="settings-input flex-1 font-mono text-xs"
                              aria-label="Generated environment encryption password"
                              value={state.environmentPassword}
                            />
                            <button
                              type="button"
                              onClick={() => {
                                void navigator.clipboard
                                  .writeText(state.environmentPassword)
                                  .then(() => notify("Encryption password copied", "success"))
                                  .catch(() => notify("Could not copy password", "error"));
                              }}
                              className="rounded-lg border border-border-2 px-2.5 text-text-2"
                              title="Copy generated password"
                            >
                              <Copy size={13} />
                            </button>
                            <button
                              type="button"
                              disabled={Boolean(state.environmentVault)}
                              title={state.environmentVault ? "Delete or re-encrypt the existing vault before changing its password" : "Generate a new password"}
                              onClick={() =>
                                dispatch({
                                  type: "SET_ENVIRONMENT_PASSWORD",
                                  password: generateEnvironmentPassword(),
                                })
                              }
                              className="rounded-lg border border-border-2 px-2.5 text-xs text-text-2 disabled:opacity-40"
                            >
                              Regenerate
                            </button>
                          </div>
                          <input
                            type="password"
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            maxLength={4}
                            className="settings-input"
                            placeholder="4 digit PIN"
                            value={environmentPin}
                            onChange={(event) =>
                              setEnvironmentPin(event.target.value.replace(/\D/g, "").slice(0, 4))
                            }
                          />
                          {!environmentUnlocked ? (
                            <button
                              type="button"
                              disabled={environmentBusy}
                              onClick={unlockEnvironment}
                              className="flex items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                            >
                              <UnlockKeyhole size={14} />
                              {state.environmentVault ? "Unlock" : "Create file"}
                            </button>
                          ) : (
                            <>
                              <textarea
                                className="min-h-48 w-full resize-y rounded-lg border border-border-2 bg-surface p-3 font-mono text-xs text-text outline-none focus:border-accent"
                                spellCheck={false}
                                aria-label="Sensitive environment file"
                                placeholder={"SERVICE_API_KEY=\nPRIVATE_TOKEN="}
                                value={environmentDraft}
                                onChange={(event) => setEnvironmentDraft(event.target.value)}
                              />
                              <button
                                type="button"
                                disabled={environmentBusy}
                                onClick={saveEnvironment}
                                className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                              >
                                Encrypt and save
                              </button>
                            </>
                          )}
                          <p className="text-xs leading-relaxed text-text-3">
                            The generated password stays in this browser and combines with your PIN to unlock the file. Back it up separately if you need cross-device recovery. Server OAuth values still belong in apps/web/.env.local.
                          </p>
                        </div>
                      )}
                    </SettingRow>
                  </>
                )}

                {resolvedActiveSection === "ai" && (
                  <>
                    <SettingRow
                      label="API base URL"
                      description="OpenAI-compatible API including /v1. Enabled feature context may be sent to this endpoint; remote endpoints should be trusted and use HTTPS."
                    >
                      <input
                        className="settings-input"
                        value={urlDraft}
                        onChange={(e) => {
                          setUrlDraft(e.target.value);
                          setModels([]);
                          setShowAssistantDropdown(false);
                        }}
                        placeholder="http://127.0.0.1:8080/v1"
                      />
                    </SettingRow>

                    {/* Model picker */}
                    <SettingRow
                      label="Model"
                      description="Model used for all AI features. Leave blank to use the first model reported by the server."
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
        const val = m.id;
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
              <div className="text-xs text-text-3 truncate">{m.id}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
