import type { GoogleCalendarList } from "./settings";

export function getPrimaryCalendarId(
  calendarList: GoogleCalendarList[] = [],
): string {
  return calendarList.find((c) => c.primary)?.id ?? "primary";
}

/** True when a calendar should be shown (primary on by default). */
export function isCalendarEnabled(
  cal: GoogleCalendarList,
  enabledIds: string[] | undefined,
): boolean {
  const ids = enabledIds ?? [];
  if (ids.length === 0) return !!cal.primary;
  if (cal.primary) {
    return ids.includes(cal.id) || ids.includes("primary");
  }
  return ids.includes(cal.id);
}

/** Empty/missing list defaults to primary only. */
export function normalizeEnabledCalendarIds(
  enabledIds: string[] | undefined,
  calendarList: GoogleCalendarList[] = [],
): string[] {
  const ids = enabledIds ?? [];
  if (ids.length === 0) {
    return [getPrimaryCalendarId(calendarList)];
  }
  return ids;
}

export function toggleEnabledCalendarId(
  id: string,
  current: string[],
  calendarList: GoogleCalendarList[],
): string[] {
  const primaryId = getPrimaryCalendarId(calendarList);
  const isPrimaryCalendar = id === primaryId;

  if (current.includes(id)) {
    const next = current.filter((x) => x !== id);
    const withoutPrimary = isPrimaryCalendar
      ? next.filter((x) => x !== "primary")
      : next;
    if (withoutPrimary.length === 0) {
      return [primaryId];
    }
    return withoutPrimary;
  }

  return [...current, id];
}
