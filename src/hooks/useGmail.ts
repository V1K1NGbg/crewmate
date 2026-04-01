"use client";

import { useState, useCallback, useRef } from "react";
import { useApp } from "@/context/AppContext";

export interface GmailThread {
  id: string;
  snippet: string;
  subject: string;
  from: string;
  date: string;
  messageCount: number;
  labelIds: string[];
  unread: boolean;
}

export interface GmailMessage {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  snippet: string;
  body: string;
  labelIds: string[];
}

export function useGmail() {
  const { notify } = useApp();
  const [threads, setThreads] = useState<GmailThread[]>([]);
  const [loading, setLoading] = useState(false);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchThreads = useCallback(
    async (query = "in:inbox", pageToken?: string) => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      setLoading(true);
      try {
        const params = new URLSearchParams({ q: query });
        if (pageToken) params.set("pageToken", pageToken);
        const res = await fetch(`/api/gmail/threads?${params}`, {
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error("Failed to fetch threads");
        const data = await res.json();
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
        setLoading(false);
      }
    },
    [notify],
  );

  const fetchThread = useCallback(
    async (id: string): Promise<GmailMessage[] | null> => {
      try {
        const res = await fetch(`/api/gmail/thread/${id}`);
        if (!res.ok) throw new Error("Failed to fetch thread");
        const data = await res.json();
        return data.messages;
      } catch {
        notify("Failed to load thread", "error");
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
    trashThread,
    sendEmail,
    setThreads,
  };
}
