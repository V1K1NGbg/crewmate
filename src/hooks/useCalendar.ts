"use client";

import { useState, useCallback } from "react";
import { useApp } from "@/context/AppContext";

export interface CalendarEvent {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  htmlLink?: string;
  colorId?: string;
  calendarId?: string;
}

export function useCalendar() {
  const { state, notify } = useApp();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchEvents = useCallback(
    async (timeMin?: string, timeMax?: string) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (timeMin) params.set("timeMin", timeMin);
        if (timeMax) params.set("timeMax", timeMax);

        const enabledIds = state.pageSettings.calendar.enabledCalendarIds;
        if (enabledIds && enabledIds.length > 0) {
          params.set("calendarIds", enabledIds.join(","));
        }

        const res = await fetch(`/api/calendar/events?${params}`);
        if (!res.ok) throw new Error("Failed to fetch events");
        const data = await res.json();
        setEvents(data.events);
      } catch {
        notify("Failed to load calendar events", "error");
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [notify, state.pageSettings.calendar.enabledCalendarIds],
  );

  const createEvent = useCallback(
    async (event: {
      summary: string;
      description?: string;
      location?: string;
      start: { dateTime: string; timeZone?: string } | { date: string };
      end: { dateTime: string; timeZone?: string } | { date: string };
      calendarId?: string;
    }) => {
      try {
        const { calendarId, ...rest } = event;
        const targetCalendarId =
          calendarId ||
          state.pageSettings.calendar.defaultCalendarId ||
          "primary";
        const res = await fetch("/api/calendar/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...rest, calendarId: targetCalendarId }),
        });
        if (!res.ok) throw new Error("Create event failed");
        const data = await res.json();
        setEvents((prev) => [...prev, data].sort(sortByStart));
        notify("Event created", "success");
        return data as CalendarEvent;
      } catch {
        notify("Failed to create event", "error");
        return null;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [notify, state.pageSettings.calendar.defaultCalendarId],
  );

  const updateEvent = useCallback(
    async (id: string, patch: Partial<CalendarEvent>) => {
      try {
        const res = await fetch(`/api/calendar/events/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (!res.ok) throw new Error("Update event failed");
        const data = await res.json();
        setEvents((prev) =>
          prev.map((e) => (e.id === id ? data : e)).sort(sortByStart),
        );
        notify("Event updated", "success");
        return data as CalendarEvent;
      } catch {
        notify("Failed to update event", "error");
        return null;
      }
    },
    [notify],
  );

  const deleteEvent = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/calendar/events/${id}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error("Delete event failed");
        setEvents((prev) => prev.filter((e) => e.id !== id));
        notify("Event deleted", "success");
        return true;
      } catch {
        notify("Failed to delete event", "error");
        return false;
      }
    },
    [notify],
  );

  return {
    events,
    loading,
    fetchEvents,
    createEvent,
    updateEvent,
    deleteEvent,
  };
}

function sortByStart(a: CalendarEvent, b: CalendarEvent) {
  const aStart = a.start.dateTime ?? a.start.date ?? "";
  const bStart = b.start.dateTime ?? b.start.date ?? "";
  return aStart.localeCompare(bStart);
}
