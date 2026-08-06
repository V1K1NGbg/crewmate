import { lazy } from "react";
import { Calendar, CalendarPlus, ExternalLink } from "lucide-react";
import type { FeaturePlugin, CalendarEvent } from "@crewmate/types";
import { DEFAULT_CALENDAR_SETTINGS, type CalendarPluginSettings } from "./settings";

function buildAssistantContext(data: unknown): string | null {
  const events = (data as CalendarEvent[] | undefined) ?? [];
  if (events.length === 0) return null;
  const lines: string[] = [`\n--- Calendar Events (${events.length}) ---`];
  for (const e of events.slice(0, 15)) {
    const start = e.start.dateTime ?? e.start.date ?? "";
    const loc = e.location ? ` @ ${e.location}` : "";
    lines.push(`• [id:${e.id}] ${e.summary} — ${start}${loc}`);
    if (e.description) lines.push(`  ${e.description.slice(0, 150)}`);
  }
  if (events.length > 15) lines.push(`  …and ${events.length - 15} more`);
  return lines.join("\n");
}

export const calendarPlugin: FeaturePlugin<CalendarPluginSettings> = {
  id: "calendar",
  packageName: "@crewmate/calendar",
  label: "Calendar",
  description: "View and manage Google Calendar events in month or week view.",
  icon: Calendar,
  color: "#818cf8",
  keybinding: "2",
  enabledByDefault: true,
  Page: lazy(() => import("./CalendarPage")),
  defaultSettings: DEFAULT_CALENDAR_SETTINGS,
  SettingsSection: lazy(() => import("./CalendarSettingsSection")),
  buildAssistantContext,
  assistantActions: [
    {
      type: "create_event",
      icon: CalendarPlus,
      promptHint:
        '{"type":"create_event","label":"Create event","payload":{"title":"...","startHint":"2024-03-15T14:00:00","endHint":"2024-03-15T15:00:00","description":"..."}} (for multi-day all-day events use dateHint as the start date and endDateHint as the inclusive end date instead of startHint/endHint)',
      buildPrefill: (payload) => ({
        title: payload?.title ?? "New Event",
        description: payload?.description,
        dateHint: payload?.dateHint,
        startHint: payload?.startHint,
        endHint: payload?.endHint,
        endDateHint: payload?.endDateHint,
      }),
    },
    {
      type: "open_event",
      icon: ExternalLink,
      promptHint:
        '{"type":"open_event","label":"View event","payload":{"eventId":"..."}}',
      buildPrefill: (payload) => ({
        title: "Event",
        eventId: payload?.eventId,
      }),
    },
  ],
};
