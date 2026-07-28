"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { SettingRow, SettingToggle } from "@crewmate/lib";
import type { FeatureSettingsProps } from "@crewmate/types";
import type { CalendarPluginSettings, GoogleCalendarList } from "./settings";
import { isCalendarEnabled, toggleEnabledCalendarId } from "./calendarSettings";

export default function CalendarSettingsSection({
  settings,
  onChange,
}: FeatureSettingsProps<CalendarPluginSettings>) {
  const [calendarList, setCalendarList] = useState<GoogleCalendarList[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadCalendarList();
  }, []);

  async function loadCalendarList() {
    setLoading(true);
    try {
      const res = await fetch("/api/calendar/lists");
      if (!res.ok) return;
      const data = await res.json();
      setCalendarList(data.calendars ?? []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }

  function toggleCalendarId(id: string) {
    const next = toggleEnabledCalendarId(
      id,
      settings.enabledCalendarIds ?? [],
      calendarList,
    );
    onChange({ enabledCalendarIds: next });
  }

  return (
    <>
      <SettingRow label="Default view">
        <select
          className="settings-select"
          value={settings.defaultView}
          onChange={(e) =>
            onChange({ defaultView: e.target.value as "month" | "week" })
          }
        >
          <option value="month">Month</option>
          <option value="week">Week</option>
        </select>
      </SettingRow>

      <SettingToggle
        label="Week starts on Monday"
        description="When off, weeks start on Sunday"
        checked={(settings.weekStartsOn ?? 0) === 1}
        onChange={() =>
          onChange({ weekStartsOn: (settings.weekStartsOn ?? 0) === 1 ? 0 : 1 })
        }
      />

      <SettingToggle
        label="Show weekends"
        checked={settings.showWeekends}
        onChange={() => onChange({ showWeekends: !settings.showWeekends })}
      />
      <SettingToggle
        label="Show declined events"
        checked={settings.showDeclined}
        onChange={() => onChange({ showDeclined: !settings.showDeclined })}
      />
      <SettingToggle
        label="24-hour time"
        checked={settings.use24HourTime ?? false}
        onChange={() =>
          onChange({ use24HourTime: !settings.use24HourTime })
        }
      />
      <SettingRow
        label="Timezone"
        description="IANA timezone name (e.g. America/New_York, Europe/Berlin)"
      >
        <input
          className="settings-input"
          value={
            settings.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
          }
          onChange={(e) => onChange({ timezone: e.target.value })}
          placeholder="e.g. America/New_York"
        />
      </SettingRow>

      <SettingRow
        label="Google Calendars"
        description="Select which calendars to display. Primary is always enabled when no other calendar is selected."
      >
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-text-3 py-2">
            <RefreshCw size={13} className="animate-spin" />
            Loading calendars…
          </div>
        ) : calendarList.length === 0 ? (
          <button
            onClick={loadCalendarList}
            className="flex items-center gap-2 text-sm text-accent hover:underline"
          >
            <RefreshCw size={13} /> Load calendars
          </button>
        ) : (
          <div className="flex flex-col gap-2.5">
            {calendarList.map((cal) => {
              const enabledIds = settings.enabledCalendarIds ?? [];
              const isChecked = isCalendarEnabled(cal, enabledIds);
              return (
                <label
                  key={cal.id}
                  className="flex items-center gap-3 cursor-pointer group"
                >
                  <button
                    type="button"
                    onClick={() => toggleCalendarId(cal.id)}
                    className={`relative w-8 h-5 rounded-full transition-all flex-shrink-0 ${
                      isChecked
                        ? "bg-accent"
                        : "bg-border-2 group-hover:bg-border"
                    }`}
                  >
                    <div
                      className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                        isChecked ? "translate-x-[14px]" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{
                      backgroundColor:
                        cal.backgroundColor ?? "var(--color-accent)",
                    }}
                  />
                  <span className="text-sm text-text group-hover:text-text transition-colors">
                    {cal.summary}
                    {cal.primary && (
                      <span className="ml-1.5 text-xs text-text-3">
                        (primary)
                      </span>
                    )}
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </SettingRow>

      {calendarList.length > 0 && (
        <SettingRow
          label="Default calendar for new events"
          description="Events you create will be saved to this calendar"
        >
          <select
            className="settings-select"
            value={settings.defaultCalendarId ?? "primary"}
            onChange={(e) => onChange({ defaultCalendarId: e.target.value })}
          >
            <option value="primary">Primary calendar</option>
            {calendarList
              .filter((c) => !c.primary)
              .map((cal) => (
                <option key={cal.id} value={cal.id}>
                  {cal.summary}
                </option>
              ))}
          </select>
        </SettingRow>
      )}
    </>
  );
}
