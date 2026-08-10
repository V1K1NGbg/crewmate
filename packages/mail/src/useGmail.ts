"use client";

import { useState, useCallback, useRef } from "react";
import { useApp } from "@crewmate/state";

export interface GmailThread {
  id: string;
  snippet: string;
  subject: string;
  from: string;
  date: string;
  messageCount: number;
  labelIds: string[];
  unread: boolean;
  starred: boolean;
}

export interface GmailMessage {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  messageId: string;
  snippet: string;
  body: string;
  labelIds: string[];
}

export function useGmail() {
  const { state, notify } = useApp();
  const [threads, setThreads] = useState<GmailThread[]>([]);
  const [loading, setLoading] = useState(false);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestVersionRef = useRef(0);

  const fetchThreads = useCallback(
    async (query = "in:inbox", pageToken?: string) => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const requestVersion = ++requestVersionRef.current;

      setLoading(true);
      try {
        const params = new URLSearchParams({ q: query });
        const configuredLimit = Number(
          (state.pageSettings.features.mail as { maxThreads?: number } | undefined)?.maxThreads,
        );
        params.set("limit", String(Number.isFinite(configuredLimit) ? configuredLimit : 20));
        if (pageToken) params.set("pageToken", pageToken);
        const res = await fetch(`/api/gmail/threads?${params}`, {
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error("Failed to fetch threads");
        const data = await res.json();
        if (requestVersion !== requestVersionRef.current) return;
        if (pageToken) {
          setThreads((prev) => [...prev, ...data.threads]);
        } else {
          setThreads(data.threads);
        }
        setNextPageToken(data.nextPageToken);
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        notify("Failed to load emails", "error");
      } finally {
        if (requestVersion === requestVersionRef.current) setLoading(false);
      }
    },
    [notify, state.pageSettings.features.mail],
  );

  const fetchThread = useCallback(
    async (id: string, silent = false): Promise<GmailMessage[] | null> => {
      try {
        const res = await fetch(`/api/gmail/thread/${id}`);
        if (!res.ok) throw new Error("Failed to fetch thread");
        const data = await res.json();
        return data.messages;
      } catch {
        if (!silent) notify("Failed to load thread", "error");
        return null;
      }
    },
    [notify],
  );

  const archiveThread = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/gmail/thread/${id}`, {
          method: "PATCH",
        });
        if (!res.ok) throw new Error("Archive failed");
        setThreads((prev) => prev.filter((t) => t.id !== id));
        notify("Thread archived", "success");
        return true;
      } catch {
        notify("Failed to archive", "error");
        return false;
      }
    },
    [notify],
  );

  const unarchiveThread = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/gmail/thread/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ archive: false }),
        });
        if (!res.ok) throw new Error("Unarchive failed");
        setThreads((prev) => prev.filter((thread) => thread.id !== id));
        notify("Thread returned to Inbox", "success");
        return true;
      } catch {
        notify("Failed to unarchive", "error");
        return false;
      }
    },
    [notify],
  );

  const trashThread = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/gmail/thread/${id}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error("Delete failed");
        setThreads((prev) => prev.filter((t) => t.id !== id));
        notify("Thread deleted", "success");
        return true;
      } catch {
        notify("Failed to delete", "error");
        return false;
      }
    },
    [notify],
  );

  const toggleStar = useCallback(
    async (id: string, star: boolean) => {
      setThreads((prev) =>
        prev.map((t) => (t.id === id ? { ...t, starred: star } : t)),
      );
      try {
        const res = await fetch(`/api/gmail/thread/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ star }),
        });
        if (!res.ok) throw new Error("Toggle star failed");
        notify(star ? "Starred" : "Unstarred", "success");
        return true;
      } catch {
        setThreads((prev) =>
          prev.map((t) => (t.id === id ? { ...t, starred: !star } : t)),
        );
        notify("Failed to update star", "error");
        return false;
      }
    },
    [notify],
  );

  const sendEmail = useCallback(
    async (params: {
      to: string;
      subject: string;
      body: string;
      threadId?: string;
      inReplyTo?: string;
    }) => {
      try {
        const res = await fetch("/api/gmail/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(params),
        });
        if (!res.ok) throw new Error("Send failed");
        notify("Email sent", "success");
        return true;
      } catch {
        notify("Failed to send email", "error");
        return false;
      }
    },
    [notify],
  );

  return {
    threads,
    loading,
    nextPageToken,
    fetchThreads,
    fetchThread,
    archiveThread,
    unarchiveThread,
    trashThread,
    toggleStar,
    sendEmail,
    setThreads,
  };
}
