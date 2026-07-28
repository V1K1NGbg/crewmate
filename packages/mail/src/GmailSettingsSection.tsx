"use client";

import { SettingRow } from "@crewmate/lib";
import type { FeatureSettingsProps } from "@crewmate/types";
import type { GmailPluginSettings } from "./settings";

export default function GmailSettingsSection({
  settings,
  onChange,
}: FeatureSettingsProps<GmailPluginSettings>) {
  return (
    <SettingRow label="Max threads">
      <select
        className="settings-select"
        value={settings.maxThreads}
        onChange={(e) => onChange({ maxThreads: Number(e.target.value) })}
      >
        <option value={10}>10</option>
        <option value={20}>20</option>
        <option value={50}>50</option>
      </select>
    </SettingRow>
  );
}
