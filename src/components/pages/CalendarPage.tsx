"use client";

import { useState, useEffect, useRef } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  Loader2,
  Clock,
  MapPin,
  Calendar as CalIcon,
  Download,
  FileText,
  CheckSquare,
  AlignLeft,
  RefreshCw,
  ChevronDown,
} from "lucide-react";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
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
  isWithinInterval,
} from "date-fns";
import { useApp } from "@/context/AppContext";
import { useResizable } from "@/lib/useResizable";
import { useCalendar, type CalendarEvent } from "@/hooks/useCalendar";
import type { GoogleCalendarList, CalendarEventDateTime } from "@/types";

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

function eventStart(event: CalendarEvent): Date {
  return parseISO(event.start.dateTime ?? event.start.date ?? "");
}
function eventEnd(event: CalendarEvent): Date {
  return parseISO(event.end.dateTime ?? event.end.date ?? "");
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
  const cal = useCalendar();

  const weekStartsOn = (state.pageSettings.calendar.weekStartsOn ?? 0) as 0 | 1;
  const use24h = state.pageSettings.calendar.use24HourTime ?? false;
  const timeFmtA = use24h ? "H:mm" : "h:mm a";

  const [view, setView] = useState<ViewMode>(
    state.pageSettings.calendar.defaultView,
  );
  const [cursor, setCursor] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(
    null,
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [createDate, setCreateDate] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [importPanelOpen, setImportPanelOpen] = useState(false);

  // Calendar list for coloring & selector
  const [calendarList, setCalendarList] = useState<GoogleCalendarList[]>([]);
  const calColorMap = useRef<Map<string, string>>(new Map());

  // Build a stable color map from the fetched calendar list
  useEffect(() => {
    const map = new Map<string, string>();
    calendarList.forEach((cal, idx) => {
      map.set(
        cal.id,
        cal.backgroundColor ?? CALENDAR_PALETTE[idx % CALENDAR_PALETTE.length],
      );
    });
    calColorMap.current = map;
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
    setFormCalendarId(
      resolveCalendarId(
        state.pageSettings.calendar.defaultCalendarId || "primary",
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calendarList]);

  function eventColor(event: CalendarEvent): string {
    if (event.colorId && EVENT_COLORS[event.colorId]) {
      return EVENT_COLORS[event.colorId];
    }
    if (event.calendarId && calColorMap.current.has(event.calendarId)) {
      return calColorMap.current.get(event.calendarId)!;
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
    state.pageSettings.calendar.defaultCalendarId || "primary",
  );
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const prefillEmailContextRef = useRef<string | null>(null);

  // Current time line
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!state.calendarPrefill) return;
    const pf = state.calendarPrefill;
    const dateStr = parseDateHint(pf.dateHint);
    setCreateDate(dateStr);
    setFormTitle(pf.title);
    setFormDesc(pf.description ?? "");
    prefillEmailContextRef.current = pf.emailContext ?? null;
    setFormErrors({});

    // If endDateHint is provided and differs from start → all-day multi-day
    if (pf.endDateHint && !pf.startHint) {
      const endDateStr = parseDateHint(pf.endDateHint);
      setFormAllDay(true);
      setFormEndDate(endDateStr !== dateStr ? endDateStr : "");
      setFormStart(`${dateStr}T09:00`);
      setFormEnd(`${dateStr}T10:00`);
    } else if (pf.startHint) {
      try {
        const startDt = new Date(pf.startHint);
        if (!isNaN(startDt.getTime())) {
          setFormStart(format(startDt, "yyyy-MM-dd'T'HH:mm"));
          setFormAllDay(false);
        } else {
          setFormStart(`${dateStr}T09:00`);
          setFormAllDay(false);
        }
      } catch {
        setFormStart(`${dateStr}T09:00`);
        setFormAllDay(false);
      }
      setFormEndDate("");
      if (pf.endHint) {
        try {
          const endDt = new Date(pf.endHint);
          if (!isNaN(endDt.getTime())) {
            setFormEnd(format(endDt, "yyyy-MM-dd'T'HH:mm"));
          } else {
            setFormEnd(`${dateStr}T10:00`);
          }
        } catch {
          setFormEnd(`${dateStr}T10:00`);
        }
      } else {
        setFormEnd(`${dateStr}T10:00`);
      }
    } else {
      setFormStart(`${dateStr}T09:00`);
      setFormEnd(`${dateStr}T10:00`);
      setFormAllDay(false);
      setFormEndDate("");
    }
    setFormLocation("");
    setFormCalendarId(
      resolveCalendarId(
        state.pageSettings.calendar.defaultCalendarId || "primary",
      ),
    );
    setCreateOpen(true);
    dispatch({ type: "CLEAR_CALENDAR_PREFILL" });
  }, [state.calendarPrefill, dispatch]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const timeMin = startOfMonth(subMonths(cursor, 1)).toISOString();
    const timeMax = endOfMonth(addMonths(cursor, 1)).toISOString();
    cal.fetchEvents(timeMin, timeMax);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor]);

  useEffect(() => {
    dispatch({ type: "SET_CALENDAR_EVENTS", events: cal.events });
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
        state.pageSettings.calendar.defaultCalendarId || "primary",
      ),
    );
    setCreateOpen(true);
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
      state.pageSettings.calendar.timezone ||
      Intl.DateTimeFormat().resolvedOptions().timeZone;
    // Append email context to description if present and description is empty
    const emailCtx = prefillEmailContextRef.current;
    const finalDesc = formDesc
      ? formDesc
      : emailCtx
        ? `[From email]\n\n${emailCtx.slice(0, 2000)}`
        : undefined;
    prefillEmailContextRef.current = null;
    // For all-day events Google Calendar end date is exclusive, so add 1 day
    const allDayEnd =
      formEndDate && formEndDate >= createDate
        ? format(addDays(parseISO(formEndDate), 1), "yyyy-MM-dd")
        : format(addDays(parseISO(createDate), 1), "yyyy-MM-dd");
    await cal.createEvent({
      summary: formTitle,
      description: finalDesc || undefined,
      location: formLocation || undefined,
      calendarId: formCalendarId || "primary",
      start: formAllDay
        ? { date: createDate }
        : { dateTime: new Date(formStart).toISOString(), timeZone: tz },
      end: formAllDay
        ? { date: allDayEnd }
        : { dateTime: new Date(formEnd).toISOString(), timeZone: tz },
    });
    setSaving(false);
    setCreateOpen(false);
  }

  async function handleDelete(id: string) {
    await cal.deleteEvent(id);
    setSelectedEvent(null);
  }

  function openEdit(ev: CalendarEvent) {
    setEditingEvent(ev);
    setFormTitle(ev.summary ?? "");
    setFormDesc(ev.description ?? "");
    setFormLocation(ev.location ?? "");
    setFormCalendarId(
      ev.calendarId ??
        resolveCalendarId(
          state.pageSettings.calendar.defaultCalendarId || "primary",
        ),
    );
    setFormErrors({});
    if (ev.start.dateTime) {
      setFormAllDay(false);
      setFormStart(format(parseISO(ev.start.dateTime), "yyyy-MM-dd'T'HH:mm"));
      setFormEnd(
        format(
          parseISO(ev.end.dateTime ?? ev.start.dateTime),
          "yyyy-MM-dd'T'HH:mm",
        ),
      );
      setCreateDate(format(parseISO(ev.start.dateTime), "yyyy-MM-dd"));
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
    setFormErrors({});
    setSaving(true);
    const tz =
      state.pageSettings.calendar.timezone ||
      Intl.DateTimeFormat().resolvedOptions().timeZone;
    const allDayEnd =
      formEndDate && formEndDate >= createDate
        ? format(addDays(parseISO(formEndDate), 1), "yyyy-MM-dd")
        : format(addDays(parseISO(createDate), 1), "yyyy-MM-dd");
    const patch: Partial<CalendarEvent> = {
      summary: formTitle,
      description: formDesc || undefined,
      location: formLocation || undefined,
      start: (formAllDay
        ? { date: createDate }
        : {
            dateTime: new Date(formStart).toISOString(),
            timeZone: tz,
          }) as CalendarEventDateTime,
      end: (formAllDay
        ? { date: allDayEnd }
        : {
            dateTime: new Date(formEnd).toISOString(),
            timeZone: tz,
          }) as CalendarEventDateTime,
    };
    const updated = await cal.updateEvent(editingEvent.id, patch);
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
        state.pageSettings.calendar.defaultCalendarId || "primary",
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
        state.pageSettings.calendar.defaultCalendarId || "primary",
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
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });
  const hours = Array.from({ length: 24 }, (_, i) => i);

  // Day labels in correct order based on weekStartsOn
  const dayLabels =
    weekStartsOn === 1
      ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
      : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const nowTop = (nowMinutes / 60) * 56;

  // Compute overlap layout for a set of timed events on a single day.
  // Returns a map from event id → { col, totalCols }.
  function computeOverlapLayout(
    events: CalendarEvent[],
  ): Map<string, { col: number; totalCols: number }> {
    // Sort by start time, then by duration descending
    const sorted = [...events].sort((a, b) => {
      const diff = eventStart(a).getTime() - eventStart(b).getTime();
      if (diff !== 0) return diff;
      return (
        eventEnd(b).getTime() -
        eventStart(b).getTime() -
        (eventEnd(a).getTime() - eventStart(a).getTime())
      );
    });

    // Each slot tracks the end-time of the last event placed in that column
    const cols: number[] = []; // cols[i] = end-time (ms) of last event in column i
    const layout = new Map<string, { col: number; totalCols: number }>();

    for (const ev of sorted) {
      const start = eventStart(ev).getTime();
      const end = eventEnd(ev).getTime();

      // Find the first column whose last event has already ended
      let placed = -1;
      for (let i = 0; i < cols.length; i++) {
        if (cols[i] <= start) {
          placed = i;
          break;
        }
      }
      if (placed === -1) {
        placed = cols.length;
        cols.push(0);
      }
      cols[placed] = end;
      layout.set(ev.id, { col: placed, totalCols: 0 }); // totalCols filled below
    }

    const totalCols = cols.length;

    // Second pass: for each event, totalCols = number of cols that actually
    // overlap with it (to avoid giving an event unnecessarily narrow width).
    for (const ev of sorted) {
      const entry = layout.get(ev.id)!;
      const start = eventStart(ev).getTime();
      const end = eventEnd(ev).getTime();

      // Count how many columns contain an event that overlaps this one
      let maxCol = entry.col;
      for (const other of sorted) {
        if (other.id === ev.id) continue;
        const oStart = eventStart(other).getTime();
        const oEnd = eventEnd(other).getTime();
        if (oStart < end && oEnd > start) {
          const otherEntry = layout.get(other.id)!;
          if (otherEntry.col > maxCol) maxCol = otherEntry.col;
        }
      }
      entry.totalCols = maxCol + 1 < totalCols ? maxCol + 1 : totalCols;
    }

    return layout;
  }

  // Compute layout rows for all-day/multi-day events across a set of days.
  // Returns: array of { ev, startCol, endCol (exclusive), row }
  function computeAllDayLayout(
    days: Date[],
    events: CalendarEvent[],
  ): Array<{
    ev: CalendarEvent;
    startCol: number;
    endCol: number;
    row: number;
  }> {
    const result: Array<{
      ev: CalendarEvent;
      startCol: number;
      endCol: number;
      row: number;
    }> = [];
    // Deduplicate: only process each event once
    const seen = new Set<string>();
    // Sort by start time, then by duration descending so longer events get row priority
    const sorted = [...events].sort((a, b) => {
      const startDiff = eventStart(a).getTime() - eventStart(b).getTime();
      if (startDiff !== 0) return startDiff;
      return eventEnd(b).getTime() - eventEnd(a).getTime();
    });
    const rows: number[][] = []; // rows[r] = array of endCol values of events placed in that row

    for (const ev of sorted) {
      if (seen.has(ev.id)) continue;
      seen.add(ev.id);

      const evStart = startOfDay(eventStart(ev));
      // For timed events, end is inclusive so add 1 day to make it exclusive like all-day events
      const evEnd = ev.start.dateTime
        ? addDays(startOfDay(eventEnd(ev)), 1)
        : startOfDay(eventEnd(ev));

      // Find which columns this event occupies in this week
      let startCol = days.findIndex((d) => startOfDay(d) >= evStart);
      if (startCol === -1) startCol = 0;

      // endCol: first day index where day >= evEnd (exclusive)
      let endCol = days.findIndex((d) => startOfDay(d) >= evEnd);
      if (endCol === -1) endCol = days.length;
      endCol = Math.min(endCol, days.length);
      // Skip events that don't actually occupy any column in this week
      if (endCol <= startCol) continue;

      // Find a row where this event fits (no overlap in [startCol, endCol))
      let row = 0;
      while (true) {
        if (!rows[row]) {
          rows[row] = [];
          break;
        }
        // Check if any event in this row overlaps [startCol, endCol)
        const conflicts = result.filter(
          (r) => r.row === row && r.startCol < endCol && r.endCol > startCol,
        );
        if (conflicts.length === 0) break;
        row++;
      }
      if (!rows[row]) rows[row] = [];

      result.push({ ev, startCol, endCol, row });
    }
    return result;
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden bg-bg">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-bg flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center border border-border-2 rounded-lg overflow-hidden">
            <button
              onClick={() => navigate(-1)}
              className="w-8 h-8 flex items-center justify-center text-text-2 hover:text-text hover:bg-surface transition-colors"
            >
              <ChevronLeft size={15} />
            </button>
            <button
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
              <div className="grid grid-cols-7 border-b border-border">
                {dayLabels.map((d) => (
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
                  const weekRow = days.slice(wi * 7, wi * 7 + 7);
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
                  const combinedLayout = computeAllDayLayout(
                    weekRow,
                    allSpanning,
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
                  const CELL_TOP = 28; // space for day number
                  const spanAreaH = spanRows * ROW_H;

                  return (
                    <div
                      key={`week-${wi}`}
                      className="relative grid grid-cols-7 border-b border-border/50 flex-1 min-h-[120px]"
                    >
                      {/* Separator + tone shift between spanning pills and timed events */}
                      {spanRows > 0 && (
                        <>
                          <div
                            className="absolute left-0 right-0 top-0 pointer-events-none bg-surface/80"
                            style={{ height: CELL_TOP + spanAreaH }}
                          />
                          <div
                            className="absolute left-0 right-0 border-t border-border/50 pointer-events-none"
                            style={{ top: CELL_TOP + spanAreaH }}
                          />
                        </>
                      )}
                      {/* Day cells (background + day number + timed events) */}
                      {weekRow.map((day) => {
                        const inMonth = isSameMonth(day, cursor);
                        const today = isToday(day);
                        const timedDay = timedInRow.filter((e) => {
                          try {
                            const s = startOfDay(eventStart(e));
                            const en = startOfDay(eventEnd(e));
                            const ds = startOfDay(day);
                            return ds >= s && ds <= en;
                          } catch {
                            return false;
                          }
                        });
                        return (
                          <div
                            key={day.toISOString()}
                            onClick={() =>
                              openCreate(format(day, "yyyy-MM-dd"))
                            }
                            className={`border-r border-border/50 p-1.5 cursor-pointer transition-colors hover:bg-surface ${!inMonth ? "opacity-30" : ""}`}
                            style={{ paddingTop: CELL_TOP + spanAreaH + 4 }}
                          >
                            {/* Timed events (single-day only shown here) */}
                            <div className="flex flex-col gap-0.5">
                              {timedDay
                                .filter((e) => !isMultiDay(e))
                                .map((ev) => (
                                  <button
                                    key={ev.id}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedEvent(ev);
                                    }}
                                    className="w-full text-left text-xs px-1.5 py-0.5 rounded truncate font-medium transition-opacity hover:opacity-80"
                                    style={{
                                      backgroundColor: eventColor(ev) + "28",
                                      color: eventColor(ev),
                                      borderLeft: `2px solid ${eventColor(ev)}`,
                                    }}
                                  >
                                    <span className="opacity-70 mr-1">
                                      {format(eventStart(ev), timeFmtA)}
                                      {"–"}
                                      {format(eventEnd(ev), timeFmtA)}
                                    </span>
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
                              left: `calc(${(ci / 7) * 100}% + 6px)`,
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
                        const colW = 100 / 7;
                        const startsInView =
                          startOfDay(eventStart(ev)) >= startOfDay(weekRow[0]);
                        const endsInView =
                          startOfDay(eventEnd(ev)) <=
                          startOfDay(addDays(weekRow[6], 1));
                        return (
                          <button
                            key={ev.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedEvent(ev);
                            }}
                            className="absolute text-left text-xs px-1.5 font-medium transition-opacity hover:opacity-80 truncate pointer-events-auto"
                            style={{
                              top: CELL_TOP + row * ROW_H,
                              height: ROW_H - 2,
                              left: `calc(${startCol * colW}% + 2px)`,
                              right: `calc(${(7 - endCol) * colW}% + 2px)`,
                              backgroundColor: color + "28",
                              color,
                              borderLeft: startsInView
                                ? `2px solid ${color}`
                                : "none",
                              borderRadius: `${startsInView ? 4 : 0}px ${endsInView ? 4 : 0}px ${endsInView ? 4 : 0}px ${startsInView ? 4 : 0}px`,
                              lineHeight: `${ROW_H - 2}px`,
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
                            className="absolute text-left text-xs px-1.5 font-medium transition-opacity hover:opacity-80 truncate pointer-events-auto"
                            style={{
                              top: CELL_TOP + row * ROW_H,
                              height: ROW_H - 2,
                              left: `calc(${startCol * colW}% + 2px)`,
                              right: `calc(${(7 - endCol) * colW}% + 2px)`,
                              backgroundColor: color + "38",
                              color,
                              borderLeft: startsInView
                                ? `3px solid ${color}`
                                : "none",
                              borderRadius: `${startsInView ? 4 : 0}px ${endsInView ? 4 : 0}px ${endsInView ? 4 : 0}px ${startsInView ? 4 : 0}px`,
                              lineHeight: `${ROW_H - 2}px`,
                            }}
                          >
                            {startsInView ? (
                              <>
                                <span className="opacity-70 mr-1">
                                  {format(eventStart(ev), timeFmtA)}
                                  {"–"}
                                  {format(eventEnd(ev), timeFmtA)}
                                </span>
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
                  gridTemplateColumns: "60px repeat(7, 1fr)",
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
                const layout = computeAllDayLayout(weekDays, allSpanning);
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
                        style={{ gridTemplateColumns: "repeat(7, 1fr)" }}
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
                        const colW = 100 / 7;
                        const left = `calc(${startCol * colW}% + 2px)`;
                        const right = `calc(${(7 - endCol) * colW}% + 2px)`;
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
                            className="absolute text-left text-xs px-1.5 font-medium transition-opacity hover:opacity-80 truncate"
                            style={{
                              top,
                              height: ROW_H - 2,
                              left,
                              right,
                              backgroundColor: color + (isTimed ? "38" : "28"),
                              color,
                              borderLeft: startsInView
                                ? `2px solid ${color}`
                                : "none",
                              borderRight: endsInView ? undefined : "none",
                              borderRadius: `${startsInView ? 4 : 0}px ${endsInView ? 4 : 0}px ${endsInView ? 4 : 0}px ${startsInView ? 4 : 0}px`,
                              lineHeight: `${ROW_H - 2}px`,
                            }}
                          >
                            {isTimed && startsInView ? (
                              <>
                                <span className="opacity-70 mr-1">
                                  {format(eventStart(ev), timeFmtA)}
                                  {"–"}
                                  {format(eventEnd(ev), timeFmtA)}
                                </span>
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
                    gridTemplateColumns: "60px repeat(7, 1fr)",
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
                      (e) => e.start.dateTime && !isMultiDay(e),
                    );
                    const overlapLayout = computeOverlapLayout(dayEvents);
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
                        {todayCol && (
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
                          const top = (startMinutes / 60) * 56;
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
                              className="absolute rounded-lg px-2 text-xs font-medium text-left overflow-hidden transition-opacity hover:opacity-80"
                              style={{
                                top,
                                height,
                                left: `calc(${leftPct}% + ${layout.col === 0 ? 2 : GAP}px)`,
                                right: `calc(${100 - leftPct - widthPct}% + ${layout.col === layout.totalCols - 1 ? 2 : GAP}px)`,
                                backgroundColor: color + "38",
                                color,
                                borderLeft: `3px solid ${color}`,
                                borderTop: `1px solid ${color}60`,
                                borderBottom: `1px solid ${color}60`,
                                paddingTop: 3,
                                paddingBottom: 3,
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
          <aside
            className="flex-shrink-0 flex flex-col border-l border-border bg-bg overflow-hidden relative"
            style={{
              width: importResize.width,
              animation: "slideInRight 200ms ease-out",
            }}
          >
            <div
              className="resize-handle"
              style={{ left: 0 }}
              onMouseDown={importResize.onMouseDown}
            />
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Download size={13} className="text-accent" />
                <span className="text-xs font-semibold text-text">
                  Import to Calendar
                </span>
              </div>
              <button
                onClick={() => setImportPanelOpen(false)}
                className="text-text-3 hover:text-text p-1 rounded-lg hover:bg-surface-2 transition-colors"
              >
                <X size={14} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {state.tasks.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 px-4 py-2 text-xs uppercase tracking-widest text-text-3 font-semibold border-b border-border/50 sticky top-0 bg-bg">
                    <CheckSquare size={12} /> Tasks
                  </div>
                  {state.tasks
                    .filter((t) => t.status !== "done")
                    .map((task) => (
                      <button
                        key={task.id}
                        onClick={() => importFromTask(task)}
                        className="w-full flex flex-col gap-0.5 px-4 py-2.5 text-left border-b border-border/30 hover:bg-surface transition-colors"
                      >
                        <span className="text-xs text-text truncate">
                          {task.title}
                        </span>
                        {task.dueDate && (
                          <span className="text-xs text-text-3 flex items-center gap-1">
                            <Clock size={11} />
                            {format(new Date(task.dueDate), "MMM d")}
                          </span>
                        )}
                        <span
                          className={`text-xs font-medium ${task.priority === "high" ? "text-danger" : task.priority === "medium" ? "text-warning" : "text-text-3"}`}
                        >
                          {task.priority}
                        </span>
                      </button>
                    ))}
                </div>
              )}
              {state.notes.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 px-4 py-2 text-xs uppercase tracking-widest text-text-3 font-semibold border-b border-border/50 sticky top-0 bg-bg">
                    <FileText size={12} /> Notes
                  </div>
                  {state.notes.map((note) => (
                    <button
                      key={note.id}
                      onClick={() => importFromNote(note)}
                      className="w-full flex flex-col gap-0.5 px-4 py-2.5 text-left border-b border-border/30 hover:bg-surface transition-colors"
                    >
                      <span className="text-xs text-text truncate">
                        {note.title}
                      </span>
                      <span className="text-xs text-text-3 truncate">
                        {note.content.replace(/[#*_`\n]/g, " ").slice(0, 50)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {state.tasks.length === 0 && state.notes.length === 0 && (
                <div className="flex flex-col items-center justify-center gap-3 py-10 px-4 text-center">
                  <Download size={20} className="text-text-3" />
                  <p className="text-xs text-text-3 leading-relaxed">
                    No tasks or notes loaded yet.
                    <br />
                    Open some in Tasks or Notes first.
                  </p>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>

      {/* Event detail panel */}
      {selectedEvent && (
        <div
          className="absolute top-0 right-0 bottom-0 w-80 bg-bg border-l border-border flex flex-col z-40 shadow-2xl"
          style={{ animation: "slideInRight 200ms ease-out" }}
        >
          <div
            className="h-1 flex-shrink-0"
            style={{ backgroundColor: eventColor(selectedEvent) }}
          />
          <div className="flex items-start justify-between px-5 py-4 border-b border-border">
            <div className="flex-1 min-w-0 pr-3">
              <span className="text-sm font-semibold text-text leading-snug block">
                {selectedEvent.summary}
              </span>
            </div>
            <button
              onClick={() => setSelectedEvent(null)}
              className="text-text-3 hover:text-text p-1.5 rounded-lg hover:bg-surface transition-colors flex-shrink-0"
            >
              <X size={14} />
            </button>
          </div>
          <div className="flex flex-col gap-4 px-5 py-4 flex-1 overflow-y-auto">
            <div className="flex items-start gap-3 text-sm text-text-2">
              <Clock size={14} className="flex-shrink-0 mt-0.5 text-text-3" />
              <div className="leading-relaxed">
                {selectedEvent.start.dateTime
                  ? `${format(eventStart(selectedEvent), `EEE, MMM d · ${timeFmtA}`)} – ${format(eventEnd(selectedEvent), timeFmtA)}`
                  : isMultiDay(selectedEvent)
                    ? `${format(eventStart(selectedEvent), "EEE, MMM d")} – ${format(addDays(eventEnd(selectedEvent), -1), "EEE, MMM d")}`
                    : format(eventStart(selectedEvent), "EEEE, MMMM d")}
              </div>
            </div>
            {selectedEvent.location && (
              <div className="flex items-start gap-3 text-sm text-text-2">
                <MapPin
                  size={14}
                  className="flex-shrink-0 mt-0.5 text-text-3"
                />
                <span className="leading-relaxed">
                  {selectedEvent.location}
                </span>
              </div>
            )}
            {selectedEvent.description && (
              <div className="flex items-start gap-3 text-sm text-text-2">
                <AlignLeft
                  size={14}
                  className="flex-shrink-0 mt-0.5 text-text-3"
                />
                <span className="leading-relaxed">
                  {selectedEvent.description}
                </span>
              </div>
            )}
            {selectedEvent.calendarId && calendarList.length > 0 && (
              <div className="flex items-start gap-3 text-sm text-text-2">
                <CalIcon
                  size={14}
                  className="flex-shrink-0 mt-0.5 text-text-3"
                />
                <span className="leading-relaxed">
                  {calendarList.find((c) => c.id === selectedEvent.calendarId)
                    ?.summary ?? selectedEvent.calendarId}
                </span>
              </div>
            )}
          </div>
          <div className="px-5 pb-5 flex flex-col gap-2">
            <button
              onClick={() => openEdit(selectedEvent)}
              style={{ padding: "2px 12px" }}
              className="w-full text-sm font-medium text-text-2 border border-border-2 rounded-lg hover:bg-surface-2 hover:text-text transition-all"
            >
              Edit event
            </button>
            <button
              onClick={() => handleDelete(selectedEvent.id)}
              style={{ padding: "2px 12px" }}
              className="w-full text-sm font-medium text-danger border border-danger/25 rounded-lg hover:bg-danger/8 hover:border-danger/50 transition-all"
            >
              Delete event
            </button>
          </div>
        </div>
      )}

      {/* Create event modal */}
      {createOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setCreateOpen(false)}
        >
          <div
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
                onClick={() => setCreateOpen(false)}
                className="text-text-3 hover:text-text p-1.5 rounded-lg hover:bg-surface-2 transition-colors"
              >
                <X size={14} />
              </button>
            </div>
            <div className="flex flex-col gap-4 px-6 py-5">
              {/* Title */}
              <div className="flex flex-col gap-1">
                <input
                  autoFocus
                  className={`w-full bg-transparent border-b px-0 py-2 text-base font-semibold text-text outline-none placeholder:text-text-3 transition-colors ${formErrors.title ? "border-danger" : "border-border-2 focus:border-accent"}`}
                  placeholder="Add a title..."
                  value={formTitle}
                  onChange={(e) => {
                    setFormTitle(e.target.value);
                    if (formErrors.title)
                      setFormErrors((p) => ({ ...p, title: "" }));
                  }}
                  onKeyDown={(e) =>
                    e.key === "Enter" && !saving && handleCreate()
                  }
                />
                {formErrors.title && (
                  <span className="text-xs text-danger">
                    {formErrors.title}
                  </span>
                )}
              </div>

              {/* All day toggle */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-text-2">All day</span>
                <button
                  type="button"
                  onClick={() => setFormAllDay((v) => !v)}
                  className={`relative rounded-full transition-colors ${formAllDay ? "bg-accent" : "bg-border-2"}`}
                  style={{ height: 22, width: 40 }}
                >
                  <div
                    className={`absolute top-[3px] w-4 h-4 rounded-full bg-white shadow transition-transform ${formAllDay ? "translate-x-[19px]" : "translate-x-[3px]"}`}
                  />
                </button>
              </div>

              {/* Date/time */}
              {formAllDay ? (
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-text-3 uppercase tracking-widest">
                      Start date
                    </label>
                    <input
                      type="date"
                      value={createDate}
                      onChange={(e) => {
                        setCreateDate(e.target.value);
                        if (formErrors.date)
                          setFormErrors((p) => ({ ...p, date: "" }));
                      }}
                      className={`w-full bg-bg border rounded-lg px-3 py-2 text-sm text-text outline-none transition-colors ${formErrors.date ? "border-danger" : "border-border-2 focus:border-accent"}`}
                    />
                    {formErrors.date && (
                      <span className="text-xs text-danger">
                        {formErrors.date}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-text-3 uppercase tracking-widest">
                      End date
                    </label>
                    <input
                      type="date"
                      value={formEndDate || createDate}
                      min={createDate}
                      onChange={(e) => {
                        setFormEndDate(e.target.value);
                        if (formErrors.endDate)
                          setFormErrors((p) => ({ ...p, endDate: "" }));
                      }}
                      className={`w-full bg-bg border rounded-lg px-3 py-2 text-sm text-text outline-none transition-colors ${formErrors.endDate ? "border-danger" : "border-border-2 focus:border-accent"}`}
                    />
                    {formErrors.endDate && (
                      <span className="text-xs text-danger">
                        {formErrors.endDate}
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-text-3 uppercase tracking-widest">
                      Start
                    </label>
                    <input
                      type="datetime-local"
                      value={formStart}
                      onChange={(e) => {
                        setFormStart(e.target.value);
                        if (formErrors.start)
                          setFormErrors((p) => ({ ...p, start: "" }));
                      }}
                      className={`w-full bg-bg border rounded-lg px-3 py-2 text-sm text-text outline-none transition-colors ${formErrors.start ? "border-danger" : "border-border-2 focus:border-accent"}`}
                    />
                    {formErrors.start && (
                      <span className="text-xs text-danger">
                        {formErrors.start}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-text-3 uppercase tracking-widest">
                      End
                    </label>
                    <input
                      type="datetime-local"
                      value={formEnd}
                      onChange={(e) => {
                        setFormEnd(e.target.value);
                        if (formErrors.end)
                          setFormErrors((p) => ({ ...p, end: "" }));
                      }}
                      className={`w-full bg-bg border rounded-lg px-3 py-2 text-sm text-text outline-none transition-colors ${formErrors.end ? "border-danger" : "border-border-2 focus:border-accent"}`}
                    />
                    {formErrors.end && (
                      <span className="text-xs text-danger">
                        {formErrors.end}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Location — label above, no overlapping icon */}
              <div className="flex flex-col gap-1">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-text-3 uppercase tracking-widest">
                  <MapPin size={11} /> Location
                </label>
                <input
                  className="w-full bg-bg border border-border-2 rounded-lg px-3 py-2.5 text-sm text-text outline-none focus:border-accent placeholder:text-text-3 transition-colors"
                  placeholder="Add location"
                  value={formLocation}
                  onChange={(e) => setFormLocation(e.target.value)}
                />
              </div>

              {/* Description — label above, no overlapping icon */}
              <div className="flex flex-col gap-1">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-text-3 uppercase tracking-widest">
                  <AlignLeft size={11} /> Description
                </label>
                <textarea
                  className="w-full bg-bg border border-border-2 rounded-lg px-3 py-2.5 text-sm text-text outline-none focus:border-accent resize-none placeholder:text-text-3 transition-colors leading-relaxed"
                  placeholder="Add description"
                  rows={3}
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                />
              </div>

              {/* Calendar selector */}
              {calendarList.length > 0 && (
                <div className="flex flex-col gap-1">
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-text-3 uppercase tracking-widest">
                    <CalIcon size={11} /> Calendar
                  </label>
                  <div className="relative">
                    <select
                      value={formCalendarId}
                      onChange={(e) => setFormCalendarId(e.target.value)}
                      className="w-full appearance-none bg-bg border border-border-2 rounded-lg px-3 py-2.5 text-sm text-text outline-none focus:border-accent transition-colors pr-8 cursor-pointer"
                    >
                      {calendarList.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.summary}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      size={13}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-3 pointer-events-none"
                    />
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => setCreateOpen(false)}
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
              {/* Title */}
              <div className="flex flex-col gap-1">
                <input
                  autoFocus
                  className={`w-full bg-transparent border-b px-0 py-2 text-base font-semibold text-text outline-none placeholder:text-text-3 transition-colors ${formErrors.title ? "border-danger" : "border-border-2 focus:border-accent"}`}
                  placeholder="Event title..."
                  value={formTitle}
                  onChange={(e) => {
                    setFormTitle(e.target.value);
                    if (formErrors.title)
                      setFormErrors((p) => ({ ...p, title: "" }));
                  }}
                  onKeyDown={(e) =>
                    e.key === "Enter" && !saving && handleUpdate()
                  }
                />
                {formErrors.title && (
                  <span className="text-xs text-danger">
                    {formErrors.title}
                  </span>
                )}
              </div>

              {/* All day toggle */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-text-2">All day</span>
                <button
                  type="button"
                  onClick={() => setFormAllDay((v) => !v)}
                  className={`relative rounded-full transition-colors ${formAllDay ? "bg-accent" : "bg-border-2"}`}
                  style={{ height: 22, width: 40 }}
                >
                  <div
                    className={`absolute top-[3px] w-4 h-4 rounded-full bg-white shadow transition-transform ${formAllDay ? "translate-x-[19px]" : "translate-x-[3px]"}`}
                  />
                </button>
              </div>

              {/* Date/time */}
              {formAllDay ? (
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-text-3 uppercase tracking-widest">
                      Start date
                    </label>
                    <input
                      type="date"
                      value={createDate}
                      onChange={(e) => {
                        setCreateDate(e.target.value);
                        if (formErrors.date)
                          setFormErrors((p) => ({ ...p, date: "" }));
                      }}
                      className={`w-full bg-bg border rounded-lg px-3 py-2 text-sm text-text outline-none transition-colors ${formErrors.date ? "border-danger" : "border-border-2 focus:border-accent"}`}
                    />
                    {formErrors.date && (
                      <span className="text-xs text-danger">
                        {formErrors.date}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-text-3 uppercase tracking-widest">
                      End date
                    </label>
                    <input
                      type="date"
                      value={formEndDate || createDate}
                      min={createDate}
                      onChange={(e) => {
                        setFormEndDate(e.target.value);
                        if (formErrors.endDate)
                          setFormErrors((p) => ({ ...p, endDate: "" }));
                      }}
                      className={`w-full bg-bg border rounded-lg px-3 py-2 text-sm text-text outline-none transition-colors ${formErrors.endDate ? "border-danger" : "border-border-2 focus:border-accent"}`}
                    />
                    {formErrors.endDate && (
                      <span className="text-xs text-danger">
                        {formErrors.endDate}
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-text-3 uppercase tracking-widest">
                      Start
                    </label>
                    <input
                      type="datetime-local"
                      value={formStart}
                      onChange={(e) => {
                        setFormStart(e.target.value);
                        if (formErrors.start)
                          setFormErrors((p) => ({ ...p, start: "" }));
                      }}
                      className={`w-full bg-bg border rounded-lg px-3 py-2 text-sm text-text outline-none transition-colors ${formErrors.start ? "border-danger" : "border-border-2 focus:border-accent"}`}
                    />
                    {formErrors.start && (
                      <span className="text-xs text-danger">
                        {formErrors.start}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-text-3 uppercase tracking-widest">
                      End
                    </label>
                    <input
                      type="datetime-local"
                      value={formEnd}
                      onChange={(e) => {
                        setFormEnd(e.target.value);
                        if (formErrors.end)
                          setFormErrors((p) => ({ ...p, end: "" }));
                      }}
                      className={`w-full bg-bg border rounded-lg px-3 py-2 text-sm text-text outline-none transition-colors ${formErrors.end ? "border-danger" : "border-border-2 focus:border-accent"}`}
                    />
                    {formErrors.end && (
                      <span className="text-xs text-danger">
                        {formErrors.end}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Location */}
              <div className="flex flex-col gap-1">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-text-3 uppercase tracking-widest">
                  <MapPin size={11} /> Location
                </label>
                <input
                  className="w-full bg-bg border border-border-2 rounded-lg px-3 py-2.5 text-sm text-text outline-none focus:border-accent placeholder:text-text-3 transition-colors"
                  placeholder="Add location"
                  value={formLocation}
                  onChange={(e) => setFormLocation(e.target.value)}
                />
              </div>

              {/* Description */}
              <div className="flex flex-col gap-1">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-text-3 uppercase tracking-widest">
                  <AlignLeft size={11} /> Description
                </label>
                <textarea
                  className="w-full bg-bg border border-border-2 rounded-lg px-3 py-2.5 text-sm text-text outline-none focus:border-accent resize-none placeholder:text-text-3 transition-colors leading-relaxed"
                  placeholder="Add description"
                  rows={3}
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                />
              </div>

              {/* Calendar selector */}
              {calendarList.length > 0 && (
                <div className="flex flex-col gap-1">
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-text-3 uppercase tracking-widest">
                    <CalIcon size={11} /> Calendar
                  </label>
                  <div className="relative">
                    <select
                      value={formCalendarId}
                      onChange={(e) => setFormCalendarId(e.target.value)}
                      className="w-full appearance-none bg-bg border border-border-2 rounded-lg px-3 py-2.5 text-sm text-text outline-none focus:border-accent transition-colors pr-8 cursor-pointer"
                    >
                      {calendarList.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.summary}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      size={13}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-3 pointer-events-none"
                    />
                  </div>
                </div>
              )}

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
