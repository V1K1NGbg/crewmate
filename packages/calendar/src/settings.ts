export interface GoogleCalendarList {
  id: string;
  summary: string;
  backgroundColor?: string;
  foregroundColor?: string;
  primary?: boolean;
  accessRole?: "freeBusyReader" | "reader" | "writer" | "owner";
  writable: boolean;
}

export interface CalendarPluginSettings {
  defaultView: "month" | "week";
  showWeekends: boolean;
  showDeclined: boolean;
  startHour: number;
  endHour: number;
  timezone: string;
  weekStartsOn: 0 | 1;
  enabledCalendarIds: string[];
  defaultCalendarId: string;
  use24HourTime: boolean;
}

export const DEFAULT_CALENDAR_SETTINGS: CalendarPluginSettings = {
  defaultView: "month",
  showWeekends: true,
  showDeclined: false,
  startHour: 8,
  endHour: 20,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  weekStartsOn: 0,
  enabledCalendarIds: ["primary"],
  defaultCalendarId: "primary",
  use24HourTime: false,
};
