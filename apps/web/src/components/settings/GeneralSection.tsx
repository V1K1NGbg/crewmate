"use client";

import { useApp } from "@crewmate/state";
import { SettingRow } from "@crewmate/lib";
import { COLOR_SCHEMES, type ComponentSpacing } from "@crewmate/types";
import EnvironmentVaultSetting from "./EnvironmentVaultSetting";

/** Theme, density, refresh interval, local data, and the encrypted .env vault. */
export default function GeneralSection() {
  const { state, dispatch, clearLocalData } = useApp();

  return (
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
        description="Preferences and assistant history are kept only for this signed-in account on this device. Signing out does not remove them; use these buttons to delete them."
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
      <EnvironmentVaultSetting />
    </>
  );
}
