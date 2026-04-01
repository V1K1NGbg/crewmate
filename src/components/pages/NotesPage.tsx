"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
    Save,
    Loader2,
    FileText,
    Sparkles,
    CalendarPlus,
    ExternalLink,
    RefreshCw,
    Pencil,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useSession } from "next-auth/react";
import { useApp } from "@/context/AppContext";
import { opencodeChat } from "@/lib/opencode";

export default function NotesPage() {
    const { state, dispatch, notify } = useApp();
    const { data: session } = useSession();

    const [docId, setDocId] = useState<string | null>(null);
    const [docTitle, setDocTitle] = useState("");
    const [content, setContent] = useState("");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [summarizing, setSummarizing] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [editing, setEditing] = useState(false);
    const [initError, setInitError] = useState<string | null>(null);
    const editorRef = useRef<HTMLTextAreaElement>(null);
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
                throw new Error(
                    initData.error ?? "Failed to initialize document",
                );
            setDocId(initData.documentId);
            docIdRef.current = initData.documentId;
            setDocTitle(initData.title);

            const contentRes = await fetch(
                `/api/docs/content?id=${encodeURIComponent(initData.documentId)}`,
            );
            const contentData = await contentRes.json();
            if (!contentRes.ok)
                throw new Error(
                    contentData.error ?? "Failed to load document content",
                );
            setContent(contentData.content ?? "");
        } catch (err: unknown) {
            const msg =
                err instanceof Error
                    ? err.message
                    : "Failed to load Google Doc";
            setInitError(msg);
        } finally {
            setLoading(false);
        }
    }, []);

    const refreshDoc = useCallback(async () => {
        const id = docIdRef.current;
        if (!id) return;
        // Don't overwrite unsaved local changes
        if (dirtyRef.current) return;
        try {
            const res = await fetch(
                `/api/docs/content?id=${encodeURIComponent(id)}`,
            );
            if (!res.ok) return;
            const data = await res.json();
            setContent(data.content ?? "");
        } catch {
            // silent refresh failure
        }
    }, []);

    useEffect(() => {
        if (session?.accessToken) initDoc();
    }, [session?.accessToken]); // eslint-disable-line react-hooks/exhaustive-deps

    // Consume notePrefill — append to doc
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

    // Auto-refresh
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
            const appended = `${content}\n\n---\n\n### Summary\n\n> Generated on ${timestamp}\n\n${summary}\n`;
            setContent(appended);
            setDirty(true);
            scheduleAutoSave();
            notify("Summary appended", "success");
        } catch (err: unknown) {
            notify(
                err instanceof Error ? err.message : "Summarize failed",
                "error",
            );
        } finally {
            setSummarizing(false);
        }
    }

    function handleAddToCalendar() {
        dispatch({
            type: "SET_CALENDAR_PREFILL",
            prefill: {
                title: docTitle,
                description: content.slice(0, 300) || undefined,
            },
        });
        dispatch({ type: "SET_ACTIVE_PAGE", id: "calendar" });
        notify("Navigated to Calendar — event pre-filled", "info");
    }

    if (!session?.accessToken || initError) {
        const isUnauthorized =
            !session?.accessToken ||
            initError?.toLowerCase().includes("unauthorized");
        return (
            <div className="flex-1 flex flex-col items-center justify-center gap-6 bg-[#0d1117] p-12">
                <div className="flex flex-col items-center gap-5 p-8 bg-[#161b22] border border-[#30363d] rounded-2xl max-w-sm w-full">
                    <div className="w-14 h-14 bg-[#21262d] rounded-xl flex items-center justify-center">
                        <FileText size={28} className="text-[#484f58]" />
                    </div>
                    <div className="flex flex-col items-center gap-2 text-center">
                        <h2 className="text-lg font-semibold text-[#f0f6fc]">
                            {isUnauthorized
                                ? "Re-authentication required"
                                : "Could not load Notes"}
                        </h2>
                        <p className="text-sm text-[#8b949e] leading-relaxed">
                            {isUnauthorized
                                ? "Sign out and sign back in to grant access to Google Docs."
                                : (initError ??
                                  "An unexpected error occurred.")}
                        </p>
                    </div>
                    {isUnauthorized ? (
                        <a
                            href="/api/auth/signout"
                            className="w-full flex items-center justify-center px-4 py-2.5 bg-[#58a6ff] text-white text-sm font-semibold rounded-lg hover:bg-[#388bfd] transition-all"
                        >
                            Sign out &amp; re-authenticate
                        </a>
                    ) : (
                        <button
                            onClick={initDoc}
                            className="w-full flex items-center justify-center px-4 py-2.5 bg-[#21262d] border border-[#30363d] text-[#f0f6fc] text-sm font-medium rounded-lg hover:border-[#58a6ff] hover:text-[#58a6ff] transition-all"
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
            <div className="flex-1 flex items-center justify-center bg-[#0d1117]">
                <div className="flex items-center gap-3 text-[#8b949e] text-sm">
                    <Loader2
                        size={18}
                        className="animate-spin text-[#58a6ff]"
                    />
                    Loading Google Doc…
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-1 flex-col overflow-hidden bg-[#0d1117]">
            {/* Toolbar */}
            <div className="flex items-center gap-3 px-6 py-4 border-b border-[#21262d] bg-[#0d1117] flex-shrink-0">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    <FileText
                        size={18}
                        className="text-[#58a6ff] flex-shrink-0"
                    />
                    <span className="text-lg font-semibold text-[#f0f6fc] truncate">
                        {docTitle}
                    </span>
                    {dirty && (
                        <span className="text-xs text-[#d29922] flex-shrink-0">
                            (unsaved)
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2.5 flex-shrink-0">
                    <button
                        onClick={() => {
                            setEditing(!editing);
                            if (!editing)
                                setTimeout(() => editorRef.current?.focus(), 0);
                        }}
                        className={`flex items-center gap-1.5 px-4 py-2 text-sm border rounded-lg transition-all ${editing ? "text-[#58a6ff] bg-[#1f4a7a] border-[#58a6ff]" : "text-[#8b949e] border-[#30363d] hover:border-[#58a6ff] hover:text-[#58a6ff] hover:bg-[#58a6ff]/5"}`}
                        title={editing ? "Switch to preview" : "Switch to edit"}
                    >
                        <Pencil size={14} />
                        {editing ? "Editing" : "Edit"}
                    </button>
                    {docId && (
                        <a
                            href={`https://docs.google.com/document/d/${docId}/edit`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 px-4 py-2 text-sm text-[#8b949e] border border-[#30363d] rounded-lg hover:border-[#58a6ff] hover:text-[#58a6ff] hover:bg-[#58a6ff]/5 transition-all"
                            title="Open in Google Docs"
                        >
                            <ExternalLink size={14} />
                            Open in Docs
                        </a>
                    )}
                    <button
                        onClick={handleAddToCalendar}
                        className="flex items-center gap-1.5 px-4 py-2 text-sm text-[#8b949e] border border-[#30363d] rounded-lg hover:border-[#7ee787] hover:text-[#7ee787] hover:bg-[#7ee787]/5 transition-all"
                        title="Create calendar event from notes"
                    >
                        <CalendarPlus size={14} />
                        Calendar
                    </button>
                    <button
                        onClick={handleAISummarize}
                        disabled={summarizing}
                        className="flex items-center gap-1.5 px-4 py-2 text-sm text-[#8b949e] border border-[#30363d] rounded-lg hover:border-[#58a6ff] hover:text-[#58a6ff] hover:bg-[#58a6ff]/5 transition-all disabled:opacity-50"
                    >
                        {summarizing ? (
                            <Loader2 size={12} className="animate-spin" />
                        ) : (
                            <Sparkles size={12} />
                        )}
                        Summarize
                    </button>
                    <button
                        onClick={refreshDoc}
                        className="w-9 h-9 flex items-center justify-center text-[#8b949e] border border-[#30363d] rounded-lg hover:border-[#58a6ff] hover:text-[#58a6ff] hover:bg-[#58a6ff]/5 transition-all"
                        title="Refresh from Google Docs"
                    >
                        <RefreshCw size={14} />
                    </button>
                    <button
                        onClick={saveDoc}
                        disabled={saving}
                        className="w-9 h-9 flex items-center justify-center text-[#8b949e] border border-[#30363d] rounded-lg hover:border-[#7ee787] hover:text-[#7ee787] hover:bg-[#7ee787]/5 transition-all disabled:opacity-50"
                        title="Save now"
                    >
                        {saving ? (
                            <Loader2 size={14} className="animate-spin" />
                        ) : (
                            <Save size={14} />
                        )}
                    </button>
                </div>
            </div>

            {/* Unified Editor / Preview */}
            {editing ? (
                <textarea
                    ref={editorRef}
                    className="flex-1 resize-none px-10 py-8 font-mono leading-[1.9] text-[#e6edf3] bg-[#0d1117] outline-none placeholder:text-[#484f58]"
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
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {content}
                        </ReactMarkdown>
                    ) : (
                        <p className="text-[#484f58] italic">
                            Click to start writing… your notes are saved to
                            Google Docs.
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}
