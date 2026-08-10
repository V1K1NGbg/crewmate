"use client";

import {
  Children,
  cloneElement,
  isValidElement,
  useState,
  useEffect,
  useRef,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
} from "react";
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
import { useApp } from "@crewmate/state";
import { aiChat, useDialogFocus } from "@crewmate/lib";
import type { NotePrefill } from "@crewmate/types";
import { useNotes, docToAppNotes } from "./useNotes";
import { DEFAULT_NOTES_SETTINGS, type NotesPluginSettings } from "./settings";
import { appendCategorizedNote } from "./categorizedNotes";
import { setMarkdownTaskChecked } from "./markdownTasks";

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

function makeTaskCheckboxInteractive(
  children: ReactNode,
  onCheckedChange: (checked: boolean) => void,
): ReactNode {
  return Children.map(children, (child) => {
    if (!isValidElement<{ children?: ReactNode }>(child)) return child;

    if (child.type === "input") {
      const input = child as ReactElement<
        InputHTMLAttributes<HTMLInputElement>,
        "input"
      >;
      if (input.props.type !== "checkbox") return child;

      return cloneElement(input, {
        disabled: false,
        onClick: (event) => event.stopPropagation(),
        onChange: (event) => onCheckedChange(event.target.checked),
        title: input.props.checked ? "Mark incomplete" : "Mark complete",
      });
    }

    if (child.props.children === undefined) return child;
    return cloneElement(
      child,
      undefined,
      makeTaskCheckboxInteractive(child.props.children, onCheckedChange),
    );
  });
}

