"use client";

import { useState, useCallback, useRef } from "react";
import { useApp } from "@crewmate/state";
import { ApiError, apiFetch, isAbortError, jsonRequest } from "@crewmate/lib";

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
  const [authError, setAuthError] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const requestVersionRef = useRef(0);

  /** Records an expired session; returns true when the error was handled that way. */
  const handleAuth = useCallback((err: unknown): boolean => {
    if (err instanceof ApiError && err.isAuthExpired) {
      setAuthError(true);
      return true;
    }
    return false;
  }, []);

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
        const data = await apiFetch<{ threads?: GmailThread[]; nextPageToken?: string | null }>(
          `/api/gmail/threads?${params}`,
          { signal: ctrl.signal, fallbackError: "Failed to load emails" },
        );
        if (requestVersion !== requestVersionRef.current) return;
        setAuthError(false);
        const page = Array.isArray(data?.threads) ? data.threads : [];
        if (pageToken) {
          setThreads((prev) => [...prev, ...page]);
        } else {
          setThreads(page);
        }
        setNextPageToken(data?.nextPageToken ?? null);
      } catch (err: unknown) {
        if (isAbortError(err) || requestVersion !== requestVersionRef.current) return;
        if (handleAuth(err)) return;
        notify("Failed to load emails", "error");
      } finally {
        if (requestVersion === requestVersionRef.current) setLoading(false);
      }
    },
    [notify, handleAuth, state.pageSettings.features.mail],
  );

  const fetchThread = useCallback(
    async (id: string, silent = false, signal?: AbortSignal): Promise<GmailMessage[] | null> => {
      try {
        const data = await apiFetch<{ messages?: GmailMessage[] }>(
          `/api/gmail/thread/${encodeURIComponent(id)}`,
          { signal, fallbackError: "Failed to load thread" },
        );
        return Array.isArray(data?.messages) ? data.messages : [];
      } catch (err: unknown) {
        if (isAbortError(err)) return null;
        if (!handleAuth(err) && !silent) notify("Failed to load thread", "error");
        return null;
      }
    },
    [notify, handleAuth],
  );

  /** Runs a thread mutation and reports success/failure uniformly. */
  const mutateThread = useCallback(
    async (
      id: string,
      init: RequestInit,
      messages: { success: string; failure: string; successKind?: "success" | "info" },
      onSuccess: () => void,
      onFailure?: () => void,
    ) => {
      try {
        await apiFetch(`/api/gmail/thread/${encodeURIComponent(id)}`, {
          ...init,
          fallbackError: messages.failure,
        });
        onSuccess();
        notify(messages.success, messages.successKind ?? "success");
        return true;
      } catch (err: unknown) {
        onFailure?.();
        if (!handleAuth(err)) notify(messages.failure, "error");
        return false;
      }
    },
    [notify, handleAuth],
  );

  const removeThread = useCallback(
    (id: string) => setThreads((prev) => prev.filter((t) => t.id !== id)),
    [],
  );

  const archiveThread = useCallback(
    (id: string) =>
      mutateThread(
        id,
        { method: "PATCH" },
        { success: "Thread archived", failure: "Failed to archive" },
        () => removeThread(id),
      ),
    [mutateThread, removeThread],
  );

  const unarchiveThread = useCallback(
    (id: string) =>
      mutateThread(
        id,
        jsonRequest("PATCH", { archive: false }),
        { success: "Thread returned to Inbox", failure: "Failed to unarchive" },
        () => removeThread(id),
      ),
    [mutateThread, removeThread],
  );

  const trashThread = useCallback(
    (id: string) =>
      mutateThread(
        id,
        { method: "DELETE" },
        { success: "Thread deleted", failure: "Failed to delete" },
        () => removeThread(id),
      ),
    [mutateThread, removeThread],
  );

  const toggleStar = useCallback(
    (id: string, star: boolean) => {
      const setStar = (value: boolean) =>
        setThreads((prev) => prev.map((t) => (t.id === id ? { ...t, starred: value } : t)));
      setStar(star);
      return mutateThread(
        id,
        jsonRequest("PUT", { star }),
        { success: star ? "Starred" : "Unstarred", failure: "Failed to update star" },
        () => undefined,
        () => setStar(!star),
      );
    },
    [mutateThread],
  );

  const sendEmail = useCallback(
    async (params: {
      to: string;
      subject: string;
      body: string;
      threadId?: string;
      inReplyTo?: string;
      references?: string;
    }) => {
      try {
        await apiFetch("/api/gmail/send", {
          ...jsonRequest("POST", params),
          fallbackError: "Failed to send email",
        });
        notify("Email sent", "success");
        return true;
      } catch (err: unknown) {
        if (handleAuth(err)) return false;
        // Validation messages from the send route are written by Crewmate and safe to show.
        notify(err instanceof ApiError && err.status === 400 ? err.message : "Failed to send email", "error");
        return false;
      }
    },
    [notify, handleAuth],
  );

  return {
    threads,
    loading,
    nextPageToken,
    authError,
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
