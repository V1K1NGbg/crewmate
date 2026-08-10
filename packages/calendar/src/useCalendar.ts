"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useApp } from "@crewmate/state";
import { normalizeEnabledCalendarIds } from "./calendarSettings";
import { DEFAULT_CALENDAR_SETTINGS, type CalendarPluginSettings } from "./settings";

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
  attendees?: Array<{ self?: boolean; responseStatus?: string }>;
}

export function useCalendar() {
  const { state, notify } = useApp();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState(false);
  const fetchControllerRef = useRef<AbortController | null>(null);
  const fetchVersionRef = useRef(0);

  useEffect(() => () => fetchControllerRef.current?.abort(), []);

  const calendarSettings =
    (state.pageSettings.features.calendar as
      | CalendarPluginSettings
      | undefined) ?? DEFAULT_CALENDAR_SETTINGS;

  const fetchEvents = useCallback(
    async (timeMin?: string, timeMax?: string) => {
      fetchControllerRef.current?.abort();
      const controller = new AbortController();
      fetchControllerRef.current = controller;
      const requestVersion = ++fetchVersionRef.current;
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (timeMin) params.set("timeMin", timeMin);
        if (timeMax) params.set("timeMax", timeMax);

        const enabledIds = normalizeEnabledCalendarIds(
          calendarSettings.enabledCalendarIds,
        );
        params.set("calendarIds", enabledIds.join(","));

        const res = await fetch(`/api/calendar/events?${params}`, {
          signal: controller.signal,
        });
        if (!res.ok) {
          if (res.status === 401) setAuthError(true);
          throw new Error("Failed to fetch events");
        }
        const data = await res.json();
        if (requestVersion !== fetchVersionRef.current) return;
        setAuthError(false);
        const visibleEvents = calendarSettings.showDeclined
          ? data.events
          : data.events.filter((event: CalendarEvent) =>
              !event.attendees?.some((attendee) => attendee.self && attendee.responseStatus === "declined"),
            );
        setEvents(visibleEvents);
        if (data.truncated) notify("Calendar results were limited to 1,000 events per calendar", "info");
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (requestVersion !== fetchVersionRef.current) return;
        notify("Failed to load calendar events", "error");
      } finally {
        if (requestVersion === fetchVersionRef.current) setLoading(false);
      }
    },
    [notify, calendarSettings.enabledCalendarIds, calendarSettings.showDeclined],
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
          calendarId || calendarSettings.defaultCalendarId || "primary";
        const res = await fetch("/api/calendar/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...rest, calendarId: targetCalendarId }),
        });
        if (!res.ok) {
          if (res.status === 401) setAuthError(true);
          throw new Error("Create event failed");
        }
        const data = await res.json();
        setEvents((prev) => [...prev, data].sort(sortByStart));
        notify("Event created", "success");
        return data as CalendarEvent;
      } catch {
        notify("Failed to create event", "error");
        return null;
      }
    },
    [notify, calendarSettings.defaultCalendarId],
  );

  const updateEvent = useCallback(
    async (
      id: string,
      patch: Partial<CalendarEvent>,
      calendarId?: string,
    ) => {
      try {
        const res = await fetch(`/api/calendar/events/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...patch,
            calendarId: calendarId ?? "primary",
          }),
        });
        if (!res.ok) {
          if (res.status === 401) setAuthError(true);
          throw new Error("Update event failed");
        }
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
    async (id: string, calendarId: string) => {
      try {
        const params = new URLSearchParams({ calendarId });
        const res = await fetch(`/api/calendar/events/${encodeURIComponent(id)}?${params}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          if (res.status === 401) setAuthError(true);
          throw new Error("Delete event failed");
        }
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
    authError,
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