export default function NotesPage() {
  const { state, dispatch, notify } = useApp();
  const { data: session, status: sessionStatus } = useSession();
  const notes = useNotes();
  const {
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
  } = notes;

  const [summarizing, setSummarizing] = useState(false);
  const [applyingTemplate, setApplyingTemplate] = useState(false);
  const [editing, setEditing] = useState(false);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const lastContentRef = useRef<string | null>(null);
  const [canUndoFormat, setCanUndoFormat] = useState(false);
  const conflictDialogRef = useDialogFocus(conflict);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notesSettings =
    (state.pageSettings.features.notes as NotesPluginSettings | undefined) ??
    DEFAULT_NOTES_SETTINGS;

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

  useEffect(() => {
    // Authentication is external state; initialize the remote document once available.
    if (sessionStatus === "authenticated" && session?.googleAuthStatus === "ready") initDoc();
  }, [sessionStatus, session?.googleAuthStatus, initDoc]);

  useEffect(() => {
    dispatch({
      type: "SET_FEATURE_DATA",
      featureId: "notes",
      data: docToAppNotes(docId, docTitle, content),
    });
  }, [docId, docTitle, content, dispatch]);

  const notePrefill = state.pagePrefills.notes as NotePrefill | undefined;

  useEffect(() => {
    if (!notePrefill || !docId) return;
    const { title, content: prefillContent, category, reviewOrigin } = notePrefill;
    dispatch({ type: "CLEAR_PAGE_PREFILL", pageId: "notes" });
    const timestamp = new Date().toLocaleString();
    if (category) {
      updateContent(
        appendCategorizedNote(content, category, title, prefillContent || "", timestamp),
      );
    } else {
      const addition = `\n\n## ${title}\n\n> Added on ${timestamp}\n\n${prefillContent || ""}\n`;
      appendContent(addition);
    }
    notify("Content appended from prefill", "success");
    if (reviewOrigin) {
      dispatch({
        type: "SET_PAGE_PREFILL",
        pageId: "mail",
        prefill: { reviewCompletedThreadId: reviewOrigin.threadId },
      });
      dispatch({ type: "SET_ACTIVE_PAGE", id: "mail" });
    }
  }, [notePrefill, docId, dispatch, appendContent, updateContent, content, notify]);

  useEffect(() => {
    const interval = state.pageSettings.general.autoRefreshInterval;
    if (!interval || !docId) return;
    const id = setInterval(refreshDoc, interval * 1000);
    return () => clearInterval(id);
  }, [state.pageSettings.general.autoRefreshInterval, refreshDoc, docId]);

  async function handleAISummarize() {
    if (!state.aiServerAvailable) {
      notify("AI server not available", "error");
      return;
    }
    setSummarizing(true);
    try {
      const prompt = `Summarize the following note concisely in 2-4 sentences. Return ONLY the summary text, no preamble, no markdown headers.\n\n---\n${content.slice(0, 4000)}`;
      const summary = await aiChat(
        state.aiServerUrl,
        prompt,
        state.assistantModel || undefined,
      );
      const timestamp = new Date().toLocaleString();
      appendContent(
        `\n\n---\n\n### Summary\n\n> Generated on ${timestamp}\n\n${summary}\n`,
      );
      notify("Summary appended", "success");
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : "Summarize failed", "error");
    } finally {
      setSummarizing(false);
    }
  }

  async function handleApplyTemplate() {
    if (!state.aiServerAvailable) {
      notify("AI server not available", "error");
      return;
    }
    setApplyingTemplate(true);
    try {
      const prompt = NOTE_TEMPLATE_PROMPT(content.slice(0, 6000));
      const result = await aiChat(
        state.aiServerUrl,
        prompt,
        state.assistantModel || undefined,
      );
      lastContentRef.current = content;
      updateContent(result);
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
    updateContent(lastContentRef.current);
    lastContentRef.current = null;
    setCanUndoFormat(false);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    notify("Format undone", "info");
  }

  const markdownComponents = {
    li: ({ node, children, ...props }: React.ComponentPropsWithoutRef<"li"> & {
      node?: { position?: { start: { line: number } } };
    }) => {
      const lineNumber = node?.position?.start.line;
      const interactiveChildren = makeTaskCheckboxInteractive(
        children,
        (checked) => {
          if (!lineNumber) return;
          updateContent(setMarkdownTaskChecked(content, lineNumber, checked));
        },
      );

      return <li {...props}>{interactiveChildren}</li>;
    },
    a: ({ node, ...props }: React.ComponentPropsWithoutRef<"a"> & {
      node?: unknown;
    }) => {
      void node;
      return (
        <a
          {...props}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(event) => event.stopPropagation()}
        />
      );
    },
  };

  if (sessionStatus !== "authenticated" || session?.googleAuthStatus !== "ready" || initError) {
    const isUnauthorized =
      sessionStatus !== "authenticated" || session?.googleAuthStatus !== "ready" ||
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
            <button
              type="button"
              onClick={() => window.location.assign("/api/auth/signout")}
              className="w-full flex items-center justify-center px-4 py-2.5 bg-accent text-white text-sm font-semibold rounded-lg hover:bg-accent-hover transition-all"
            >
              Sign out &amp; re-authenticate
            </button>
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
      {conflict && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="notes-conflict-title"
        >
          <div ref={conflictDialogRef} tabIndex={-1} className="w-full max-w-md rounded-xl border border-border-2 bg-surface p-5 shadow-2xl">
            <h2 id="notes-conflict-title" className="text-sm font-semibold text-text">
              This note changed in Google Docs
            </h2>
            <p className="mt-2 text-sm text-text-2">
              Crewmate kept your local draft and did not overwrite the newer remote version.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button className="rounded-lg border border-border-2 px-3 py-2 text-sm text-text-2" onClick={() => void resolveConflict(false)}>
                Reload remote
              </button>
              <button className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white" onClick={() => void resolveConflict(true)}>
                Copy local draft, then reload
              </button>
            </div>
          </div>
        </div>
      )}
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
            fontSize: `${notesSettings.fontSize ?? 15}px`,
          }}
          value={content}
          onChange={(e) => updateContent(e.target.value)}
          placeholder="Start writing… your notes are saved to Google Docs."
          spellCheck
        />
      ) : (
        <div
          className="flex-1 overflow-y-auto px-10 py-8 notes-markdown cursor-text"
          style={{
            fontSize: `${notesSettings.fontSize ?? 15}px`,
          }}
          onClick={() => {
            setEditing(true);
            setTimeout(() => editorRef.current?.focus(), 0);
          }}
        >
          <div className="notes-markdown-content">
            {content ? (
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={markdownComponents}
              >
                {content}
              </ReactMarkdown>
            ) : (
              <p className="text-text-3 italic">
                Click to start writing… your notes are saved to Google Docs.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
