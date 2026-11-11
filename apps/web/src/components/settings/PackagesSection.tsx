"use client";

import { useState } from "react";
import { RefreshCw, PackageCheck, PackageX } from "lucide-react";
import { useApp } from "@crewmate/state";
import { apiFetch } from "@crewmate/lib";
import type { FeaturePackageInfo, FeaturePlugin, Page } from "@crewmate/types";
import { PLUGINS } from "@/plugins/registry";

function pageForPlugin(plugin: FeaturePlugin): Page {
  return {
    id: plugin.id,
    type: plugin.id,
    label: plugin.label,
    keybinding: plugin.keybinding ?? "",
  };
}

/** Enable/disable feature packages and re-check which ones are installed. */
export default function PackagesSection() {
  const { state, dispatch, notify } = useApp();
  const [checkingFeatures, setCheckingFeatures] = useState(false);

  const isInstalled = (featureId: string) =>
    state.installedFeatures.find((f) => f.id === featureId)?.installed ?? true;
  const isFeatureEnabled = (pluginId: string) =>
    state.pages.some((p) => p.type === pluginId);

  function toggleFeature(plugin: FeaturePlugin) {
    const enabled = !isFeatureEnabled(plugin.id);
    dispatch({ type: "SET_FEATURE_ENABLED", page: pageForPlugin(plugin), enabled });
    notify(`${plugin.label} ${enabled ? "enabled" : "disabled"}`, "success");
  }

  async function recheckInstalledFeatures() {
    setCheckingFeatures(true);
    try {
      const data = await apiFetch<{ features?: FeaturePackageInfo[] }>("/api/features");
      if (Array.isArray(data?.features)) {
        dispatch({ type: "SET_INSTALLED_FEATURES", features: data.features });
      }
      notify("Package list refreshed", "success");
    } catch {
      notify("Failed to check installed packages", "error");
    } finally {
      setCheckingFeatures(false);
    }
  }

  return (
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
                role="switch"
                aria-checked={enabled}
                aria-label={`${plugin.label} page`}
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
  );
}
