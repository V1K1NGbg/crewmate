"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  Loader2,
  Calendar as CalIcon,
  Download,
  RefreshCw,
} from "lucide-react";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  addMonths,
  subMonths,
  addWeeks,
  subWeeks,
  parseISO,
  isToday,
  parse,
  startOfDay,
  addDays,
  differenceInCalendarDays,
  addHours,
} from "date-fns";
import { useApp } from "@crewmate/state";
import { useSession } from "next-auth/react";
import { useDialogFocus, useResizable } from "@crewmate/lib";
import type { CalendarEventDateTime, CalendarPrefill, MailReviewOrigin, Task, Note } from "@crewmate/types";
import { useCalendar, type CalendarEvent } from "./useCalendar";
import {
  DEFAULT_CALENDAR_SETTINGS,
  type CalendarPluginSettings,
  type GoogleCalendarList,
} from "./settings";
import {
  buildGoogleEventTimes,
  instantToWallClock,
  prefillHintToWallClock,
  instantToZonedDate,
  isValidTimeZone,
  toInsertEventDateTime,
} from "./googleCalendarEventTime";
import {
  calculateMonthWeekMinHeight,
  isMonthSegmentOutside,
} from "./monthLayout";
import { computeOverlapLayout, computeSpanningLayout } from "./eventLayout";
import EventFormFields from "./EventFormFields";
import { CalendarImportPanel, EventDetailsPanel } from "./CalendarSidePanels";

type ViewMode = "month" | "week";

const EVENT_COLORS: Record<string, string> = {
  "1": "#a8c7fa",
  "2": "#81c995",
  "3": "#fcad70",
  "4": "#f28b82",
  "5": "#fdcfe8",
  "6": "#e6c9a8",
  "7": "#cbf0f8",
  "8": "#aecbfa",
  "9": "#d7aefb",
  "10": "#ccff90",
  "11": "#ff8bcb",
};

// Distinct palette for calendar-based coloring when no colorId is set
const CALENDAR_PALETTE = [
  "#818cf8",
  "#34d399",
  "#fb923c",
  "#f472b6",
  "#60a5fa",
  "#a78bfa",
  "#facc15",
  "#4ade80",
];

const EVENT_TEXT_INSET = { paddingLeft: 6, paddingRight: 4 } as const;
const EVENT_BLOCK_INSET = {
  paddingLeft: 8,
  paddingRight: 6,
  paddingTop: 4,
  paddingBottom: 3,
} as const;
function eventAccentStyle(color: string, show = true, width = 3) {
  if (!show) return {};
  return { borderLeft: `${width}px solid ${color}` };
}

function eventBg(color: string, kind: "allDay" | "timed" = "allDay") {
  const pct = kind === "timed" ? 22 : 16;
  if (color.startsWith("var(")) {
    return `color-mix(in srgb, ${color} ${pct}%, transparent)`;
  }
  return color + (kind === "timed" ? "38" : "28");
}

function parseDateHint(hint: string | undefined): string {
  if (!hint) return format(new Date(), "yyyy-MM-dd");
  try {
    const d = parseISO(hint);
    if (!isNaN(d.getTime())) return format(d, "yyyy-MM-dd");
  } catch {
    /* ignore */
  }
  try {
    const d = parse(hint, "yyyy-MM-dd", new Date());
    if (!isNaN(d.getTime())) return format(d, "yyyy-MM-dd");
  } catch {
    /* ignore */
  }
  return format(new Date(), "yyyy-MM-dd");
}

