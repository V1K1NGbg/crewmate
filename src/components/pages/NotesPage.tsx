"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Save,
  Loader2,
  FileText,
  Sparkles,
  ExternalLink,
  RefreshCw,
  Pencil,
  LayoutTemplate,
  Undo2,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useSession } from "next-auth/react";
import { useApp } from "@/context/AppContext";
import { opencodeChat } from "@/lib/opencode";

const NOTE_TEMPLATE_PROMPT = (content: string) =>
  `You are a markdown structure formatter. Your ONLY job is to fix the structure and formatting of the note below — do NOT change, reword, paraphrase, summarize, or remove any words or information.

Rules:
- Preserve every single word exactly as written. Do not alter the meaning or wording of anything.
- Fix markdown structure only: add/fix headings (##/###), bullet lists, numbered lists, checkboxes (- [ ]), bold labels, code blocks, and spacing.
- Remove duplicate blank lines. Ensure consistent indentation.
- If the content is already well-structured, make only minimal improvements.
- Output only the final formatted document — no preamble, no explanation, no meta-commentary.

Content:
${content}`;

export default function NotesPage() {
  const { state, dispatch, notify } = useApp();
  const { data: session } = useSession();

  const [docId, setDocId] = useState<string | null>(null);
  const [docTitle, setDocTitle] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [applyingTemplate, setApplyingTemplate] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [editing, setEditing] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastContentRef = useRef<string | null>(null);
  const [canUndoFormat, setCanUndoFormat] = useState(false);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!editing) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setEditing(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editing]);

  const contentRef = useRef(content);
  contentRef.current = content;
  const docIdRef = useRef<string | null>(null);
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;

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

  useEffect(() => {
    if (session?.accessToken) initDoc();
  }, [session?.accessToken]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!state.notePrefill || !docId) return;
    const { title, content: prefillContent } = state.notePrefill;
    dispatch({ type: "CLEAR_NOTE_PREFILL" });
    const timestamp = new Date().toLocaleString();
    const addition = `\n\n## ${title}\n\n> Added on ${timestamp}\n\n${prefillContent || ""}\n`;
    setContent((prev) => prev + addition);
    setDirty(true);
    notify("Content appended from prefill", "success");
  }, [state.notePrefill]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const interval = state.pageSettings.general.autoRefreshInterval;
    if (!interval || !docIdRef.current) return;
    const id = setInterval(refreshDoc, interval * 1000);
    return () => clearInterval(id);
  }, [state.pageSettings.general.autoRefreshInterval, refreshDoc, docId]);

  async function saveDoc() {
    if (!docId) return;
    setSaving(true);
    try {
      const res = await fetch("/api/docs/content", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: docId,
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
  }

  function scheduleAutoSave() {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    const delay = state.pageSettings.notes.autoSaveDelay ?? 2000;
    saveTimerRef.current = setTimeout(() => saveDoc(), delay);
  }

  async function handleAISummarize() {
    if (!state.opencodeAvailable) {
      notify("opencode server not available", "error");
      return;
    }
    setSummarizing(true);
    try {
      const prompt = `Summarize the following note concisely in 2-4 sentences. Return ONLY the summary text, no preamble, no markdown headers.\n\n---\n${content.slice(0, 4000)}`;
      const summary = await opencodeChat(state.opencodeUrl, prompt);
      const timestamp = new Date().toLocaleString();
      setContent(
        (prev) =>
          `${prev}\n\n---\n\n### Summary\n\n> Generated on ${timestamp}\n\n${summary}\n`,
      );
      setDirty(true);
      scheduleAutoSave();
      notify("Summary appended", "success");
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : "Summarize failed", "error");
    } finally {
      setSummarizing(false);
    }
  }

  async function handleApplyTemplate() {
    if (!state.opencodeAvailable) {
      notify("opencode server not available", "error");
      return;
    }
    setApplyingTemplate(true);
    try {
      const prompt = NOTE_TEMPLATE_PROMPT(content.slice(0, 6000));
      const result = await opencodeChat(state.opencodeUrl, prompt);
      lastContentRef.current = content;
      setContent(result);
      setDirty(true);
      scheduleAutoSave();
      setCanUndoFormat(true);
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      undoTimerRef.current = setTimeout(() => setCanUndoFormat(false), 8000);
      notify("Formatting applied", "success");
    } catch (err: unknown) {
      notify(
        err instanceof Error ? err.message : "Template apply failed",
        "error",
      );
    } finally {
      setApplyingTemplate(false);
    }
  }

  function handleUndoFormat() {
    if (lastContentRef.current === null) return;
    setContent(lastContentRef.current);
    lastContentRef.current = null;
    setCanUndoFormat(false);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setDirty(true);
    scheduleAutoSave();
    notify("Format undone", "info");
  }

  if (!session?.accessToken || initError) {
    const isUnauthorized =
      !session?.accessToken ||
      initError?.toLowerCase().includes("unauthorized");
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-6 bg-bg p-12">
        <div className="flex flex-col items-center gap-5 p-8 bg-surface border border-border-2 rounded-2xl max-w-sm w-full">
          <div className="w-12 h-12 bg-surface-2 rounded-xl flex items-center justify-center">
            <FileText size={24} className="text-text-3" />
          </div>
          <div className="flex flex-col items-center gap-2 text-center">
            <h2 className="text-base font-semibold text-text">
              {isUnauthorized
                ? "Re-authentication required"
                : "Could not load Notes"}
            </h2>
            <p className="text-sm text-text-2 leading-relaxed">
              {isUnauthorized
                ? "Sign out and sign back in to grant access to Google Docs."
                : (initError ?? "An unexpected error occurred.")}
            </p>
          </div>
          {isUnauthorized ? (
            <a
              href="/api/auth/signout"
              className="w-full flex items-center justify-center px-4 py-2.5 bg-accent text-white text-sm font-semibold rounded-lg hover:bg-accent-hover transition-all"
            >
              Sign out &amp; re-authenticate
            </a>
          ) : (
            <button
              onClick={initDoc}
              className="w-full flex items-center justify-center px-4 py-2.5 bg-surface-2 border border-border-2 text-text text-sm font-medium rounded-lg hover:border-accent hover:text-accent transition-all"
            >
              Retry
            </button>
          )}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-bg">
        <div className="flex items-center gap-3 text-text-2 text-sm">
          <Loader2 size={16} className="animate-spin text-accent" /> Loading
          Google Doc…
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-bg">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-border bg-bg flex-shrink-0">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <FileText size={16} className="text-accent flex-shrink-0" />
          <span className="text-sm font-semibold text-text truncate">
            {docTitle}
          </span>
          {dirty && (
            <span className="text-xs text-warning flex-shrink-0">
              (unsaved)
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => {
              setEditing(!editing);
              if (!editing) setTimeout(() => editorRef.current?.focus(), 0);
            }}
            style={{ padding: "2px 12px" }}
            className={`flex items-center gap-1.5 text-sm border rounded-lg transition-all ${
              editing
                ? "text-accent bg-accent/15 border-accent"
                : "text-text-2 border-border-2 hover:border-accent hover:text-accent"
            }`}
            title={editing ? "Switch to preview" : "Switch to edit"}
          >
            <Pencil size={13} /> {editing ? "Editing" : "Edit"}
          </button>
          {docId && (
            <a
              href={`https://docs.google.com/document/d/${docId}/edit`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ padding: "2px 12px" }}
              className="flex items-center gap-1.5 text-sm text-text-2 border border-border-2 rounded-lg hover:border-accent hover:text-accent transition-all"
              title="Open in Google Docs"
            >
              <ExternalLink size={13} /> Open in Docs
            </a>
          )}
          {/* Template button */}
          <button
            onClick={handleApplyTemplate}
            disabled={applyingTemplate}
            style={{ padding: "2px 12px" }}
            className="flex items-center gap-1.5 text-sm text-text-2 border border-border-2 rounded-lg hover:border-accent hover:text-accent transition-all disabled:opacity-50"
            title="Reformat note structure with AI (words preserved)"
          >
            {applyingTemplate ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <LayoutTemplate size={12} />
            )}{" "}
            Format
          </button>
          {canUndoFormat && (
            <button
              onClick={handleUndoFormat}
              style={{ padding: "2px 12px" }}
              className="flex items-center gap-1.5 text-sm text-warning border border-warning/40 rounded-lg hover:bg-warning/10 transition-all"
              title="Undo last format"
            >
              <Undo2 size={12} /> Undo
            </button>
          )}
          <button
            onClick={handleAISummarize}
            disabled={summarizing}
            style={{ padding: "2px 12px" }}
            className="flex items-center gap-1.5 text-sm text-text-2 border border-border-2 rounded-lg hover:border-accent hover:text-accent transition-all disabled:opacity-50"
          >
            {summarizing ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Sparkles size={12} />
            )}{" "}
            Summarize
          </button>
          <button
            onClick={refreshDoc}
            className="w-8 h-8 flex items-center justify-center text-text-2 border border-border-2 rounded-lg hover:border-accent hover:text-accent transition-all"
            title="Refresh from Google Docs"
          >
            <RefreshCw size={13} />
          </button>
          <button
            onClick={saveDoc}
            disabled={saving}
            className="w-8 h-8 flex items-center justify-center text-text-2 border border-border-2 rounded-lg hover:border-success hover:text-success transition-all disabled:opacity-50"
            title="Save now"
          >
            {saving ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Save size={13} />
            )}
          </button>
        </div>
      </div>

      {/* Editor / Preview */}
      {editing ? (
        <textarea
          ref={editorRef}
          className="flex-1 resize-none px-10 py-8 font-mono leading-[1.9] text-text bg-bg outline-none placeholder:text-text-3"
          style={{
            fontSize: `${state.pageSettings.notes.fontSize ?? 15}px`,
          }}
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
            setDirty(true);
            scheduleAutoSave();
          }}
          placeholder="Start writing… your notes are saved to Google Docs."
          spellCheck
        />
      ) : (
        <div
          className="flex-1 overflow-y-auto px-10 py-8 notes-markdown cursor-text"
          style={{
            fontSize: `${state.pageSettings.notes.fontSize ?? 15}px`,
          }}
          onClick={() => {
            setEditing(true);
            setTimeout(() => editorRef.current?.focus(), 0);
          }}
        >
          {content ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          ) : (
            <p className="text-text-3 italic">
              Click to start writing… your notes are saved to Google Docs.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
