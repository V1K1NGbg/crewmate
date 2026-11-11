"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useApp, type AppConfigurationBackup } from "@crewmate/state";
import { ApiError, apiErrorMessage, apiFetch, jsonRequest } from "@crewmate/lib";
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

interface DocContentResponse {
  content?: string;
  revisionId?: string;
  unsupportedStructure?: boolean;
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
  /** The Google Doc holds tables/images/etc. that a Crewmate save will flatten. */
  const [unsupportedStructure, setUnsupportedStructure] = useState(false);
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
      const initData = await apiFetch<{ documentId?: string; title?: string }>("/api/docs/init", {
        method: "POST",
        fallbackError: "Failed to initialize document",
      });
      if (typeof initData?.documentId !== "string" || !initData.documentId) {
        throw new Error("Failed to initialize document");
      }
      setDocId(initData.documentId);
      docIdRef.current = initData.documentId;
      setDocTitle(initData.title ?? "");
      const contentData = await apiFetch<DocContentResponse>(
        `/api/docs/content?id=${encodeURIComponent(initData.documentId)}`,
        { fallbackError: "Failed to load document content" },
      );
      setUnsupportedStructure(contentData?.unsupportedStructure === true);
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
      setInitError(apiErrorMessage(err, "Failed to load Google Doc"));
    } finally {
      setLoading(false);
    }
  }, [dispatch]);

  const refreshDoc = useCallback(async () => {
    const id = docIdRef.current;
    if (!id || dirtyRef.current || savePromiseRef.current) return;
    const versionAtStart = changeVersionRef.current;
    try {
      const data = await apiFetch<DocContentResponse>(`/api/docs/content?id=${encodeURIComponent(id)}`);
      // Never let a refresh that started before the user typed replace newer local edits.
      if (
        docIdRef.current !== id ||
        dirtyRef.current ||
        savePromiseRef.current ||
        changeVersionRef.current !== versionAtStart
      ) return;
      setUnsupportedStructure(data?.unsupportedStructure === true);
      const parsedDocument = parseNotesDocument(data?.content ?? "");
      revisionIdRef.current = data?.revisionId ?? revisionIdRef.current;
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
          let data: { revisionId?: string } | null;
          try {
            data = await apiFetch<{ revisionId?: string }>("/api/docs/content", {
              ...jsonRequest("PUT", {
                id,
                content: documentContent,
                revisionId: revisionIdRef.current,
              }),
              fallbackError: "Failed to save",
            });
          } catch (err: unknown) {
            if (err instanceof ApiError && err.status === 409) {
              setConflict(true);
              notify("The note changed in Google Docs. Resolve the conflict before saving.", "error");
              return;
            }
            throw err;
          }
          revisionIdRef.current = data?.revisionId ?? revisionIdRef.current;
          if (changeVersionRef.current === versionAtStart) {
            dirtyRef.current = false;
            setDirty(false);
          }
        }
      } catch (err: unknown) {
        notify(apiErrorMessage(err, "Save failed"), "error");
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
    unsupportedStructure,
    initDoc,
    refreshDoc,
    saveDoc,
    appendContent,
    updateContent,
    resolveConflict,
  };
}
