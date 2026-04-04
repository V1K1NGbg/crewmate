"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Search,
  RefreshCw,
  Trash2,
  Reply,
  Send,
  X,
  Loader2,
  Inbox,
  Pencil,
  Sparkles,
  Archive,
  CalendarPlus,
  CheckSquare,
  FileText,
  Wand2,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { format } from "date-fns";
import { useSession, signIn } from "next-auth/react";
import { useApp } from "@/context/AppContext";
import { useGmail, type GmailMessage } from "@/hooks/useGmail";
import { opencodeChat } from "@/lib/opencode";
import { useResizable } from "@/lib/useResizable";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type AIActionType =
  | "archive"
  | "create_event"
  | "create_task"
  | "add_to_notes"
  | "reply_draft"
  | "mark_important";

interface AIAction {
  type: AIActionType;
  label: string;
  description?: string;
  payload?: {
    title?: string;
    description?: string;
    dateHint?: string;
    startHint?: string;
    endHint?: string;
    replyDraft?: string;
  };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return format(d, "h:mm a");
    if (d.getFullYear() === now.getFullYear()) return format(d, "MMM d");
    return format(d, "MMM d, yyyy");
  } catch {
    return dateStr;
  }
}

function extractName(from: string): string {
  const match = from.match(/^"?([^"<]+)"?\s*</);
  return match ? match[1].trim() : from.replace(/<.*>/, "").trim();
}

function extractEmail(from: string): string {
  const match = from.match(/<([^>]+)>/);
  return match ? match[1] : from;
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2000);
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2)
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

const ACTION_STYLES: Record<
  AIActionType,
  { icon: React.ReactNode; color: string; bg: string; border: string }
> = {
  archive: {
    icon: <Archive size={14} />,
    color: "#a1a1aa",
    bg: "rgba(63,63,70,0.15)",
    border: "#3f3f46",
  },
  create_event: {
    icon: <CalendarPlus size={14} />,
    color: "#818cf8",
    bg: "rgba(129,140,248,0.08)",
    border: "rgba(129,140,248,0.3)",
  },
  create_task: {
    icon: <CheckSquare size={14} />,
    color: "#4ade80",
    bg: "rgba(74,222,128,0.08)",
    border: "rgba(74,222,128,0.3)",
  },
  add_to_notes: {
    icon: <FileText size={14} />,
    color: "#fbbf24",
    bg: "rgba(251,191,36,0.08)",
    border: "rgba(251,191,36,0.3)",
  },
  reply_draft: {
    icon: <Wand2 size={14} />,
    color: "#c4b5fd",
    bg: "rgba(196,181,253,0.08)",
    border: "rgba(196,181,253,0.3)",
  },
  mark_important: {
    icon: <Sparkles size={14} />,
    color: "#fafafa",
    bg: "rgba(63,63,70,0.15)",
    border: "#3f3f46",
  },
};

/* ------------------------------------------------------------------ */
/* Email body renderer                                                 */
/* ------------------------------------------------------------------ */

const EMAIL_STYLES = `
  *, *::before, *::after { box-sizing: border-box; }
  html { margin: 0; padding: 0; background: #ffffff; }
  body {
    margin: 0; padding: 0; background: #ffffff; color: #1a1a1a;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-size: 15px; line-height: 1.6; overflow-x: hidden; word-break: break-word; overflow-wrap: break-word;
  }
  a { color: #6366f1 !important; }
  img { max-width: 100%; height: auto; display: block; }
  p { margin: 0 0 0.85em; } p:last-child { margin-bottom: 0; }
  blockquote { border-left: 3px solid #d0d7de; margin: 0.5em 0 0.85em; padding: 0.3em 0.8em; color: #57606a; }
  pre, code { font-family: ui-monospace, monospace; font-size: 0.9em; }
  pre { white-space: pre-wrap; word-break: break-word; background: #f6f8fa; padding: 0.75em; border-radius: 4px; }
  table { border-collapse: collapse; max-width: 100%; } td, th { padding: 6px 10px; }
  hr { border-color: #d0d7de; }
`;