export default function CalendarPage() {
  const { state, dispatch } = useApp();
  const { data: session, status: sessionStatus } = useSession();
  const cal = useCalendar();

  const calendarSettings =
    (state.pageSettings.features.calendar as
      | CalendarPluginSettings
      | undefined) ?? DEFAULT_CALENDAR_SETTINGS;
  const displayTimeZone = isValidTimeZone(calendarSettings.timezone)
    ? calendarSettings.timezone
    : Intl.DateTimeFormat().resolvedOptions().timeZone;

  function eventStart(event: CalendarEvent): Date {
    return event.start.dateTime
      ? instantToZonedDate(event.start.dateTime, displayTimeZone)
      : parseISO(event.start.date ?? "");
  }
  function eventEnd(event: CalendarEvent): Date {
    return event.end.dateTime
      ? instantToZonedDate(event.end.dateTime, displayTimeZone)
      : parseISO(event.end.date ?? "");
  }

  // Other features' data, read generically — only present if those pages are
  // installed/enabled and have populated their `featureData` slot.
  const importableTasks = (state.featureData.tasks as Task[] | undefined) ?? [];
  const importableNotes = (state.featureData.notes as Note[] | undefined) ?? [];

  const weekStartsOn = (calendarSettings.weekStartsOn ?? 0) as 0 | 1;
  const use24h = calendarSettings.use24HourTime ?? false;
  const timeFmtA = use24h ? "H:mm" : "h:mm a";

  const [view, setView] = useState<ViewMode>(calendarSettings.defaultView);
  const [cursor, setCursor] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(
    null,
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [createDate, setCreateDate] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const createDialogRef = useDialogFocus(createOpen);
  const editDialogRef = useDialogFocus(editOpen);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [importPanelOpen, setImportPanelOpen] = useState(false);

  // Calendar list for coloring & selector
  const [calendarList, setCalendarList] = useState<GoogleCalendarList[]>([]);

  const calColorMap = useMemo(() => {
    const map = new Map<string, string>();
    calendarList.forEach((cal, idx) => {
      map.set(
        cal.id,
        cal.backgroundColor ?? CALENDAR_PALETTE[idx % CALENDAR_PALETTE.length],
      );
    });
    return map;
  }, [calendarList]);

  // Resolve the "primary" sentinel to the actual calendar ID.
  // Google uses "primary" as an alias but option values must match cal.id exactly.
  function resolveCalendarId(id: string): string {
    if (id !== "primary") return id;
    const primaryCal = calendarList.find((c) => c.primary);
    return primaryCal ? primaryCal.id : id;
  }

  useEffect(() => {
    fetch("/api/calendar/lists")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.calendars) setCalendarList(data.calendars);
      })
      .catch(() => {
        /* silent */
      });
  }, []);

  // Once the calendar list loads, re-resolve "primary" to the real calendar ID
  // so the selector has the correct default before the user opens the form.
  useEffect(() => {
    if (calendarList.length === 0) return;
    // The fetched list resolves Google's external "primary" alias for the form.
    setFormCalendarId(
      resolveCalendarId(
        calendarSettings.defaultCalendarId || "primary",
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calendarList]);

  function eventColor(event: CalendarEvent): string {
    if (event.colorId && EVENT_COLORS[event.colorId]) {
      return EVENT_COLORS[event.colorId];
    }
    if (event.calendarId && calColorMap.has(event.calendarId)) {
      return calColorMap.get(event.calendarId)!;
    }
    return "var(--color-accent)";
  }

  const importResize = useResizable({
    side: "left",
    initial: state.panelWidths.calendarImport ?? 320,
    min: 260,
    max: 520,
    onResize: (w) =>
      dispatch({
        type: "SET_PANEL_WIDTH",
        key: "calendarImport",
        width: w,
      }),
  });

  const [formTitle, setFormTitle] = useState("");
  const [formStart, setFormStart] = useState("");
  const [formEnd, setFormEnd] = useState("");
  const [formAllDay, setFormAllDay] = useState(false);
  const [formEndDate, setFormEndDate] = useState(""); // for all-day multi-day
  const [formDesc, setFormDesc] = useState("");
  const [formLocation, setFormLocation] = useState("");
  const [formCalendarId, setFormCalendarId] = useState(
    calendarSettings.defaultCalendarId || "primary",
  );
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const prefillEmailContextRef = useRef<string | null>(null);
  const mailReviewOriginRef = useRef<MailReviewOrigin | null>(null);

  // Current time line
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(id);
  }, []);

  const calendarPrefill = state.pagePrefills.calendar as
    | CalendarPrefill
    | undefined;

  useEffect(() => {
    if (!calendarPrefill) return;
    const pf = calendarPrefill;
    if (pf.eventId) {
      const event = cal.events.find((candidate) => candidate.id === pf.eventId);
      if (!event) return;
      setSelectedEvent(event);
      setCursor(eventStart(event));
      dispatch({ type: "CLEAR_PAGE_PREFILL", pageId: "calendar" });
      return;
    }
    const dateStr = parseDateHint(pf.dateHint);
    // The prefill is an external command consumed into the form's local draft.
    setCreateDate(dateStr);
    setFormTitle(pf.title);
    setFormDesc(pf.description ?? "");
    prefillEmailContextRef.current = pf.emailContext ?? null;
    mailReviewOriginRef.current = pf.reviewOrigin ?? null;
    setFormErrors({});

    // If endDateHint is provided and differs from start → all-day multi-day
    if (pf.endDateHint && !pf.startHint) {
      const endDateStr = parseDateHint(pf.endDateHint);
      setFormAllDay(true);
      setFormEndDate(endDateStr !== dateStr ? endDateStr : "");
      setFormStart(`${dateStr}T09:00`);
      setFormEnd(`${dateStr}T10:00`);
    } else if (pf.startHint) {
      const start = prefillHintToWallClock(pf.startHint, displayTimeZone) ?? `${dateStr}T09:00`;
      setFormStart(start);
      setFormAllDay(false);
      setFormEndDate("");
      const end = prefillHintToWallClock(pf.endHint, displayTimeZone);
      setFormEnd(
        end && end > start
          ? end
          : format(addHours(parseISO(start), 1), "yyyy-MM-dd'T'HH:mm"),
      );
    } else {
      setFormStart(`${dateStr}T09:00`);
      setFormEnd(`${dateStr}T10:00`);
      setFormAllDay(false);
      setFormEndDate("");
    }
    setFormLocation("");
    setFormCalendarId(
      resolveCalendarId(
        calendarSettings.defaultCalendarId || "primary",
      ),
    );
    setCreateOpen(true);
    dispatch({ type: "CLEAR_PAGE_PREFILL", pageId: "calendar" });
  }, [calendarPrefill, cal.events, dispatch]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const timeMin = startOfMonth(subMonths(cursor, 1)).toISOString();
    const timeMax = endOfMonth(addMonths(cursor, 1)).toISOString();
    cal.fetchEvents(timeMin, timeMax);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor]);

  useEffect(() => {
    dispatch({ type: "SET_FEATURE_DATA", featureId: "calendar", data: cal.events });
  }, [cal.events, dispatch]);

  useEffect(() => {
    const interval = state.pageSettings.general.autoRefreshInterval;
    if (!interval) return;
    const id = setInterval(() => {
      const timeMin = startOfMonth(subMonths(cursor, 1)).toISOString();
      const timeMax = endOfMonth(addMonths(cursor, 1)).toISOString();
      cal.fetchEvents(timeMin, timeMax);
    }, interval * 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.pageSettings.general.autoRefreshInterval, cursor]);

  function navigate(dir: 1 | -1) {
    if (view === "month")
      setCursor(dir === 1 ? addMonths(cursor, 1) : subMonths(cursor, 1));
    else setCursor(dir === 1 ? addWeeks(cursor, 1) : subWeeks(cursor, 1));
  }

  function openCreate(dateStr?: string, time?: string) {
    const d = dateStr ?? format(new Date(), "yyyy-MM-dd");
    const t = time ?? "09:00";
    const start = `${d}T${t}`;
    const [h, m] = t.split(":").map(Number);
    const endHour = h + 1;
    const endTime = `${endHour.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
    setCreateDate(d);
    setFormTitle("");
    setFormStart(start);
    setFormEnd(`${d}T${endTime}`);
    setFormAllDay(false);
    setFormDesc("");
    setFormLocation("");
    setFormErrors({});
    setFormEndDate("");
    setFormCalendarId(
      resolveCalendarId(
        calendarSettings.defaultCalendarId || "primary",
      ),
    );
    setCreateOpen(true);
  }

  function toggleFormAllDay() {
    setFormAllDay((wasAllDay) => {
      const next = !wasAllDay;
      if (next) {
        const date = formStart ? formStart.slice(0, 10) : createDate;
        setCreateDate(date);
        setFormEndDate("");
      } else {
        const d = createDate || format(new Date(), "yyyy-MM-dd");
        setFormStart(`${d}T09:00`);
        setFormEnd(`${d}T10:00`);
      }
      return next;
    });
  }

  function closeCreateForm() {
    setCreateOpen(false);
    prefillEmailContextRef.current = null;
    mailReviewOriginRef.current = null;
  }

  async function handleCreate() {
    const errors: Record<string, string> = {};
    if (!formTitle.trim()) errors.title = "Title is required";
    if (formAllDay) {
      if (!createDate) errors.date = "Date is required";
      if (formEndDate && formEndDate < createDate)
        errors.endDate = "End date must be on or after start date";
    } else {
      if (!formStart) errors.start = "Start time is required";
      if (!formEnd) errors.end = "End time is required";
      if (formStart && formEnd && new Date(formEnd) <= new Date(formStart))
        errors.end = "End must be after start";
    }
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }
    setFormErrors({});
    setSaving(true);
    const tz =
      calendarSettings.timezone ||
      Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!isValidTimeZone(tz)) {
      setFormErrors({ start: "Choose a valid IANA timezone in Settings" });
      setSaving(false);
      return;
    }
    // Append email context to description if present and description is empty
    const emailCtx = prefillEmailContextRef.current;
    const finalDesc = formDesc
      ? formDesc
      : emailCtx
        ? `[From email]\n\n${emailCtx.slice(0, 2000)}`
        : undefined;
    prefillEmailContextRef.current = null;
    const { start, end } = buildGoogleEventTimes({
      allDay: formAllDay,
      startDate: createDate,
      endDate: formEndDate,
      startDateTime: formStart,
      endDateTime: formEnd,
      timeZone: tz,
    });
    const createdEvent = await cal.createEvent({
      summary: formTitle,
      description: finalDesc || undefined,
      location: formLocation || undefined,
      calendarId: formCalendarId || "primary",
      start: toInsertEventDateTime(start) as
        | { dateTime: string; timeZone?: string }
        | { date: string },
      end: toInsertEventDateTime(end) as
        | { dateTime: string; timeZone?: string }
        | { date: string },
    });
    setSaving(false);
    if (!createdEvent) return;
    setCreateOpen(false);
    if (mailReviewOriginRef.current) {
      const { threadId } = mailReviewOriginRef.current;
      mailReviewOriginRef.current = null;
      dispatch({
        type: "SET_PAGE_PREFILL",
        pageId: "mail",
        prefill: { reviewCompletedThreadId: threadId },
      });
      dispatch({ type: "SET_ACTIVE_PAGE", id: "mail" });
    }
  }

  async function handleDelete(event: CalendarEvent) {
    if (!event.calendarId) return;
    if (!window.confirm(`Delete “${event.summary || "Untitled event"}”?`)) return;
    await cal.deleteEvent(event.id, event.calendarId);
    setSelectedEvent(null);
  }

  function isCalendarWritable(calendarId?: string): boolean {
    if (!calendarId) return false;
    const calendar = calendarList.find((candidate) => candidate.id === calendarId);
    return calendar?.writable ?? calendarId === "primary";
  }

  function openEdit(ev: CalendarEvent) {
    setEditingEvent(ev);
    setFormTitle(ev.summary ?? "");
    setFormDesc(ev.description ?? "");
    setFormLocation(ev.location ?? "");
    setFormCalendarId(
      ev.calendarId ??
        resolveCalendarId(
          calendarSettings.defaultCalendarId || "primary",
        ),
    );
    setFormErrors({});
    if (ev.start.dateTime) {
      setFormAllDay(false);
      const tz = calendarSettings.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
      setFormStart(instantToWallClock(ev.start.dateTime, tz));
      setFormEnd(
        instantToWallClock(ev.end.dateTime ?? ev.start.dateTime, tz),
      );
      setCreateDate(instantToWallClock(ev.start.dateTime, tz).slice(0, 10));
      setFormEndDate("");
    } else {
      setFormAllDay(true);
      const startDate = ev.start.date ?? "";
      // Google end date is exclusive — show inclusive end to user
      const endDateExclusive = ev.end.date ?? startDate;
      const endDateInclusive = format(
        addDays(parseISO(endDateExclusive), -1),
        "yyyy-MM-dd",
      );
      setCreateDate(startDate);
      setFormEndDate(endDateInclusive !== startDate ? endDateInclusive : "");
      setFormStart(`${startDate}T09:00`);
      setFormEnd(`${startDate}T10:00`);
    }
    setEditOpen(true);
  }

  async function handleUpdate() {
    if (!editingEvent) return;
    const errors: Record<string, string> = {};
    if (!formTitle.trim()) errors.title = "Title is required";
    if (formAllDay) {
      if (!createDate) errors.date = "Date is required";
      if (formEndDate && formEndDate < createDate)
        errors.endDate = "End date must be on or after start date";
    } else {
      if (!formStart) errors.start = "Start time is required";
      if (!formEnd) errors.end = "End time is required";
      if (formStart && formEnd && new Date(formEnd) <= new Date(formStart))
        errors.end = "End must be after start";
    }
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }
    if (!editingEvent.calendarId) {
      setFormErrors({ start: "This event's calendar is unknown; reload and try again" });
      return;
    }
    setFormErrors({});
    setSaving(true);
    const tz =
      calendarSettings.timezone ||
      Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!isValidTimeZone(tz)) {
      setFormErrors({ start: "Choose a valid IANA timezone in Settings" });
      setSaving(false);
      return;
    }
    const { start, end } = buildGoogleEventTimes({
      allDay: formAllDay,
      startDate: createDate,
      endDate: formEndDate,
      startDateTime: formStart,
      endDateTime: formEnd,
      timeZone: tz,
    });
    const patch: Partial<CalendarEvent> = {
      summary: formTitle,
      description: formDesc || undefined,
      location: formLocation || undefined,
      start: start as CalendarEventDateTime,
      end: end as CalendarEventDateTime,
    };
    const updated = await cal.updateEvent(
      editingEvent.id,
      patch,
      editingEvent.calendarId,
    );
    setSaving(false);
    setEditOpen(false);
    setEditingEvent(null);
    if (updated) setSelectedEvent(updated);
  }

  function importFromTask(task: {
    title: string;
    description?: string;
    dueDate?: string;
  }) {
    const dateStr = task.dueDate ?? format(new Date(), "yyyy-MM-dd");
    setCreateDate(dateStr);
    setFormTitle(task.title);
    setFormDesc(task.description ?? "");
    setFormStart(`${dateStr}T09:00`);
    setFormEnd(`${dateStr}T10:00`);
    setFormAllDay(false);
    setFormLocation("");
    setFormCalendarId(
      resolveCalendarId(
        calendarSettings.defaultCalendarId || "primary",
      ),
    );
    setCreateOpen(true);
    setImportPanelOpen(false);
  }

  function importFromNote(note: { title: string; content: string }) {
    const dateStr = format(new Date(), "yyyy-MM-dd");
    setCreateDate(dateStr);
    setFormTitle(note.title);
    setFormDesc(note.content.slice(0, 300));
    setFormStart(`${dateStr}T09:00`);
    setFormEnd(`${dateStr}T10:00`);
    setFormAllDay(false);
    setFormLocation("");
    setFormCalendarId(
      resolveCalendarId(
        calendarSettings.defaultCalendarId || "primary",
      ),
    );
    setCreateOpen(true);
    setImportPanelOpen(false);
  }

  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);
  const gridStart = startOfWeek(monthStart, { weekStartsOn });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const weekStart = startOfWeek(cursor, { weekStartsOn });
  const weekEnd = endOfWeek(cursor, { weekStartsOn });
  const fullWeekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });
  const weekDays = calendarSettings.showWeekends
    ? fullWeekDays
    : fullWeekDays.filter((day) => day.getDay() !== 0 && day.getDay() !== 6);
  const startHour = Math.max(0, Math.min(23, calendarSettings.startHour ?? 8));
  const endHour = Math.max(startHour + 1, Math.min(24, calendarSettings.endHour ?? 20));
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);

  // Day labels in correct order based on weekStartsOn
  const dayLabels =
    weekStartsOn === 1
      ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
      : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const visibleDayLabels = calendarSettings.showWeekends
    ? dayLabels
    : dayLabels.filter((day) => day !== "Sat" && day !== "Sun");

  function eventsOnDay(day: Date): CalendarEvent[] {
    const dayStart = startOfDay(day);
    const dayEnd = addDays(dayStart, 1);
    return cal.events.filter((e) => {
      try {
        const s = eventStart(e);
        const end = eventEnd(e);
        // Event overlaps this day if it starts before end-of-day and ends after start-of-day
        return s < dayEnd && end > dayStart;
      } catch {
        return false;
      }
    });
  }

  // Returns true if an event spans more than one calendar day
  function isMultiDay(e: CalendarEvent): boolean {
    try {
      return (
        differenceInCalendarDays(eventEnd(e), eventStart(e)) >
        (e.start.dateTime ? 0 : 1)
      );
    } catch {
      return false;
    }
  }

  // Current time position in the week grid (pixels, 56px per hour)
  const displayNow = instantToZonedDate(now, displayTimeZone);
  const nowMinutes = displayNow.getHours() * 60 + displayNow.getMinutes();
  const nowTop = ((nowMinutes - startHour * 60) / 60) * 56;

  const eventTime = {
    start: eventStart,
    end: eventEnd,
    isTimed: (event: CalendarEvent) => Boolean(event.start.dateTime),
  };

  if (
    sessionStatus === "unauthenticated" ||
    (sessionStatus !== "loading" &&
      (sessionStatus !== "authenticated" || session?.googleAuthStatus !== "ready")) ||
    cal.authError
  ) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 bg-bg p-12">
        <div className="flex w-full max-w-sm flex-col items-center gap-5 rounded-2xl border border-border-2 bg-surface p-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-surface-2">
            <CalIcon size={24} className="text-text-3" />
          </div>
          <div className="text-center">
            <h2 className="text-base font-semibold text-text">
              Re-authentication required
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-text-2">
              Sign out and sign back in to grant access to Google Calendar.
            </p>
          </div>
          <button
            type="button"
            onClick={() => window.location.assign("/api/auth/signout")}
            className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent-hover"
          >
            Sign out &amp; re-authenticate
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden bg-bg">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-bg flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center border border-border-2 rounded-lg overflow-hidden">
            <button
              aria-label="Previous period"
              onClick={() => navigate(-1)}
              className="w-8 h-8 flex items-center justify-center text-text-2 hover:text-text hover:bg-surface transition-colors"
            >
              <ChevronLeft size={15} />
            </button>
            <button
              aria-label="Next period"
              onClick={() => navigate(1)}
              className="w-8 h-8 flex items-center justify-center text-text-2 hover:text-text hover:bg-surface transition-colors border-l border-border-2"
            >
              <ChevronRight size={15} />
            </button>
          </div>
          <button
            onClick={() => setCursor(new Date())}
            style={{ padding: "2px 12px" }}
            className="text-sm font-medium text-text-2 border border-border-2 rounded-lg hover:border-accent hover:text-accent transition-all"
          >
            Today
          </button>
          <h2 className="text-sm font-semibold text-text ml-1">
            {view === "month"
              ? format(cursor, "MMMM yyyy")
              : `${format(weekStart, "MMM d")} – ${format(weekEnd, "MMM d, yyyy")}`}
          </h2>
          {cal.loading && (
            <Loader2 size={13} className="animate-spin text-text-3 ml-1" />
          )}
          <button
            aria-label="Refresh events"
            onClick={() => {
              const timeMin = startOfMonth(subMonths(cursor, 1)).toISOString();
              const timeMax = endOfMonth(addMonths(cursor, 1)).toISOString();
              cal.fetchEvents(timeMin, timeMax);
            }}
            disabled={cal.loading}
            className="w-8 h-8 flex items-center justify-center text-text-2 hover:text-text hover:bg-surface border border-border-2 rounded-lg transition-colors ml-1 disabled:opacity-40"
            title="Refresh events"
          >
            {cal.loading ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <RefreshCw size={13} />
            )}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setImportPanelOpen(!importPanelOpen)}
            style={{ padding: "2px 12px" }}
            className={`flex items-center gap-1.5 text-sm font-medium border rounded-lg transition-all ${
              importPanelOpen
                ? "border-accent text-accent bg-accent/10"
                : "border-border-2 text-text-2 hover:border-accent hover:text-accent"
            }`}
            title="Import from Notes or Tasks"
          >
            <Download size={13} /> Import
          </button>
          <div className="flex border border-border-2 rounded-lg overflow-hidden">
            {(["month", "week"] as ViewMode[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                style={{ padding: "2px 12px" }}
                className={`text-sm font-medium transition-colors ${
                  view === v
                    ? "bg-accent/15 text-accent"
                    : "text-text-2 hover:text-text hover:bg-surface"
                } ${v === "week" ? "border-l border-border-2" : ""}`}
              >
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
          <button
            onClick={() => openCreate()}
            style={{ padding: "2px 12px" }}
            className="flex items-center gap-1.5 text-sm font-medium text-text-2 border border-border-2 rounded-lg hover:border-accent hover:text-accent transition-all"
          >
            <Plus size={14} /> New event
          </button>
        </div>
      </div>

      {/* Calendar body + optional import panel */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 flex flex-col overflow-hidden">
          {view === "month" ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="grid border-b border-border" style={{ gridTemplateColumns: `repeat(${visibleDayLabels.length}, 1fr)` }}>
                {visibleDayLabels.map((d) => (
                  <div
                    key={d}
                    className="py-2 text-center text-xs text-text-3 font-semibold uppercase tracking-widest"
                  >
                    {d}
                  </div>
                ))}
              </div>
              <div className="flex-1 flex flex-col overflow-y-auto">
                {Array.from({ length: days.length / 7 }, (_, wi) => {
                  const fullWeekRow = days.slice(wi * 7, wi * 7 + 7);
                  const weekRow = calendarSettings.showWeekends
                    ? fullWeekRow
                    : fullWeekRow.filter((day) => day.getDay() !== 0 && day.getDay() !== 6);
                  const allDayInRow = cal.events.filter(
                    (e) =>
                      !e.start.dateTime &&
                      weekRow.some((d) => {
                        try {
                          const s = startOfDay(eventStart(e));
                          const en = startOfDay(eventEnd(e));
                          const ds = startOfDay(d);
                          return ds >= s && ds < en;
                        } catch {
                          return false;
                        }
                      }),
                  );
                  const timedInRow = cal.events.filter(
                    (e) =>
                      e.start.dateTime &&
                      weekRow.some((d) => {
                        try {
                          const s = startOfDay(eventStart(e));
                          const en = startOfDay(eventEnd(e));
                          const ds = startOfDay(d);
                          // For timed events, en may equal s for same-day events, so use <=
                          return ds >= s && ds <= en;
                        } catch {
                          return false;
                        }
                      }),
                  );
                  const multiDayTimed = timedInRow.filter(isMultiDay);
                  const allSpanning = [...allDayInRow, ...multiDayTimed];
                  const combinedLayout = computeSpanningLayout(
                    weekRow,
                    allSpanning,
                    eventTime,
                  );
                  const spanLayout = combinedLayout.filter(
                    (l) => !l.ev.start.dateTime,
                  );
                  const timedSpanLayout = combinedLayout.filter(
                    (l) => !!l.ev.start.dateTime,
                  );
                  const spanRows =
                    combinedLayout.length > 0
                      ? Math.max(...combinedLayout.map((l) => l.row)) + 1
                      : 0;
                  const ROW_H = 20;
                  const CELL_TOP = 36; // day number plus breathing room before all-day events
                  const spanAreaH = spanRows * ROW_H;
                  const singleDayTimedByDay = weekRow.map((day) =>
                    timedInRow.filter((event) => {
                      if (isMultiDay(event)) return false;
                      try {
                        return (
                          startOfDay(eventStart(event)).getTime() ===
                          startOfDay(day).getTime()
                        );
                      } catch {
                        return false;
                      }
                    }),
                  );
                  const weekMinHeight = calculateMonthWeekMinHeight(
                    spanRows,
                    singleDayTimedByDay.map((events) => events.length),
                  );

                  return (
                    <div
                      key={`week-${wi}`}
                      className="relative grid border-b border-border/50 flex-1"
                      style={{ minHeight: weekMinHeight, gridTemplateColumns: `repeat(${weekRow.length}, 1fr)` }}
                    >
                      {/* Day column guide lines — always visible */}
                      <div className="absolute inset-0 grid pointer-events-none" style={{ gridTemplateColumns: `repeat(${weekRow.length}, 1fr)` }}>
                        {weekRow.map((day) => (
                          <div
                            key={`col-${day.toISOString()}`}
                            className="border-r border-border/50 h-full"
                          />
                        ))}
                      </div>
                      {/* Separator + tone shift between spanning pills and timed events */}
                      <div
                        className="absolute left-0 right-0 top-0 pointer-events-none bg-surface/80"
                        style={{ height: CELL_TOP + spanAreaH }}
                      />
                      <div
                        className="absolute left-0 right-0 border-t border-border/50 pointer-events-none"
                        style={{ top: CELL_TOP + spanAreaH }}
                      />
                      {/* Day cells (background + day number + timed events) */}
                      {weekRow.map((day, dayIndex) => {
                        const inMonth = isSameMonth(day, cursor);
                        const timedDay = singleDayTimedByDay[dayIndex] ?? [];
                        return (
                          <div
                            key={day.toISOString()}
                            onClick={() =>
                              openCreate(format(day, "yyyy-MM-dd"))
                            }
                            className={`p-1.5 cursor-pointer transition-colors hover:bg-surface ${!inMonth ? "opacity-30" : ""}`}
                            style={{ paddingTop: CELL_TOP + spanAreaH + 4 }}
                          >
                            {/* Timed events (single-day only shown here) */}
                            <div className="flex flex-col gap-0.5">
                              {timedDay.map((ev) => (
                                <button
                                  key={ev.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedEvent(ev);
                                  }}
                                  className="w-full text-left text-xs rounded truncate font-medium transition-opacity hover:opacity-80"
                                  style={{
                                    ...EVENT_TEXT_INSET,
                                    paddingTop: 1,
                                    paddingBottom: 1,
                                    backgroundColor: eventBg(
                                      eventColor(ev),
                                      "timed",
                                    ),
                                    color: eventColor(ev),
                                    ...eventAccentStyle(
                                      eventColor(ev),
                                      true,
                                      2,
                                    ),
                                  }}
                                >
                                  <span className="opacity-70 mr-1">
                                    {format(eventStart(ev), timeFmtA)}
                                    {" - "}
                                    {format(eventEnd(ev), timeFmtA)}
                                  </span>{" "}
                                  {ev.summary}
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                      {/* Day number overlay */}
                      {weekRow.map((day, ci) => {
                        const today = isToday(day);
                        return (
                          <div
                            key={`dn-${day.toISOString()}`}
                            className="absolute pointer-events-none"
                            style={{
                              top: 6,
                              left: `calc(${(ci / weekRow.length) * 100}% + 6px)`,
                            }}
                          >
                            <div
                              className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-medium ${today ? "bg-accent text-text font-bold" : "text-text-2"}`}
                            >
                              {format(day, "d")}
                            </div>
                          </div>
                        );
                      })}
                      {/* All-day spanning pills */}
                      {spanLayout.map(({ ev, startCol, endCol, row }) => {
                        const color = eventColor(ev);
                        const colW = 100 / weekRow.length;
                        const startsInView =
                          startOfDay(eventStart(ev)) >= startOfDay(weekRow[0]);
                        const endsInView =
                          startOfDay(eventEnd(ev)) <=
                          startOfDay(addDays(weekRow[6], 1));
                        const outsideCurrentMonth = isMonthSegmentOutside(
                          weekRow,
                          startCol,
                          endCol,
                          cursor,
                        );
                        return (
                          <button
                            key={ev.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedEvent(ev);
                            }}
                            className="absolute text-left text-xs font-medium transition-opacity hover:opacity-80 truncate pointer-events-auto"
                            style={{
                              ...EVENT_TEXT_INSET,
                              top: CELL_TOP + row * ROW_H,
                              height: ROW_H - 2,
                              left: `calc(${startCol * colW}% + 2px)`,
                              right: `calc(${(7 - endCol) * colW}% + 2px)`,
                              backgroundColor: eventBg(color),
                              color,
                              ...eventAccentStyle(color, startsInView, 2),
                              borderRadius: `${startsInView ? 4 : 0}px ${endsInView ? 4 : 0}px ${endsInView ? 4 : 0}px ${startsInView ? 4 : 0}px`,
                              lineHeight: `${ROW_H - 2}px`,
                              opacity: outsideCurrentMonth ? 0.3 : 1,
                            }}
                          >
                            {ev.summary}
                          </button>
                        );
                      })}
                      {/* Multi-day timed spanning pills */}
                      {timedSpanLayout.map(({ ev, startCol, endCol, row }) => {
                        const color = eventColor(ev);
                        const colW = 100 / 7;
                        const startsInView =
                          startOfDay(eventStart(ev)) >= startOfDay(weekRow[0]);
                        const endsInView =
                          startOfDay(eventEnd(ev)) <=
                          startOfDay(addDays(weekRow[6], 1));
                        return (
                          <button
                            key={`mt-${ev.id}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedEvent(ev);
                            }}
                            className="absolute text-left text-xs font-medium transition-opacity hover:opacity-80 truncate pointer-events-auto"
                            style={{
                              ...EVENT_TEXT_INSET,
                              top: CELL_TOP + row * ROW_H,
                              height: ROW_H - 2,
                              left: `calc(${startCol * colW}% + 2px)`,
                              right: `calc(${(7 - endCol) * colW}% + 2px)`,
                              backgroundColor: eventBg(color, "timed"),
                              color,
                              ...eventAccentStyle(color, startsInView, 3),
                              borderRadius: `${startsInView ? 4 : 0}px ${endsInView ? 4 : 0}px ${endsInView ? 4 : 0}px ${startsInView ? 4 : 0}px`,
                              lineHeight: `${ROW_H - 2}px`,
                            }}
                          >
                            {startsInView ? (
                              <>
                                <span className="opacity-70 mr-1">
                                  {format(eventStart(ev), timeFmtA)}
                                  {" - "}
                                  {format(eventEnd(ev), timeFmtA)}
                                </span>
                                {" "}
                                {ev.summary}
                              </>
                            ) : (
                              ev.summary
                            )}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* Week view */
            <div className="flex-1 flex flex-col overflow-hidden">
              <div
                className="grid border-b border-border"
                style={{
                  gridTemplateColumns: `60px repeat(${weekDays.length}, 1fr)`,
                }}
              >
                <div />
                {weekDays.map((day) => (
                  <div
                    key={day.toISOString()}
                    className={`py-2.5 text-center border-l border-border ${isToday(day) ? "text-accent" : "text-text-2"}`}
                  >
                    <div className="text-xs uppercase tracking-wider font-semibold">
                      {format(day, "EEE")}
                    </div>
                    <div
                      className={`text-sm font-bold mx-auto mt-1 w-7 h-7 flex items-center justify-center rounded-full ${isToday(day) ? "bg-accent text-text" : ""}`}
                    >
                      {format(day, "d")}
                    </div>
                  </div>
                ))}
              </div>
              {(() => {
                const allDayEventsInWeek = cal.events.filter(
                  (e) =>
                    !e.start.dateTime &&
                    weekDays.some((d) => {
                      try {
                        const s = startOfDay(eventStart(e));
                        const en = startOfDay(eventEnd(e));
                        const ds = startOfDay(d);
                        return ds >= s && ds < en;
                      } catch {
                        return false;
                      }
                    }),
                );
                const multiDayTimedInWeek = cal.events.filter(
                  (e) =>
                    !!e.start.dateTime &&
                    isMultiDay(e) &&
                    weekDays.some((d) => {
                      try {
                        const s = startOfDay(eventStart(e));
                        const en = addDays(startOfDay(eventEnd(e)), 1);
                        const ds = startOfDay(d);
                        return ds >= s && ds < en;
                      } catch {
                        return false;
                      }
                    }),
                );
                const allSpanning = [
                  ...allDayEventsInWeek,
                  ...multiDayTimedInWeek,
                ];
                if (allSpanning.length === 0) return null;
                const layout = computeSpanningLayout(weekDays, allSpanning, eventTime);
                const numRows =
                  layout.length > 0
                    ? Math.max(...layout.map((l) => l.row)) + 1
                    : 1;
                const ROW_H = 22; // px per row
                const PAD = 6; // top+bottom padding
                return (
                  <div
                    className="border-b border-border bg-bg flex"
                    style={{ minHeight: ROW_H * numRows + PAD * 2 }}
                  >
                    <div
                      className="flex items-start justify-end pr-3 text-xs text-text-3 font-medium flex-shrink-0"
                      style={{ width: 60, paddingTop: PAD }}
                    >
                      all-day
                    </div>
                    {/* 7-column grid for borders */}
                    <div
                      className="flex-1 relative"
                      style={{ paddingTop: PAD, paddingBottom: PAD }}
                    >
                      {/* Column border lines */}
                      <div
                        className="absolute inset-0 grid pointer-events-none"
                        style={{ gridTemplateColumns: `repeat(${weekDays.length}, 1fr)` }}
                      >
                        {weekDays.map((d) => (
                          <div
                            key={d.toISOString()}
                            className="border-l border-border h-full"
                          />
                        ))}
                      </div>
                      {/* Spanning event pills */}
                      {layout.map(({ ev, startCol, endCol, row }) => {
                        const color = eventColor(ev);
                        const colW = 100 / weekDays.length;
                        const left = `calc(${startCol * colW}% + 2px)`;
                        const right = `calc(${(weekDays.length - endCol) * colW}% + 2px)`;
                        const top = PAD + row * ROW_H;
                        const startsInView =
                          startOfDay(eventStart(ev)) >= startOfDay(weekDays[0]);
                        const endsInView =
                          startOfDay(eventEnd(ev)) <=
                          startOfDay(addDays(weekDays[6], 1));
                        const isTimed = !!ev.start.dateTime;
                        return (
                          <button
                            key={ev.id}
                            onClick={() => setSelectedEvent(ev)}
                            className="absolute text-left text-xs font-medium transition-opacity hover:opacity-80 truncate"
                            style={{
                              ...EVENT_TEXT_INSET,
                              top,
                              height: ROW_H - 2,
                              left,
                              right,
                              backgroundColor: eventBg(
                                color,
                                isTimed ? "timed" : "allDay",
                              ),
                              color,
                              ...eventAccentStyle(color, startsInView, 2),
                              borderRadius: `${startsInView ? 4 : 0}px ${endsInView ? 4 : 0}px ${endsInView ? 4 : 0}px ${startsInView ? 4 : 0}px`,
                              lineHeight: `${ROW_H - 2}px`,
                            }}
                          >
                            {isTimed && startsInView ? (
                              <>
                                <span className="opacity-70 mr-1">
                                  {format(eventStart(ev), timeFmtA)}
                                  {" - "}
                                  {format(eventEnd(ev), timeFmtA)}
                                </span>
                                {" "}
                                {ev.summary}
                              </>
                            ) : (
                              ev.summary
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
              <div className="flex-1 overflow-y-auto">
                <div
                  className="grid"
                  style={{
                    gridTemplateColumns: `60px repeat(${weekDays.length}, 1fr)`,
                  }}
                >
                  <div className="flex flex-col">
                    {hours.map((h) => (
                      <div
                        key={h}
                        style={{ height: 56 }}
                        className="flex items-start justify-end pr-3 pt-1 text-xs text-text-3 font-medium"
                      >
                        {h === 0
                          ? ""
                          : format(new Date(2000, 0, 1, h), timeFmtA)}
                      </div>
                    ))}
                  </div>
                  {weekDays.map((day) => {
                    const dayEvents = eventsOnDay(day).filter(
                      (e) => {
                        if (!e.start.dateTime || isMultiDay(e)) return false;
                        const start = eventStart(e);
                        const end = eventEnd(e);
                        return end.getHours() >= startHour && start.getHours() < endHour;
                      },
                    );
                    const overlapLayout = computeOverlapLayout(dayEvents, eventTime);
                    const todayCol = isToday(day);
                    return (
                      <div
                        key={day.toISOString()}
                        className="border-l border-border relative"
                      >
                        {hours.map((h) => (
                          <div
                            key={h}
                            style={{ height: 56 }}
                            className="border-b border-border/30 hover:bg-surface/30 transition-colors cursor-pointer"
                            onClick={() => {
                              const time = `${h.toString().padStart(2, "0")}:00`;
                              openCreate(format(day, "yyyy-MM-dd"), time);
                            }}
                          />
                        ))}
                        {/* Current time indicator */}
                        {todayCol && nowMinutes >= startHour * 60 && nowMinutes < endHour * 60 && (
                          <div
                            className="absolute left-0 right-0 z-10 pointer-events-none"
                            style={{ top: nowTop }}
                          >
                            <div className="flex items-center h-2">
                              <div
                                className="w-2 h-2 rounded-full flex-shrink-0"
                                style={{
                                  backgroundColor: "var(--color-danger)",
                                }}
                              />
                              <div
                                className="flex-1 h-[2px]"
                                style={{
                                  backgroundColor: "var(--color-danger)",
                                }}
                              />
                            </div>
                          </div>
                        )}
                        {dayEvents.map((ev) => {
                          const start = eventStart(ev);
                          const end = eventEnd(ev);
                          const startMinutes =
                            start.getHours() * 60 + start.getMinutes();
                          const durationMinutes = Math.max(
                            30,
                            (end.getTime() - start.getTime()) / 60000,
                          );
                          const top = ((startMinutes - startHour * 60) / 60) * 56;
                          const height = (durationMinutes / 60) * 56;
                          const color = eventColor(ev);
                          const layout = overlapLayout.get(ev.id) ?? {
                            col: 0,
                            totalCols: 1,
                          };
                          const widthPct = 100 / layout.totalCols;
                          const leftPct = layout.col * widthPct;
                          // Slight inset so adjacent columns have a small gap
                          const GAP = 2; // px
                          return (
                            <button
                              key={ev.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedEvent(ev);
                              }}
                              className="absolute rounded-lg text-xs font-medium text-left overflow-hidden transition-opacity hover:opacity-80"
                              style={{
                                ...EVENT_BLOCK_INSET,
                                top,
                                height,
                                left: `calc(${leftPct}% + ${layout.col === 0 ? 2 : GAP}px)`,
                                right: `calc(${100 - leftPct - widthPct}% + ${layout.col === layout.totalCols - 1 ? 2 : GAP}px)`,
                                backgroundColor: eventBg(color, "timed"),
                                color,
                                ...eventAccentStyle(color),
                                borderTop: `1px solid ${color}60`,
                                borderBottom: `1px solid ${color}60`,
                              }}
                            >
                              <div className="truncate font-semibold leading-tight">
                                {ev.summary}
                              </div>
                              <div className="truncate opacity-70 text-xs">
                                {format(eventStart(ev), timeFmtA)} –{" "}
                                {format(eventEnd(ev), timeFmtA)}
                              </div>
                              {ev.location && height > 40 && (
                                <div className="truncate opacity-60 text-xs">
                                  {ev.location}
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Import panel */}
        {importPanelOpen && (
          <CalendarImportPanel
            tasks={importableTasks}
            notes={importableNotes}
            resize={importResize}
            onClose={() => setImportPanelOpen(false)}
            onImportTask={importFromTask}
            onImportNote={importFromNote}
          />
        )}
      </div>

      {/* Event detail panel */}
      {selectedEvent && (
        <EventDetailsPanel
          event={selectedEvent}
          color={eventColor(selectedEvent)}
          whenLabel={
            selectedEvent.start.dateTime
              ? `${format(eventStart(selectedEvent), `EEE, MMM d · ${timeFmtA}`)} – ${format(eventEnd(selectedEvent), timeFmtA)}`
              : isMultiDay(selectedEvent)
                ? `${format(eventStart(selectedEvent), "EEE, MMM d")} – ${format(addDays(eventEnd(selectedEvent), -1), "EEE, MMM d")}`
                : format(eventStart(selectedEvent), "EEEE, MMMM d")
          }
          calendarName={
            selectedEvent.calendarId && calendarList.length > 0
              ? (calendarList.find((c) => c.id === selectedEvent.calendarId)?.summary ?? selectedEvent.calendarId)
              : undefined
          }
          writable={isCalendarWritable(selectedEvent.calendarId)}
          onClose={() => setSelectedEvent(null)}
          onEdit={() => openEdit(selectedEvent)}
          onDelete={() => void handleDelete(selectedEvent)}
        />
      )}

      {/* Create event modal */}
      {createOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={closeCreateForm}
        >
          <div
            ref={createDialogRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label="Create calendar event"
            className="bg-surface border border-border-2 rounded-xl w-full max-w-[500px] shadow-2xl overflow-hidden"
            style={{
              animation: "slideUpLocal 0.18s ease-out both",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-accent/15 border border-accent/25 rounded-lg flex items-center justify-center">
                  <CalIcon size={15} className="text-accent" />
                </div>
                <div>
                  <span className="text-sm font-semibold text-text block leading-tight">
                    New Event
                  </span>
                  <span className="text-xs text-text-3">
                    {formAllDay && formEndDate && formEndDate > createDate
                      ? `${format(new Date(createDate + "T00:00"), "MMM d")} – ${format(new Date(formEndDate + "T00:00"), "MMM d")}`
                      : format(new Date(createDate + "T00:00"), "EEEE, MMMM d")}
                  </span>
                </div>
              </div>
              <button
                aria-label="Close new event form"
                onClick={closeCreateForm}
                className="text-text-3 hover:text-text p-1.5 rounded-lg hover:bg-surface-2 transition-colors"
              >
                <X size={14} />
              </button>
            </div>
            <div className="flex flex-col gap-4 px-6 py-5">
              <EventFormFields
                title={formTitle}
                setTitle={setFormTitle}
                allDay={formAllDay}
                onToggleAllDay={toggleFormAllDay}
                startDate={createDate}
                setStartDate={setCreateDate}
                endDate={formEndDate}
                setEndDate={setFormEndDate}
                start={formStart}
                setStart={setFormStart}
                end={formEnd}
                setEnd={setFormEnd}
                location={formLocation}
                setLocation={setFormLocation}
                description={formDesc}
                setDescription={setFormDesc}
                errors={formErrors}
                setErrors={setFormErrors}
                calendars={calendarList}
                calendarId={formCalendarId}
                setCalendarId={setFormCalendarId}
                saving={saving}
                titlePlaceholder="Add a title..."
                onSubmit={handleCreate}
              />

              {/* Actions */}
              <div className="flex gap-3 pt-1">
                <button
                  onClick={closeCreateForm}
                  style={{ padding: "2px 12px" }}
                  className="flex-1 text-sm font-medium text-text-2 border border-border-2 rounded-lg hover:bg-surface-2 hover:text-text transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={saving}
                  style={{ padding: "2px 12px" }}
                  className="flex-1 text-sm font-semibold text-white bg-accent rounded-lg hover:bg-accent-hover transition-all disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  {saving ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Plus size={14} />
                  )}
                  {saving ? "Saving..." : "Create event"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit event modal */}
      {editOpen && editingEvent && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => {
            setEditOpen(false);
            setEditingEvent(null);
          }}
        >
          <div
            ref={editDialogRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label="Edit calendar event"
            className="bg-surface border border-border-2 rounded-xl w-full max-w-[500px] shadow-2xl overflow-hidden"
            style={{ animation: "slideUpLocal 0.18s ease-out both" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div className="flex items-center gap-3">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{
                    backgroundColor: eventColor(editingEvent) + "20",
                    border: `1px solid ${eventColor(editingEvent)}40`,
                  }}
                >
                  <CalIcon
                    size={15}
                    style={{ color: eventColor(editingEvent) }}
                  />
                </div>
                <span className="text-sm font-semibold text-text">
                  Edit Event
                </span>
              </div>
              <button
                aria-label="Close edit event form"
                onClick={() => {
                  setEditOpen(false);
                  setEditingEvent(null);
                }}
                className="text-text-3 hover:text-text p-1.5 rounded-lg hover:bg-surface-2 transition-colors"
              >
                <X size={14} />
              </button>
            </div>
            <div className="flex flex-col gap-4 px-6 py-5">
              <EventFormFields
                title={formTitle}
                setTitle={setFormTitle}
                allDay={formAllDay}
                onToggleAllDay={toggleFormAllDay}
                startDate={createDate}
                setStartDate={setCreateDate}
                endDate={formEndDate}
                setEndDate={setFormEndDate}
                start={formStart}
                setStart={setFormStart}
                end={formEnd}
                setEnd={setFormEnd}
                location={formLocation}
                setLocation={setFormLocation}
                description={formDesc}
                setDescription={setFormDesc}
                errors={formErrors}
                setErrors={setFormErrors}
                calendars={calendarList}
                calendarId={formCalendarId}
                setCalendarId={setFormCalendarId}
                saving={saving}
                lockedCalendarId={editingEvent.calendarId}
                titlePlaceholder="Event title..."
                onSubmit={handleUpdate}
              />

              {/* Actions */}
              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => {
                    setEditOpen(false);
                    setEditingEvent(null);
                  }}
                  style={{ padding: "2px 12px" }}
                  className="flex-1 text-sm font-medium text-text-2 border border-border-2 rounded-lg hover:bg-surface-2 hover:text-text transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpdate}
                  disabled={saving}
                  style={{ padding: "2px 12px" }}
                  className="flex-1 text-sm font-semibold text-white bg-accent rounded-lg hover:bg-accent-hover transition-all disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  {saving ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <CalIcon size={14} />
                  )}
                  {saving ? "Saving..." : "Save changes"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
