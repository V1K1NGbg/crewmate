"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useApp } from "@crewmate/state";
import type { Note } from "@crewmate/types";
import { DEFAULT_NOTES_SETTINGS, type NotesPluginSettings } from "./settings";

export function docToAppNotes(
  docId: string | null,
  title: string,
  content: string,
): Note[] {
  if (!docId) return [];
  const now = new Date().toISOString();
  return [
    {
      id: docId,
      title,
      content,
      createdAt: now,
      updatedAt: now,
      fileName: "",
    },
  ];
}

export function useNotes() {
  const { state, notify } = useApp();
  const [docId, setDocId] = useState<string | null>(null);
  const [docTitle, setDocTitle] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const docIdRef = useRef<string | null>(null);
  const contentRef = useRef(content);
  const dirtyRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    contentRef.current = content;
    dirtyRef.current = dirty;
  }, [content, dirty]);

  const initDoc = useCallback(async () => {
    setLoading(true);
    setInitError(null);
    try {
      const res = await fetch("/api/docs/init", { method: "POST" });
      const initData = await res.json();
      if (!res.ok)
        throw new Error(initData.error ?? "Failed to initialize document");
      setDocId(initData.documentId);
      docIdRef.current = initData.documentId;
      setDocTitle(initData.title);
      const contentRes = await fetch(
        `/api/docs/content?id=${encodeURIComponent(initData.documentId)}`,
      );
      const contentData = await contentRes.json();
      if (!contentRes.ok)
        throw new Error(contentData.error ?? "Failed to load document content");
      setContent(contentData.content ?? "");
      setDirty(false);
    } catch (err: unknown) {
      setInitError(
        err instanceof Error ? err.message : "Failed to load Google Doc",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshDoc = useCallback(async () => {
    const id = docIdRef.current;
    if (!id || dirtyRef.current) return;
    try {
      const res = await fetch(`/api/docs/content?id=${encodeURIComponent(id)}`);
      if (!res.ok) return;
      const data = await res.json();
      setContent(data.content ?? "");
    } catch {
      /* silent */
    }
  }, []);

  const saveDoc = useCallback(async () => {
    const id = docIdRef.current;
    if (!id) return;
    setSaving(true);
    try {
      const res = await fetch("/api/docs/content", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          content: contentRef.current,
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
      setDirty(false);
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : "Save failed", "error");
    } finally {
      setSaving(false);
    }
  }, [notify]);

  const notesSettings =
    (state.pageSettings.features.notes as NotesPluginSettings | undefined) ??
    DEFAULT_NOTES_SETTINGS;

  const scheduleAutoSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    const delay = notesSettings.autoSaveDelay ?? 2000;
    saveTimerRef.current = setTimeout(() => saveDoc(), delay);
  }, [saveDoc, notesSettings.autoSaveDelay]);

  const appendContent = useCallback(
    (addition: string) => {
      setContent((prev) => prev + addition);
      setDirty(true);
    },
    [],
  );

  const updateContent = useCallback(
    (value: string) => {
      setContent(value);
      setDirty(true);
      scheduleAutoSave();
    },
    [scheduleAutoSave],
  );

  return {
    docId,
    docTitle,
    content,
    loading,
    saving,
    initError,
    dirty,
    initDoc,
    refreshDoc,
    saveDoc,
    scheduleAutoSave,
    appendContent,
    updateContent,
    setContent,
    setDirty,
  };
}