function EmailBody({ body, snippet }: { body: string; snippet: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const isHtml = /<[a-z][\s\S]*>/i.test(body);

  function handleLoad() {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const resize = () => {
      try {
        const doc = iframe.contentDocument;
        if (!doc) return;
        iframe.style.height = "0px";
        const h = Math.max(
          doc.documentElement.scrollHeight,
          doc.body?.scrollHeight ?? 0,
          80,
        );
        iframe.style.height = `${h}px`;
      } catch {
        iframe.style.height = "400px";
      }
    };
    resize();
    setTimeout(resize, 300);
  }

  if (!isHtml) {
    return (
      <pre className="text-sm text-text whitespace-pre-wrap font-sans leading-relaxed">
        {body || snippet}
      </pre>
    );
  }

  const srcDoc = `<!DOCTYPE html><html><head><meta charset="utf-8"><base target="_blank"><style>${EMAIL_STYLES}</style></head><body>${body}</body></html>`;

  return (
    <iframe
      ref={iframeRef}
      srcDoc={srcDoc}
      className="w-full border-none block"
      style={{ minHeight: 80, display: "block" }}
      onLoad={handleLoad}
      sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin"
      title="Email body"
      scrolling="no"
    />
  );
}

/* ------------------------------------------------------------------ */
/* Sub-components                                                      */
/* ------------------------------------------------------------------ */

function FullPageLoader({ label }: { label: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 bg-bg">
      <Loader2 size={28} className="animate-spin text-accent" />
      <span className="text-sm text-text-2">{label}</span>
    </div>
  );
}

function GoogleSignInPrompt({ reason }: { reason: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 p-10 bg-bg">
      <div className="flex flex-col items-center gap-6 p-8 bg-surface border border-border-2 rounded-2xl shadow-2xl w-96">
        <div className="w-14 h-14 bg-accent/10 border border-accent/20 rounded-2xl flex items-center justify-center">
          <Inbox size={24} className="text-accent" />
        </div>
        <div className="flex flex-col items-center gap-2">
          <h2 className="text-base font-semibold text-text">
            Sign in to Gmail
          </h2>
          <p className="text-sm text-text-3 text-center leading-relaxed">
            {reason}
          </p>
        </div>
        <button
          onClick={() => signIn("google", { callbackUrl: "/app" })}
          className="w-full flex items-center justify-center gap-3 py-3 bg-surface-2 border border-border-2 text-text text-sm font-semibold rounded-lg hover:border-accent hover:text-accent transition-colors"
        >
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M23.745 12.27c0-.79-.07-1.54-.19-2.27h-11.3v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
            />
            <path
              fill="#34A853"
              d="M12.255 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96h-3.98v3.09C3.515 21.3 7.615 24 12.255 24z"
            />
            <path
              fill="#FBBC05"
              d="M5.525 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62h-3.98a11.86 11.86 0 000 10.76l3.98-3.09z"
            />
            <path
              fill="#EA4335"
              d="M12.255 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C18.205 1.19 15.495 0 12.255 0c-4.64 0-8.74 2.7-10.71 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"
            />
          </svg>
          Sign in with Google
        </button>
        <p className="text-xs text-text-3 text-center">
          Grants access to Gmail &amp; Google Calendar
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main Component                                                      */
/* ------------------------------------------------------------------ */

export default function GmailPage() {
  const { state, dispatch, notify } = useApp();
  const { status: sessionStatus } = useSession();
  const gmail = useGmail();

  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<GmailMessage[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [authError, setAuthError] = useState(false);
  const [query, setQuery] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const [composeOpen, setComposeOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<GmailMessage | null>(null);
  const [composeTo, setComposeTo] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [aiActions, setAiActions] = useState<AIAction[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [expandedAction, setExpandedAction] = useState<number | null>(null);
  const aiCacheRef = useRef<Map<string, AIAction[]>>(new Map());

  const threadListResize = useResizable({
    side: "right",
    initial: state.panelWidths.gmailThreadList ?? 380,
    min: 260,
    max: 560,
    onResize: (w) =>
      dispatch({
        type: "SET_PANEL_WIDTH",
        key: "gmailThreadList",
        width: w,
      }),
  });
  const aiSidebarResize = useResizable({
    side: "left",
    initial: state.panelWidths.gmailAiSidebar ?? 300,
    min: 240,
    max: 500,
    onResize: (w) =>
      dispatch({
        type: "SET_PANEL_WIDTH",
        key: "gmailAiSidebar",
        width: w,
      }),
  });

  const activeThread =
    gmail.threads.find((t) => t.id === activeThreadId) ?? null;

  useEffect(() => {
    dispatch({ type: "SET_GMAIL_THREADS", threads: gmail.threads });
  }, [gmail.threads, dispatch]);

  useEffect(() => {
    const q = query || "in:inbox";
    gmail.fetchThreads(q).catch(() => setAuthError(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  useEffect(() => {
    const interval = state.pageSettings.general.autoRefreshInterval;
    if (!interval) return;
    const id = setInterval(() => {
      gmail.fetchThreads(query || "in:inbox").catch(() => {});
    }, interval * 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.pageSettings.general.autoRefreshInterval, query]);

  async function openThread(id: string) {
    setActiveThreadId(id);
    setAiError("");
    setExpandedAction(null);
    setThreadLoading(true);
    const cached = aiCacheRef.current.get(id);
    if (cached) setAiActions(cached);
    else setAiActions([]);
    try {
      const msgs = await gmail.fetchThread(id);
      if (!msgs) return;
      setMessages(msgs);
      gmail.setThreads((prev) =>
        prev.map((x) => (x.id === id ? { ...x, unread: false } : x)),
      );
      if (!cached && state.opencodeAvailable && msgs.length > 0)
        generateAIActions(id, msgs);
    } finally {
      setThreadLoading(false);
    }
  }

  async function generateAIActions(threadId: string, msgs: GmailMessage[]) {
    setAiLoading(true);
    setAiError("");
    try {
      const latest = msgs[msgs.length - 1];
      const bodyText = latest.body.includes("<")
        ? stripHtml(latest.body)
        : latest.body.slice(0, 2000);
      const prompt = `Analyze the following email and suggest helpful actions. Return a JSON array of actions that would genuinely help the user manage this email.

Each action must have:
- "type": one of archive, create_event, create_task, add_to_notes, reply_draft, mark_important
- "label": short label (≤6 words)
- "description": 1-2 sentences explaining what this action will do and why it's useful
- Optional "payload": object with title, description, dateHint (YYYY-MM-DD), startHint (ISO 8601 datetime e.g. 2024-03-15T14:00:00), endHint (ISO 8601 datetime e.g. 2024-03-15T15:00:00), replyDraft fields as appropriate

Guidelines:
- Suggest create_event if the email mentions any meeting, appointment, call, or event with a date/time
- Suggest create_task if the email contains any task, assignment, deadline, or action item
- Suggest add_to_notes if the email has useful information to reference later
- Suggest reply_draft if a reply would be appropriate
- Suggest archive if the email is informational and doesn't need action
- Suggest mark_important sparingly - only for truly important emails

For create_event actions, extract any dates/times mentioned. Use startHint/endHint for datetime, dateHint for date-only.

Return ONLY valid JSON, no markdown fences.

From: ${latest.from}
Subject: ${latest.subject}
Date: ${latest.date}
Body: ${bodyText}

Example: [{"type":"create_event","label":"Schedule meeting","description":"Creates a calendar event for the meeting mentioned on March 15th with the project team.","payload":{"title":"Team Meeting","description":"Discuss Q1 results","dateHint":"2024-03-15","startHint":"2024-03-15T14:00:00","endHint":"2024-03-15T15:00:00"}}]`;
      const response = await opencodeChat(
        state.opencodeUrl,
        prompt,
        state.pageSettings.gmail.suggestionModel ||
          state.assistantModel ||
          undefined,
      );
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error("No JSON in response");
      const parsed: AIAction[] = JSON.parse(jsonMatch[0]);
      const actions = parsed
        .filter(
          (a) =>
            a.type && a.label && Object.keys(ACTION_STYLES).includes(a.type),
        )
        .slice(0, 6);
      setAiActions(actions);
      aiCacheRef.current.set(threadId, actions);
    } catch (err: unknown) {
      setAiError(err instanceof Error ? err.message : "AI analysis failed");
    } finally {
      setAiLoading(false);
    }
  }

  function executeAction(action: AIAction) {
    switch (action.type) {
      case "archive":
        if (activeThread) handleArchive(activeThread.id);
        break;
      case "create_event":
        dispatch({
          type: "SET_CALENDAR_PREFILL",
          prefill: {
            title:
              action.payload?.title ?? activeThread?.subject ?? "Email event",
            description: action.payload?.description,
            dateHint: action.payload?.dateHint,
            startHint: action.payload?.startHint,
            endHint: action.payload?.endHint,
          },
        });
        dispatch({ type: "SET_ACTIVE_PAGE", id: "calendar" });
        notify("Navigated to Calendar — event pre-filled", "info");
        break;
      case "create_task":
        dispatch({
          type: "SET_TASK_PREFILL",
          prefill: {
            title:
              action.payload?.title ?? activeThread?.subject ?? "Email task",
            description:
              action.payload?.description ?? activeThread?.snippet ?? "",
            dueDate: action.payload?.dateHint,
          },
        });
        dispatch({ type: "SET_ACTIVE_PAGE", id: "tasks" });
        notify("Navigated to Tasks — task pre-filled", "info");
        break;
      case "add_to_notes": {
        const latestMsg = messages[messages.length - 1];
        const emailBody = latestMsg
          ? latestMsg.body.includes("<")
            ? stripHtml(latestMsg.body)
            : latestMsg.body
          : (activeThread?.snippet ?? "");
        dispatch({
          type: "SET_NOTE_PREFILL",
          prefill: {
            title:
              action.payload?.title ?? activeThread?.subject ?? "Email note",
            content: action.payload?.description ?? emailBody,
          },
        });
        dispatch({ type: "SET_ACTIVE_PAGE", id: "notes" });
        notify("Navigated to Notes — note pre-filled", "info");
        break;
      }
      case "reply_draft":
        if (messages.length) {
          openReply(messages[messages.length - 1]);
          if (action.payload?.replyDraft)
            setComposeBody(action.payload.replyDraft);
        }
        break;
      case "mark_important":
        notify("Marked as important", "success");
        break;
    }
  }

  async function handleArchive(id: string, e?: React.MouseEvent) {
    e?.stopPropagation();
    await gmail.archiveThread(id);
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    if (activeThreadId === id) {
      setActiveThreadId(null);
      aiCacheRef.current.delete(id);
      setAiActions([]);
    }
  }

  async function handleTrash(id: string, e?: React.MouseEvent) {
    e?.stopPropagation();
    await gmail.trashThread(id);
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    if (activeThreadId === id) {
      setActiveThreadId(null);
      aiCacheRef.current.delete(id);
      setAiActions([]);
    }
  }

  async function bulkArchive() {
    await Promise.all([...selected].map((id) => handleArchive(id)));
    setSelected(new Set());
  }
  async function bulkTrash() {
    await Promise.all([...selected].map((id) => handleTrash(id)));
    setSelected(new Set());
  }

  function toggleSelect(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleSelectAll() {
    setSelected(
      selected.size === gmail.threads.length
        ? new Set()
        : new Set(gmail.threads.map((t) => t.id)),
    );
  }

  function openReply(msg: GmailMessage) {
    setReplyTo(msg);
    setComposeTo(msg.from);
    setComposeSubject(
      msg.subject.startsWith("Re:") ? msg.subject : `Re: ${msg.subject}`,
    );
    setComposeBody("");
    setComposeOpen(true);
  }

  function openCompose() {
    setReplyTo(null);
    setComposeTo("");
    setComposeSubject("");
    setComposeBody("");
    setComposeOpen(true);
  }

  async function handleSend() {
    if (!composeTo || !composeSubject || !composeBody) {
      setSendError("To, subject, and body are required.");
      return;
    }
    setSending(true);
    setSendError("");
    const ok = await gmail.sendEmail({
      to: composeTo,
      subject: composeSubject,
      body: composeBody,
      threadId: replyTo?.threadId,
      inReplyTo: replyTo?.id,
    });
    setSending(false);
    if (ok) setComposeOpen(false);
    else setSendError("Failed to send");
  }

  /* ── Render ───────────────────────────────────────────────────── */

  if (sessionStatus === "unauthenticated")
    return (
      <GoogleSignInPrompt reason="You need to sign in with Google to access your Gmail inbox." />
    );
  if (authError)
    return (
      <GoogleSignInPrompt reason="Your Google session has expired. Sign in again to continue." />
    );
  if (gmail.loading && gmail.threads.length === 0)
    return <FullPageLoader label="Loading inbox…" />;

  return (
    <div className="flex flex-1 overflow-hidden bg-bg relative">
      {/* Thread list sidebar */}
      {sidebarVisible && (
        <aside
          className="flex-shrink-0 flex flex-col border-r border-border bg-bg overflow-hidden relative"
          style={{ width: threadListResize.width }}
        >
          {/* Toolbar */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
            <button
              onClick={() => setSidebarVisible(false)}
              className="text-text-2 hover:text-text w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface-2 transition-colors flex-shrink-0"
              title="Hide sidebar"
            >
              <PanelLeftClose size={16} />
            </button>
            <div className="flex-1 flex items-center gap-2 bg-surface border border-border-2 rounded-lg px-3 py-2 focus-within:border-accent transition-colors">
              <Search size={14} className="text-text-3 flex-shrink-0" />
              <input
                className="flex-1 bg-transparent text-text text-sm outline-none placeholder:text-text-3"
                placeholder="Search mail..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") setQuery(searchInput);
                }}
              />
            </div>
            <button
              onClick={() => gmail.fetchThreads(query || "in:inbox")}
              className="w-8 h-8 flex items-center justify-center text-text-2 hover:text-text hover:bg-surface-2 rounded-lg transition-colors"
              title="Refresh"
            >
              {gmail.loading ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <RefreshCw size={14} />
              )}
            </button>
            <button
              onClick={openCompose}
              className="w-8 h-8 flex items-center justify-center text-text-2 hover:text-accent hover:bg-surface-2 rounded-lg transition-colors"
              title="Compose"
            >
              <Pencil size={14} />
            </button>
          </div>

          {/* Filter pills */}
          <div className="flex gap-1.5 px-4 py-2.5 border-b border-border">
            {["in:inbox", "is:unread", "is:starred", "in:sent"].map((q) => (
              <button
                key={q}
                onClick={() => {
                  setQuery(q);
                  setSearchInput("");
                  setSelected(new Set());
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                  query === q || (!query && q === "in:inbox")
                    ? "bg-accent/15 text-accent"
                    : "text-text-2 hover:text-text hover:bg-surface-2"
                }`}
              >
                {q.replace("in:", "").replace("is:", "")}
              </button>
            ))}
          </div>

          {/* Bulk actions */}
          {selected.size > 0 && (
            <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-surface">
              <span className="text-xs text-text-2 flex-1">
                {selected.size} selected
              </span>
              <button
                onClick={bulkArchive}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-text-2 hover:text-text hover:bg-surface-2 rounded-lg transition-colors"
              >
                <Archive size={12} /> Archive
              </button>
              <button
                onClick={bulkTrash}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-text-2 hover:text-danger hover:bg-surface-2 rounded-lg transition-colors"
              >
                <Trash2 size={12} /> Trash
              </button>
              <button
                onClick={() => setSelected(new Set())}
                className="text-text-3 hover:text-text-2 p-1 rounded-lg hover:bg-surface-2 transition-colors"
              >
                <X size={12} />
              </button>
            </div>
          )}

          {/* Select all */}
          {gmail.threads.length > 0 && (
            <div
              className="flex items-center gap-3 px-4 py-2 border-b border-border cursor-pointer hover:bg-surface transition-colors"
              onClick={toggleSelectAll}
            >
              <div
                className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 transition-all ${
                  selected.size === gmail.threads.length &&
                  gmail.threads.length > 0
                    ? "bg-accent border-accent"
                    : selected.size > 0
                      ? "bg-accent/50 border-accent"
                      : "border-text-3"
                }`}
              >
                {(selected.size === gmail.threads.length ||
                  selected.size > 0) && (
                  <svg
                    width="8"
                    height="8"
                    viewBox="0 0 8 8"
                    fill="none"
                    className="text-white"
                  >
                    {selected.size === gmail.threads.length ? (
                      <path
                        d="M1 4l2 2 4-4"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
                    ) : (
                      <path
                        d="M1 4h6"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
                    )}
                  </svg>
                )}
              </div>
              <span className="text-xs text-text-3">Select all</span>
            </div>
          )}

          {/* Thread list */}
          <div className="flex-1 overflow-y-auto">
            {gmail.threads.length === 0 && !gmail.loading ? (
              <div className="flex flex-col items-center justify-center p-12 text-text-3 gap-3">
                <Inbox size={36} />
                <span className="text-sm">No messages</span>
              </div>
            ) : (
              gmail.threads.map((t) => (
                <div
                  key={t.id}
                  onClick={() => openThread(t.id)}
                  className={`px-4 py-3 cursor-pointer border-b border-border/50 transition-colors group relative ${
                    activeThreadId === t.id
                      ? "bg-accent/10 border-l-2 border-l-accent"
                      : selected.has(t.id)
                        ? "bg-accent/5"
                        : "hover:bg-surface"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      onClick={(e) => toggleSelect(t.id, e)}
                      className={`mt-0.5 w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center cursor-pointer transition-all ${
                        selected.has(t.id)
                          ? "bg-accent border-accent"
                          : "border-text-3 opacity-0 group-hover:opacity-100"
                      }`}
                    >
                      {selected.has(t.id) && (
                        <svg
                          width="8"
                          height="8"
                          viewBox="0 0 8 8"
                          fill="none"
                          className="text-white"
                        >
                          <path
                            d="M1 4l2 2 4-4"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                          />
                        </svg>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2 mb-0.5">
                        <span
                          className={`text-sm truncate ${t.unread ? "font-semibold text-text" : "font-medium text-text-2"}`}
                        >
                          {extractName(t.from)}
                        </span>
                        <span className="text-xs text-text-3 flex-shrink-0 pr-8">
                          {formatDate(t.date)}
                        </span>
                      </div>
                      <div
                        className={`text-sm truncate mb-0.5 ${t.unread ? "font-medium text-text" : "text-text-2"}`}
                      >
                        {t.subject}
                      </div>
                      <div className="flex items-center gap-1.5">
                        {t.unread && (
                          <div className="w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" />
                        )}
                        <div className="text-xs text-text-3 truncate">
                          {t.snippet}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="absolute right-2 top-2.5 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity bg-surface border border-border-2 rounded-lg p-0.5 shadow-sm">
                    <button
                      onClick={(e) => handleArchive(t.id, e)}
                      className="p-1 text-text-3 hover:text-text-2 hover:bg-surface-2 rounded transition-colors"
                      title="Archive"
                    >
                      <Archive size={13} />
                    </button>
                    <button
                      onClick={(e) => handleTrash(t.id, e)}
                      className="p-1 text-text-3 hover:text-danger hover:bg-surface-2 rounded transition-colors"
                      title="Trash"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
          <div
            className="resize-handle"
            style={{ right: 0 }}
            onMouseDown={threadListResize.onMouseDown}
          />
        </aside>
      )}
      {!sidebarVisible && (
        <div className="w-10 flex-shrink-0 flex flex-col items-center pt-3 border-r border-border bg-bg">
          <button
            onClick={() => setSidebarVisible(true)}
            className="text-text-2 hover:text-text w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface-2 transition-colors"
            title="Show sidebar"
          >
            <PanelLeftOpen size={16} />
          </button>
        </div>
      )}

      {/* Reading pane */}
      <main className="flex-1 flex overflow-hidden min-w-0">
        {threadLoading ? (
          <FullPageLoader label="Loading conversation…" />
        ) : !activeThread ? (
          <div className="flex-1 flex flex-col items-center justify-center text-text-3 gap-4">
            <div className="w-20 h-20 rounded-xl bg-surface border border-border flex items-center justify-center">
              <Inbox size={36} />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-text-2">
                Select a conversation
              </p>
              <p className="text-xs text-text-3 mt-1">
                Choose an email from the sidebar
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 overflow-hidden min-w-0">
            <div className="flex flex-col flex-1 overflow-hidden min-w-0">
              {/* Thread header */}
              <div className="flex items-center gap-4 px-6 py-3.5 border-b border-border bg-bg flex-shrink-0">
                <div className="flex-1 min-w-0">
                  <h2 className="text-base font-semibold text-text truncate">
                    {messages[0]?.subject ?? activeThread.subject}
                  </h2>
                  <p className="text-xs text-text-3 mt-0.5">
                    {messages.length} message
                    {messages.length !== 1 ? "s" : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleArchive(activeThread.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-text-2 border border-border-2 rounded-lg hover:border-success hover:text-success transition-all"
                  >
                    <Archive size={14} /> Archive
                  </button>
                  <button
                    onClick={() => openReply(messages[messages.length - 1])}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-all"
                  >
                    <Reply size={14} /> Reply
                  </button>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto">
                <div className="px-6 py-5 flex flex-col gap-5">
                  {messages.map((msg, idx) => (
                    <div
                      key={msg.id}
                      className="bg-surface border border-border-2 rounded-xl overflow-hidden"
                    >
                      <div className="flex items-start justify-between gap-4 px-5 py-3.5">
                        <div className="flex items-start gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-full bg-surface-2 flex items-center justify-center flex-shrink-0 text-xs font-bold text-text-2">
                            {getInitials(extractName(msg.from))}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-text">
                              {extractName(msg.from)}
                            </div>
                            <div className="text-xs text-text-2 mt-0.5">
                              {extractEmail(msg.from)}
                            </div>
                            <div className="text-xs text-text-3 mt-0.5">
                              To: {msg.to}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-xs text-text-3">
                            {formatDate(msg.date)}
                          </span>
                          <button
                            onClick={() => openReply(msg)}
                            className="text-text-3 hover:text-accent p-1.5 rounded-lg hover:bg-surface-2 transition-colors"
                            title="Reply"
                          >
                            <Reply size={14} />
                          </button>
                        </div>
                      </div>
                      <div className="h-px bg-border" />
                      <div className="px-6 py-5 overflow-hidden">
                        <EmailBody body={msg.body} snippet={msg.snippet} />
                      </div>
                      {idx === messages.length - 1 && (
                        <div className="px-5 pb-4">
                          <button
                            onClick={() => openReply(msg)}
                            className="flex items-center gap-2 w-full px-4 py-2.5 border border-border-2 rounded-lg text-sm text-text-3 hover:border-accent hover:text-accent transition-all text-left"
                          >
                            <Reply size={14} /> Reply to {extractName(msg.from)}
                            ...
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* AI actions sidebar */}
            <aside
              className="flex-shrink-0 flex flex-col border-l border-border/50 bg-bg/40 overflow-hidden relative"
              style={{ width: aiSidebarResize.width }}
            >
              <div
                className="resize-handle"
                style={{ left: 0 }}
                onMouseDown={aiSidebarResize.onMouseDown}
              />
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border/50">
                <Sparkles size={13} className="text-accent" />
                <span className="text-xs font-semibold text-text-2 uppercase tracking-wide">
                  Suggestions
                </span>
                {aiLoading && (
                  <Loader2
                    size={11}
                    className="animate-spin text-text-3 ml-auto"
                  />
                )}
              </div>
              {(state.pageSettings.gmail.suggestionModel ||
                state.assistantModel) && (
                <div className="px-4 py-1.5 border-b border-border/50">
                  <span className="text-xs font-mono text-text-3">
                    model:{" "}
                    {(
                      state.pageSettings.gmail.suggestionModel ||
                      state.assistantModel
                    )
                      .split("/")
                      .pop()}
                  </span>
                </div>
              )}
              <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
                {!state.opencodeAvailable ? (
                  <div className="flex flex-col items-center justify-center gap-3 py-8 px-3 text-center">
                    <Sparkles size={20} className="text-text-3" />
                    <p className="text-xs text-text-3 leading-relaxed">
                      OpenCode not connected.
                      <br />
                      Press{" "}
                      <kbd className="bg-surface-2 border border-border-2 rounded px-1 text-xs">
                        O
                      </kbd>{" "}
                      to configure.
                    </p>
                  </div>
                ) : aiLoading ? (
                  <div className="flex flex-col items-center justify-center gap-3 py-8 text-text-3">
                    <Loader2 size={20} className="animate-spin" />
                    <span className="text-xs">Analysing…</span>
                  </div>
                ) : aiError ? (
                  <div className="flex flex-col gap-2 py-4 px-1">
                    <p className="text-xs text-danger leading-relaxed">
                      {aiError}
                    </p>
                    <button
                      onClick={() =>
                        messages.length &&
                        activeThreadId &&
                        generateAIActions(activeThreadId, messages)
                      }
                      className="text-xs text-accent hover:underline text-left"
                    >
                      Retry
                    </button>
                  </div>
                ) : aiActions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-3 py-8 px-3 text-center">
                    <Sparkles size={20} className="text-text-3" />
                    <p className="text-xs text-text-3">No actions needed.</p>
                    <button
                      onClick={() =>
                        messages.length &&
                        activeThreadId &&
                        generateAIActions(activeThreadId, messages)
                      }
                      className="flex items-center gap-1.5 text-xs text-accent hover:underline"
                    >
                      <Sparkles size={12} /> Re-analyse
                    </button>
                  </div>
                ) : (
                  aiActions.map((action, i) => {
                    const style = ACTION_STYLES[action.type];
                    const isExpanded = expandedAction === i;
                    const hasDetails = action.description || action.payload;
                    return (
                      <div
                        key={i}
                        className="flex flex-col rounded-lg border transition-all overflow-hidden"
                        style={{
                          borderColor: style.border,
                          backgroundColor: style.bg,
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => executeAction(action)}
                            className="flex items-center gap-2 flex-1 px-3 py-2 text-left text-sm font-medium transition-all hover:opacity-90 min-w-0"
                            style={{
                              color: style.color,
                            }}
                          >
                            <span className="flex-shrink-0">{style.icon}</span>
                            <span className="truncate">{action.label}</span>
                          </button>
                          {hasDetails && (
                            <button
                              onClick={() =>
                                setExpandedAction(isExpanded ? null : i)
                              }
                              className="flex-shrink-0 p-1.5 mr-1.5 rounded hover:bg-white/5 transition-colors"
                              style={{
                                color: style.color,
                              }}
                              title={
                                isExpanded ? "Hide details" : "Show details"
                              }
                            >
                              {isExpanded ? (
                                <ChevronUp size={12} />
                              ) : (
                                <ChevronDown size={12} />
                              )}
                            </button>
                          )}
                        </div>
                        {isExpanded && hasDetails && (
                          <div className="px-3 pb-2.5 pt-0 flex flex-col gap-1.5 border-t border-white/5">
                            {action.description && (
                              <p className="text-xs text-text-2 leading-relaxed mt-1.5">
                                {action.description}
                              </p>
                            )}
                            {action.payload?.title && (
                              <div className="text-xs text-text-3">
                                <span className="font-semibold">Title:</span>{" "}
                                {action.payload.title}
                              </div>
                            )}
                            {action.payload?.dateHint && (
                              <div className="text-xs text-text-3">
                                <span className="font-semibold">Date:</span>{" "}
                                {action.payload.dateHint}
                              </div>
                            )}
                            {action.payload?.description && (
                              <div className="text-xs text-text-3">
                                <span className="font-semibold">
                                  Description:
                                </span>{" "}
                                {action.payload.description}
                              </div>
                            )}
                            {action.payload?.replyDraft && (
                              <div className="text-xs text-text-3">
                                <span className="font-semibold">Draft:</span>{" "}
                                {action.payload.replyDraft.slice(0, 120)}
                                {action.payload.replyDraft.length > 120
                                  ? "…"
                                  : ""}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
                {aiActions.length > 0 && !aiLoading && (
                  <button
                    onClick={() =>
                      messages.length &&
                      activeThreadId &&
                      generateAIActions(activeThreadId, messages)
                    }
                    className="flex items-center gap-1.5 justify-center w-full mt-1 py-2 text-xs text-text-3 hover:text-text-2 border border-border-2 rounded-lg transition-colors"
                  >
                    <RefreshCw size={11} /> Re-analyse
                  </button>
                )}
              </div>
            </aside>
          </div>
        )}
      </main>

      {/* Compose modal */}
      {composeOpen && (
        <div
          className="absolute bottom-0 right-4 w-[520px] bg-surface border border-border-2 rounded-t-xl shadow-2xl z-50 flex flex-col"
          style={{
            maxHeight: "calc(100vh - 60px)",
            animation: "slideUpLocal 0.2s ease-out both",
          }}
        >
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
            <span className="text-sm font-semibold text-text">
              {replyTo
                ? `Reply to ${extractName(replyTo.from)}`
                : "New Message"}
            </span>
            <button
              onClick={() => setComposeOpen(false)}
              className="text-text-3 hover:text-text p-1.5 rounded-lg hover:bg-surface-2 transition-colors"
            >
              <X size={14} />
            </button>
          </div>
          <div className="flex flex-col flex-1 overflow-hidden p-4 gap-3">
            <input
              className="w-full bg-bg border border-border-2 rounded-lg px-4 py-2.5 text-sm text-text outline-none focus:border-accent placeholder:text-text-3 transition-colors"
              placeholder="To"
              value={composeTo}
              onChange={(e) => setComposeTo(e.target.value)}
            />
            <input
              className="w-full bg-bg border border-border-2 rounded-lg px-4 py-2.5 text-sm text-text outline-none focus:border-accent placeholder:text-text-3 transition-colors"
              placeholder="Subject"
              value={composeSubject}
              onChange={(e) => setComposeSubject(e.target.value)}
            />
            <textarea
              className="flex-1 bg-bg border border-border-2 rounded-lg px-4 py-2.5 text-sm text-text outline-none focus:border-accent resize-none placeholder:text-text-3 transition-colors leading-relaxed"
              placeholder="Write your message..."
              value={composeBody}
              onChange={(e) => setComposeBody(e.target.value)}
              rows={10}
            />
            {sendError && <p className="text-sm text-danger">{sendError}</p>}
            <button
              onClick={handleSend}
              disabled={sending}
              className="flex items-center justify-center gap-2 w-full py-2.5 bg-accent text-white text-sm font-semibold rounded-lg hover:bg-accent-hover transition-all disabled:opacity-50"
            >
              {sending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Send size={14} />
              )}
              {sending ? "Sending..." : "Send"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
