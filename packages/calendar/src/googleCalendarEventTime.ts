import { addDays, format, parseISO } from "date-fns";

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
      dateTime: new Date(params.startDateTime).toISOString(),
      timeZone: params.timeZone,
    }),
    end: normalizeGoogleEventDateTime({
      dateTime: new Date(params.endDateTime).toISOString(),
      timeZone: params.timeZone,
    }),
  };
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
