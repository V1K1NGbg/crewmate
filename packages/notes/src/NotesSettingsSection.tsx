"use client";

import { SettingRow } from "@crewmate/lib";
import type { FeatureSettingsProps } from "@crewmate/types";
import type { NotesPluginSettings } from "./settings";

export default function NotesSettingsSection({
  settings,
  onChange,
}: FeatureSettingsProps<NotesPluginSettings>) {
  return (
    <>
      <SettingRow label="Font size">
        <select
          className="settings-select"
          value={settings.fontSize ?? 15}
          onChange={(e) => onChange({ fontSize: Number(e.target.value) })}
        >
          <option value={12}>12px</option>
          <option value={13}>13px</option>
          <option value={14}>14px (default)</option>
          <option value={15}>15px</option>
          <option value={16}>16px</option>
          <option value={18}>18px</option>
        </select>
      </SettingRow>
      <SettingRow label="Auto-save delay">
        <select
          className="settings-select"
          value={settings.autoSaveDelay ?? 1000}
          onChange={(e) => onChange({ autoSaveDelay: Number(e.target.value) })}
        >
          <option value={500}>0.5s</option>
          <option value={1000}>1s (default)</option>
          <option value={2000}>2s</option>
          <option value={5000}>5s</option>
        </select>
      </SettingRow>
    </>
  );
}
