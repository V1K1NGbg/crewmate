"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useApp, type AppConfigurationBackup } from "@crewmate/state";
import type { Note } from "@crewmate/types";
import { DEFAULT_NOTES_SETTINGS, type NotesPluginSettings } from "./settings";
import { buildNotesDocument, parseNotesDocument } from "./documentContent";

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
  const { state, dispatch, notify } = useApp();
  const [docId, setDocId] = useState<string | null>(null);
  const [docTitle, setDocTitle] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [conflict, setConflict] = useState(false);
  const docIdRef = useRef<string | null>(null);
  const contentRef = useRef(content);
  const dirtyRef = useRef(false);
  const changeVersionRef = useRef(0);
  const revisionIdRef = useRef<string | null>(null);
  const savePromiseRef = useRef<Promise<void> | null>(null);
  const configurationRef = useRef<AppConfigurationBackup>({});
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
      const parsedDocument = parseNotesDocument(contentData.content ?? "");
      revisionIdRef.current = contentData.revisionId ?? null;
      contentRef.current = parsedDocument.body;
      setContent(parsedDocument.body);
      setDirty(false);
      dirtyRef.current = false;
      setConflict(false);
      if (parsedDocument.backup) {
        dispatch({
          type: "RESTORE_APP_CONFIGURATION",
          backup: parsedDocument.backup,
        });
      }
    } catch (err: unknown) {
      setInitError(
        err instanceof Error ? err.message : "Failed to load Google Doc",
      );
    } finally {
      setLoading(false);
    }
  }, [dispatch]);

  const refreshDoc = useCallback(async () => {
    const id = docIdRef.current;
    if (!id || dirtyRef.current) return;
    try {
      const res = await fetch(`/api/docs/content?id=${encodeURIComponent(id)}`);
      if (!res.ok) return;
      const data = await res.json();
      const parsedDocument = parseNotesDocument(data.content ?? "");
      revisionIdRef.current = data.revisionId ?? revisionIdRef.current;
      contentRef.current = parsedDocument.body;
      setContent(parsedDocument.body);
    } catch {
      /* silent */
    }
  }, []);

  const saveDoc = useCallback(async () => {
    if (savePromiseRef.current) return savePromiseRef.current;

    const run = async (): Promise<void> => {
      const id = docIdRef.current;
      if (!id || !revisionIdRef.current || conflict) return;
      setSaving(true);
      try {
        while (dirtyRef.current && !conflict) {
          const versionAtStart = changeVersionRef.current;
          const documentContent = buildNotesDocument(
            contentRef.current,
            configurationRef.current,
          );
          const res: Response = await fetch("/api/docs/content", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id,
              content: documentContent,
              revisionId: revisionIdRef.current,
            }),
          });
          const data: { error?: string; revisionId?: string } = await res.json().catch(() => ({}));
          if (res.status === 409) {
            setConflict(true);
            notify("The note changed in Google Docs. Resolve the conflict before saving.", "error");
            return;
          }
          if (!res.ok) throw new Error(data.error ?? "Failed to save");
          revisionIdRef.current = data.revisionId ?? revisionIdRef.current;
          if (changeVersionRef.current === versionAtStart) {
            dirtyRef.current = false;
            setDirty(false);
          }
        }
      } catch (err: unknown) {
        notify(err instanceof Error ? err.message : "Save failed", "error");
      } finally {
        setSaving(false);
      }
    };

    const promise = run().finally(() => {
      if (savePromiseRef.current === promise) savePromiseRef.current = null;
    });
    savePromiseRef.current = promise;
    return promise;
  }, [conflict, notify]);

  const resolveConflict = useCallback(async (copyLocal: boolean) => {
    if (copyLocal) await navigator.clipboard.writeText(contentRef.current);
    setConflict(false);
    dirtyRef.current = false;
    setDirty(false);
    await initDoc();
  }, [initDoc]);

  const notesSettings =
    (state.pageSettings.features.notes as NotesPluginSettings | undefined) ??
    DEFAULT_NOTES_SETTINGS;

  useEffect(() => {
    configurationRef.current = {
      pages: state.pages,
      pageSettings: state.pageSettings,
      panelWidths: state.panelWidths,
      aiServerUrl: state.aiServerUrl,
      assistantModel: state.assistantModel,
      environmentVault: state.environmentVault,
    };
  }, [
    state.aiServerUrl,
    state.assistantModel,
    state.environmentVault,
    state.pageSettings,
    state.pages,
    state.panelWidths,
  ]);

  const scheduleAutoSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    const delay = notesSettings.autoSaveDelay ?? 2000;
    saveTimerRef.current = setTimeout(() => saveDoc(), delay);
  }, [saveDoc, notesSettings.autoSaveDelay]);

  const appendContent = useCallback(
    (addition: string) => {
      changeVersionRef.current += 1;
      setContent((prev) => {
        const next = prev + addition;
        contentRef.current = next;
        return next;
      });
      setDirty(true);
      dirtyRef.current = true;
      scheduleAutoSave();
    },
    [scheduleAutoSave],
  );

  const updateContent = useCallback(
    (value: string) => {
      changeVersionRef.current += 1;
      contentRef.current = value;
      setContent(value);
      setDirty(true);
      dirtyRef.current = true;
      scheduleAutoSave();
    },
    [scheduleAutoSave],
  );

  useEffect(() => {
    if (loading || !docId) return;
    changeVersionRef.current += 1;
    setDirty(true);
    dirtyRef.current = true;
    scheduleAutoSave();
  }, [
    docId,
    loading,
    scheduleAutoSave,
    state.aiServerUrl,
    state.assistantModel,
    state.environmentVault,
    state.pageSettings,
    state.pages,
    state.panelWidths,
  ]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current && !savePromiseRef.current) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  return {
    docId,
    docTitle,
    content,
    loading,
    saving,
    initError,
    dirty,
    conflict,
    initDoc,
    refreshDoc,
    saveDoc,
    appendContent,
    updateContent,
    resolveConflict,
  };
}
