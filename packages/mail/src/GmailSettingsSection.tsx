"use client";

import { useState } from "react";
import { SettingRow, SettingToggle } from "@crewmate/lib";
import type { FeatureSettingsProps } from "@crewmate/types";
import type { GmailPluginSettings } from "./settings";

const KEYBINDS = [
  ["Toggle quick review", "quickReviewToggleKey"],
  ["Next action", "reviewNextActionKey"],
  ["Previous action", "reviewPreviousActionKey"],
  ["Apply + archive", "reviewApplyKey"],
  ["Skip email", "reviewSkipKey"],
  ["Apply only", "reviewApplyOnlyKey"],
] as const;

export default function GmailSettingsSection({
  settings,
  onChange,
}: FeatureSettingsProps<GmailPluginSettings>) {
  const [languageDraft, setLanguageDraft] = useState(
    settings.mainLanguage ?? "English",
  );
  return (
    <>
      <SettingRow label="Max threads">
        <select
          className="settings-select"
          value={settings.maxThreads}
          onChange={(event) => onChange({ maxThreads: Number(event.target.value) })}
        >
          <option value={10}>10</option>
          <option value={20}>20</option>
          <option value={50}>50</option>
        </select>
      </SettingRow>

      <SettingRow
        label="Primary language"
        description="Foreign-language messages are translated into this language using your configured AI endpoint."
      >
        <input
          className="settings-input"
          value={languageDraft}
          maxLength={60}
          onChange={(event) => setLanguageDraft(event.target.value)}
          onBlur={(event) => {
            const value = event.target.value.trim();
            const next = value || "English";
            setLanguageDraft(next);
            onChange({ mainLanguage: next });
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") {
              setLanguageDraft(settings.mainLanguage ?? "English");
              event.currentTarget.blur();
            }
          }}
          placeholder="English"
        />
      </SettingRow>

      <SettingToggle
        label="Translate foreign emails"
        description="Automatically detect and translate opened messages. The original remains available."
        checked={settings.autoTranslateForeignEmails ?? false}
        onChange={() =>
          onChange({
            autoTranslateForeignEmails: !settings.autoTranslateForeignEmails,
          })
        }
      />

      <SettingRow
        label="Precomputed emails"
        description="Keep suggestions ready for this many emails after the current message"
      >
        <CountInput
          value={settings.suggestionPrecomputeCount ?? 5}
          onCommit={(value) =>
            onChange({ suggestionPrecomputeCount: value })
          }
          ariaLabel="Precomputed email count"
        />
      </SettingRow>

      <SettingRow
        label="Suggestions per email"
        description="A rough target; the AI may return fewer when an email has little actionable content"
      >
        <CountInput
          value={settings.suggestionActionCount ?? 6}
          onCommit={(value) => onChange({ suggestionActionCount: value })}
          ariaLabel="Suggestion count"
        />
      </SettingRow>

      <SettingRow
        label="Quick review keys"
        description="Click a box, then press a letter or number. Choosing a key already in use swaps the two shortcuts."
      >
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-bg p-3">
          {KEYBINDS.map(([label, settingKey]) => (
            <label
              key={settingKey}
              className="flex min-w-0 items-center justify-between gap-4"
            >
              <span className="truncate text-sm text-text-2">{label}</span>
              <input
                className="h-9 flex-shrink-0 rounded-lg border border-border-2 bg-surface text-center font-mono text-sm uppercase text-text outline-none focus:border-accent"
                style={{ width: 48 }}
                readOnly
                value={settings[settingKey] ?? defaultReviewKey(settingKey)}
                onFocus={(event) => event.currentTarget.select()}
                onKeyDown={(event) => {
                  const value = event.key.toLowerCase();
                  if (!/^[a-z0-9]$/.test(value)) return;
                  event.preventDefault();
                  const currentValue =
                    settings[settingKey] ?? defaultReviewKey(settingKey);
                  const conflictingEntry = KEYBINDS.find(
                    ([, otherKey]) =>
                      otherKey !== settingKey &&
                      (settings[otherKey] ?? defaultReviewKey(otherKey)) === value,
                  );
                  onChange({
                    [settingKey]: value,
                    ...(conflictingEntry
                      ? { [conflictingEntry[1]]: currentValue }
                      : {}),
                  });
                }}
                aria-label={`${label} key`}
              />
            </label>
          ))}
        </div>
      </SettingRow>
    </>
  );
}

function defaultReviewKey(key: keyof GmailPluginSettings): string {
  const defaults: Record<string, string> = {
    quickReviewToggleKey: "r",
    reviewNextActionKey: "j",
    reviewPreviousActionKey: "k",
    reviewApplyKey: "e",
    reviewSkipKey: "x",
    reviewApplyOnlyKey: "a",
  };
  return defaults[key] ?? "";
}

function clampCount(value: number): number {
  return Math.min(10, Math.max(1, Math.round(value)));
}

function CountInput({
  value,
  onCommit,
  ariaLabel,
}: {
  value: number;
  onCommit: (value: number) => void;
  ariaLabel: string;
}) {
  const [draft, setDraft] = useState(String(value));

  function commit() {
    const parsed = Number(draft);
    const next = Number.isFinite(parsed) && draft.trim()
      ? clampCount(parsed)
      : clampCount(value);
    setDraft(String(next));
    if (next !== value) onCommit(next);
  }

  return (
    <input
      type="number"
      inputMode="numeric"
      className="settings-input"
      min={1}
      max={10}
      step={1}
      value={draft}
      onChange={(event) => {
        if (!/^\d{0,2}$/.test(event.target.value)) return;
        setDraft(event.target.value);
        const parsed = Number(event.target.value);
        if (parsed >= 1 && parsed <= 10) onCommit(parsed);
      }}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          setDraft(String(value));
          event.currentTarget.blur();
        }
      }}
      aria-label={ariaLabel}
    />
  );
}
