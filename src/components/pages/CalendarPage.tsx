"use client";

import { useState, useEffect } from "react";
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
} from "date-fns";
import { useApp } from "@/context/AppContext";
import { useResizable } from "@/lib/useResizable";
import { useCalendar, type CalendarEvent } from "@/hooks/useCalendar";

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

function eventColor(event: CalendarEvent): string {
  return EVENT_COLORS[event.colorId ?? ""] ?? "var(--color-accent)";
}
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

  const [view, setView] = useState<ViewMode>(
    state.pageSettings.calendar.defaultView,
  );
  const [cursor, setCursor] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(
    null,
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [createDate, setCreateDate] = useState("");
  const [importPanelOpen, setImportPanelOpen] = useState(false);

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
  const [formDesc, setFormDesc] = useState("");
  const [formLocation, setFormLocation] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!state.calendarPrefill) return;
    const pf = state.calendarPrefill;
    const dateStr = parseDateHint(pf.dateHint);
    setCreateDate(dateStr);
    setFormTitle(pf.title);
    setFormDesc(pf.description ?? "");
    if (pf.startHint) {
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
    } else {
      setFormStart(`${dateStr}T09:00`);
      setFormAllDay(false);
    }
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
    setFormLocation("");
    setCreateOpen(true);
    dispatch({ type: "CLEAR_CALENDAR_PREFILL" });
  }, [state.calendarPrefill, dispatch]);

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

  function openCreate(dateStr?: string) {
    const d = dateStr ?? format(new Date(), "yyyy-MM-dd");
    setCreateDate(d);
    setFormTitle("");
    setFormStart(`${d}T09:00`);
    setFormEnd(`${d}T10:00`);
    setFormAllDay(false);
    setFormDesc("");
    setFormLocation("");
    setCreateOpen(true);
  }

  async function handleCreate() {
    if (!formTitle) return;
    setSaving(true);
    const tz =
      state.pageSettings.calendar.timezone ||
      Intl.DateTimeFormat().resolvedOptions().timeZone;
    await cal.createEvent({
      summary: formTitle,
      description: formDesc || undefined,
      location: formLocation || undefined,
      start: formAllDay
        ? { dateTime: createDate, timeZone: tz }
        : { dateTime: new Date(formStart).toISOString(), timeZone: tz },
      end: formAllDay
        ? { dateTime: createDate, timeZone: tz }
        : { dateTime: new Date(formEnd).toISOString(), timeZone: tz },
    });
    setSaving(false);
    setCreateOpen(false);
  }

  async function handleDelete(id: string) {
    await cal.deleteEvent(id);
    setSelectedEvent(null);
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
    setCreateOpen(true);
    setImportPanelOpen(false);
  }

  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const weekStart = startOfWeek(cursor, { weekStartsOn: 0 });
  const weekEnd = endOfWeek(cursor, { weekStartsOn: 0 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });
  const hours = Array.from({ length: 24 }, (_, i) => i);

  function eventsOnDay(day: Date): CalendarEvent[] {
    return cal.events.filter((e) => {
      try {
        return isSameDay(eventStart(e), day);
      } catch {
        return false;
      }
    });
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
            className="px-3 py-1.5 text-sm font-medium text-text-2 border border-border-2 rounded-lg hover:border-accent hover:text-accent transition-all"
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
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border rounded-lg transition-all ${
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
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
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
            className="flex items-center gap-1.5 px-4 py-2 bg-accent text-white text-sm font-semibold rounded-lg hover:bg-accent-hover transition-all"
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
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                  <div
                    key={d}
                    className="py-2 text-center text-xs text-text-3 font-semibold uppercase tracking-widest"
                  >
                    {d}
                  </div>
                ))}
              </div>
              <div
                className="flex-1 grid grid-cols-7 overflow-y-auto"
                style={{
                  gridTemplateRows: `repeat(${days.length / 7}, minmax(100px, 1fr))`,
                }}
              >
                {days.map((day) => {
                  const dayEvents = eventsOnDay(day);
                  const inMonth = isSameMonth(day, cursor);
                  const today = isToday(day);
                  return (
                    <div
                      key={day.toISOString()}
                      onClick={() => openCreate(format(day, "yyyy-MM-dd"))}
                      className={`border-r border-b border-border/50 p-1.5 cursor-pointer transition-colors hover:bg-surface ${!inMonth ? "opacity-30" : ""}`}
                    >
                      <div
                        className={`w-6 h-6 flex items-center justify-center rounded-full text-xs mb-1 font-medium ${today ? "bg-accent text-text font-bold" : "text-text-2"}`}
                      >
                        {format(day, "d")}
                      </div>
                      <div className="flex flex-col gap-0.5">
                        {dayEvents.slice(0, 3).map((ev) => (
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
                            {ev.start.dateTime && (
                              <span className="opacity-70 mr-1">
                                {format(eventStart(ev), "h:mm")}–
                                {format(eventEnd(ev), "h:mm")}
                              </span>
                            )}
                            {ev.summary}
                          </button>
                        ))}
                        {dayEvents.length > 3 && (
                          <span className="text-xs text-text-3 px-1.5">
                            +{dayEvents.length - 3} more
                          </span>
                        )}
                      </div>
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
              {weekDays.some((day) =>
                eventsOnDay(day).some((e) => !e.start.dateTime),
              ) && (
                <div
                  className="grid border-b border-border bg-bg"
                  style={{
                    gridTemplateColumns: "60px repeat(7, 1fr)",
                  }}
                >
                  <div className="flex items-center justify-end pr-3 text-xs text-text-3 font-medium py-1.5">
                    all-day
                  </div>
                  {weekDays.map((day) => {
                    const allDayEvents = eventsOnDay(day).filter(
                      (e) => !e.start.dateTime,
                    );
                    return (
                      <div
                        key={`ad-${day.toISOString()}`}
                        className="border-l border-border px-1 py-1.5 flex flex-col gap-0.5"
                      >
                        {allDayEvents.map((ev) => (
                          <button
                            key={ev.id}
                            onClick={() => setSelectedEvent(ev)}
                            className="w-full text-left text-xs px-1.5 py-0.5 rounded truncate font-medium transition-opacity hover:opacity-80"
                            style={{
                              backgroundColor: eventColor(ev) + "28",
                              color: eventColor(ev),
                              borderLeft: `2px solid ${eventColor(ev)}`,
                            }}
                          >
                            {ev.summary}
                          </button>
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
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
                        {h === 0 ? "" : format(new Date(2000, 0, 1, h), "h a")}
                      </div>
                    ))}
                  </div>
                  {weekDays.map((day) => {
                    const dayEvents = eventsOnDay(day).filter(
                      (e) => e.start.dateTime,
                    );
                    return (
                      <div
                        key={day.toISOString()}
                        className="border-l border-border relative hover:bg-surface/30 transition-colors cursor-pointer"
                        onClick={() => openCreate(format(day, "yyyy-MM-dd"))}
                      >
                        {hours.map((h) => (
                          <div
                            key={h}
                            style={{ height: 56 }}
                            className="border-b border-border/30"
                          />
                        ))}
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
                          return (
                            <button
                              key={ev.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedEvent(ev);
                              }}
                              className="absolute left-0.5 right-0.5 rounded-lg px-2 py-1 text-xs font-medium text-left overflow-hidden transition-opacity hover:opacity-80"
                              style={{
                                top,
                                height,
                                backgroundColor: eventColor(ev) + "38",
                                color: eventColor(ev),
                                borderLeft: `2px solid ${eventColor(ev)}`,
                              }}
                            >
                              <div className="truncate font-semibold">
                                {ev.summary}
                              </div>
                              <div className="truncate opacity-70 text-xs">
                                {format(eventStart(ev), "h:mm a")} –{" "}
                                {format(eventEnd(ev), "h:mm a")}
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
                  ? `${format(eventStart(selectedEvent), "EEE, MMM d · h:mm a")} – ${format(eventEnd(selectedEvent), "h:mm a")}`
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
          </div>
          <div className="px-5 pb-5">
            <button
              onClick={() => handleDelete(selectedEvent.id)}
              className="w-full py-2 text-sm font-medium text-danger border border-danger/25 rounded-lg hover:bg-danger/8 hover:border-danger/50 transition-all"
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
            className="bg-surface border border-border-2 rounded-xl w-full max-w-[480px] shadow-2xl overflow-hidden"
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
                    {format(new Date(createDate + "T00:00"), "EEEE, MMMM d")}
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
              <input
                autoFocus
                className="w-full bg-transparent border-b border-border-2 px-0 py-2 text-base font-semibold text-text outline-none focus:border-accent placeholder:text-text-3 transition-colors"
                placeholder="Add a title..."
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                onKeyDown={(e) =>
                  e.key === "Enter" && !saving && formTitle && handleCreate()
                }
              />
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
              {!formAllDay && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-text-3 uppercase tracking-widest">
                      Start
                    </label>
                    <input
                      type="datetime-local"
                      value={formStart}
                      onChange={(e) => setFormStart(e.target.value)}
                      className="w-full bg-bg border border-border-2 rounded-lg px-3 py-2 text-sm text-text outline-none focus:border-accent transition-colors"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-text-3 uppercase tracking-widest">
                      End
                    </label>
                    <input
                      type="datetime-local"
                      value={formEnd}
                      onChange={(e) => setFormEnd(e.target.value)}
                      className="w-full bg-bg border border-border-2 rounded-lg px-3 py-2 text-sm text-text outline-none focus:border-accent transition-colors"
                    />
                  </div>
                </div>
              )}
              <div className="relative">
                <MapPin
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-text-3"
                />
                <input
                  className="w-full bg-bg border border-border-2 rounded-lg pl-9 pr-4 py-2.5 text-sm text-text outline-none focus:border-accent placeholder:text-text-3 transition-colors"
                  placeholder="Add location"
                  value={formLocation}
                  onChange={(e) => setFormLocation(e.target.value)}
                />
              </div>
              <div className="relative">
                <AlignLeft
                  size={14}
                  className="absolute left-3 top-3 text-text-3"
                />
                <textarea
                  className="w-full bg-bg border border-border-2 rounded-lg pl-9 pr-4 py-2.5 text-sm text-text outline-none focus:border-accent resize-none placeholder:text-text-3 transition-colors leading-relaxed"
                  placeholder="Add description"
                  rows={3}
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                />
              </div>
              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => setCreateOpen(false)}
                  className="flex-1 py-2.5 text-sm font-medium text-text-2 border border-border-2 rounded-lg hover:bg-surface-2 hover:text-text transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={saving || !formTitle}
                  className="flex-1 py-2.5 bg-accent text-white text-sm font-semibold rounded-lg hover:bg-accent-hover transition-all disabled:opacity-40 flex items-center justify-center gap-2"
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
    </div>
  );
}
