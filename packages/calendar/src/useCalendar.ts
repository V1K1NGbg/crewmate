"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useApp } from "@crewmate/state";
import { ApiError, apiFetch, isAbortError, jsonRequest } from "@crewmate/lib";
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
  /** Records an expired session; returns true when the error was handled that way. */
  const handleAuth = useCallback((error: unknown): boolean => {
    if (error instanceof ApiError && error.isAuthExpired) {
      setAuthError(true);
      return true;
    }
    return false;
  }, []);
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

        const data = await apiFetch<{ events?: CalendarEvent[]; truncated?: boolean }>(
          `/api/calendar/events?${params}`,
          { signal: controller.signal, fallbackError: "Failed to load calendar events" },
        );
        if (requestVersion !== fetchVersionRef.current) return;
        setAuthError(false);
        const loaded = Array.isArray(data?.events) ? data.events : [];
        const visibleEvents = calendarSettings.showDeclined
          ? loaded
          : loaded.filter((event: CalendarEvent) =>
              !event.attendees?.some((attendee) => attendee.self && attendee.responseStatus === "declined"),
            );
        setEvents(visibleEvents);
        if (data?.truncated) notify("Calendar results were limited to 1,000 events per calendar", "info");
      } catch (error: unknown) {
        if (isAbortError(error) || requestVersion !== fetchVersionRef.current) return;
        if (handleAuth(error)) return;
        notify("Failed to load calendar events", "error");
      } finally {
        if (requestVersion === fetchVersionRef.current) setLoading(false);
      }
    },
    [notify, handleAuth, calendarSettings.enabledCalendarIds, calendarSettings.showDeclined],
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
        const data = await apiFetch<CalendarEvent>("/api/calendar/events", {
          ...jsonRequest("POST", { ...rest, calendarId: targetCalendarId }),
          fallbackError: "Failed to create event",
        });
        setEvents((prev) => [...prev, data].sort(sortByStart));
        notify("Event created", "success");
        return data;
      } catch (error: unknown) {
        if (!handleAuth(error)) notify("Failed to create event", "error");
        return null;
      }
    },
    [notify, handleAuth, calendarSettings.defaultCalendarId],
  );

  const updateEvent = useCallback(
    async (
      id: string,
      patch: Partial<CalendarEvent>,
      calendarId: string,
    ) => {
      try {
        const data = await apiFetch<CalendarEvent>(`/api/calendar/events/${encodeURIComponent(id)}`, {
          ...jsonRequest("PATCH", { ...patch, calendarId }),
          fallbackError: "Failed to update event",
        });
        setEvents((prev) =>
          prev.map((e) => (e.id === id && e.calendarId === calendarId ? data : e)).sort(sortByStart),
        );
        notify("Event updated", "success");
        return data;
      } catch (error: unknown) {
        if (!handleAuth(error)) notify("Failed to update event", "error");
        return null;
      }
    },
    [notify, handleAuth],
  );

  const deleteEvent = useCallback(
    async (id: string, calendarId: string) => {
      try {
        const params = new URLSearchParams({ calendarId });
        await apiFetch(`/api/calendar/events/${encodeURIComponent(id)}?${params}`, {
          method: "DELETE",
          fallbackError: "Failed to delete event",
        });
        setEvents((prev) => prev.filter((e) => !(e.id === id && e.calendarId === calendarId)));
        notify("Event deleted", "success");
        return true;
      } catch (error: unknown) {
        if (!handleAuth(error)) notify("Failed to delete event", "error");
        return false;
      }
    },
    [notify, handleAuth],
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
