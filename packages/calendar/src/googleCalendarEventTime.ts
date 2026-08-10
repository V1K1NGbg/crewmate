import { addDays, format, parseISO } from "date-fns";
import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";

type EventDateTimeInput = {
  date?: string;
  dateTime?: string;
  timeZone?: string;
};

type GoogleEventDateTime = {
  date?: string | null;
  dateTime?: string | null;
  timeZone?: string | null;
};

/** Google Calendar PATCH requires nulling the opposite field when switching all-day ↔ timed. */
export function normalizeGoogleEventDateTime(
  dt: EventDateTimeInput,
): GoogleEventDateTime {
  if (dt.dateTime) {
    return {
      dateTime: dt.dateTime,
      ...(dt.timeZone ? { timeZone: dt.timeZone } : {}),
      date: null,
    };
  }
  if (dt.date) {
    return {
      date: dt.date,
      dateTime: null,
      timeZone: null,
    };
  }
  return dt;
}

export function buildGoogleEventTimes(params: {
  allDay: boolean;
  startDate: string;
  endDate: string;
  startDateTime: string;
  endDateTime: string;
  timeZone: string;
}): { start: GoogleEventDateTime; end: GoogleEventDateTime } {
  if (params.allDay) {
    const allDayEnd =
      params.endDate && params.endDate >= params.startDate
        ? format(addDays(parseISO(params.endDate), 1), "yyyy-MM-dd")
        : format(addDays(parseISO(params.startDate), 1), "yyyy-MM-dd");
    return {
      start: normalizeGoogleEventDateTime({ date: params.startDate }),
      end: normalizeGoogleEventDateTime({ date: allDayEnd }),
    };
  }

  return {
    start: normalizeGoogleEventDateTime({
      dateTime: wallClockToInstant(params.startDateTime, params.timeZone),
      timeZone: params.timeZone,
    }),
    end: normalizeGoogleEventDateTime({
      dateTime: wallClockToInstant(params.endDateTime, params.timeZone),
      timeZone: params.timeZone,
    }),
  };
}

export function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return value.length > 0;
  } catch {
    return false;
  }
}

export function wallClockToInstant(value: string, timeZone: string): string {
  if (!isValidTimeZone(timeZone)) throw new RangeError("Invalid timezone");
  const instant = fromZonedTime(value, timeZone);
  if (Number.isNaN(instant.getTime())) throw new RangeError("Invalid datetime");
  return instant.toISOString();
}

export function instantToWallClock(value: string, timeZone: string): string {
  if (!isValidTimeZone(timeZone)) throw new RangeError("Invalid timezone");
  const instant = parseISO(value);
  if (Number.isNaN(instant.getTime())) throw new RangeError("Invalid datetime");
  return formatInTimeZone(instant, timeZone, "yyyy-MM-dd'T'HH:mm");
}

export function formatInstantInTimeZone(
  value: string | Date,
  timeZone: string,
  pattern: string,
): string {
  return formatInTimeZone(value, timeZone, pattern);
}

/** Date-fns layout helper whose local fields represent an instant in the chosen zone. */
export function instantToZonedDate(value: string | Date, timeZone: string): Date {
  if (!isValidTimeZone(timeZone)) throw new RangeError("Invalid timezone");
  return toZonedTime(value, timeZone);
}

export function toInsertEventDateTime(
  dt: GoogleEventDateTime,
): EventDateTimeInput {
  if (dt.dateTime) {
    return {
      dateTime: dt.dateTime,
      ...(dt.timeZone ? { timeZone: dt.timeZone } : {}),
    };
  }
  if (dt.date) {
    return { date: dt.date };
  }
  return {};
}

export function normalizeGoogleEventPatchBody(
  body: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...body };
  if (next.start && typeof next.start === "object") {
    next.start = normalizeGoogleEventDateTime(
      next.start as EventDateTimeInput,
    );
  }
  if (next.end && typeof next.end === "object") {
    next.end = normalizeGoogleEventDateTime(next.end as EventDateTimeInput);
  }
  return next;
}
