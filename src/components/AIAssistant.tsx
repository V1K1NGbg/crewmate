"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  X,
  Send,
  RefreshCw,
  AlertCircle,
  Trash2,
  Loader2,
  Bot,
  User,
  Plus,
  MessageSquare,
  CalendarPlus,
  CheckSquare,
  ExternalLink,
  Navigation,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useApp } from "@/context/AppContext";
import { opencodeChat, detectOpencodeServer } from "@/lib/opencode";
import type {
  AssistantMessage,
  AssistantSession,
  AssistantAction,
} from "@/types";

const ACTION_ICONS: Record<AssistantAction["type"], React.ReactNode> = {
  create_event: <CalendarPlus size={13} />,
  open_event: <ExternalLink size={13} />,
  create_task: <CheckSquare size={13} />,
  navigate: <Navigation size={13} />,
};

const ACTIONS_SYSTEM_SUFFIX = `

At the end of your response, you MAY optionally append a JSON block of actions if the user's request implies creating or viewing something. Format:
\`\`\`actions
[{"type":"create_event","label":"Create event","payload":{"title":"...","startHint":"2024-03-15T14:00:00","endHint":"2024-03-15T15:00:00","description":"..."}},{"type":"open_event","label":"View event","payload":{"eventId":"..."}}]
\`\`\`
For multi-day all-day events use dateHint (start date) and endDateHint (end date, inclusive) instead of startHint/endHint.
Supported action types: create_event, open_event, create_task, navigate (with pageId).
Only include the actions block when it genuinely helps. Never include it for conversational replies.`;

function parseActionsFromResponse(raw: string): {
  content: string;
  actions: AssistantAction[];
} {
  const match = raw.match(/```actions\s*([\s\S]*?)```/);
  if (!match) return { content: raw, actions: [] };
  const content = raw.replace(/```actions\s*[\s\S]*?```/, "").trim();
  try {
    const actions: AssistantAction[] = JSON.parse(match[1].trim());
    return { content, actions };
  } catch {
    return { content, actions: [] };
  }
}

function buildPageContext(state: ReturnType<typeof useApp>["state"]): string {
  const page = state.pages.find((p) => p.id === state.activePage);
  const lines: string[] = [
    `Current page: ${page?.label ?? state.activePage} (${page?.type ?? "unknown"})`,
    `Total pages: ${state.pages.map((p) => p.label).join(", ")}`,
  ];

  if (state.gmailThreads.length > 0) {
    lines.push(`\n--- Emails (${state.gmailThreads.length}) ---`);
    for (const t of state.gmailThreads.slice(0, 15)) {
      const unread = t.unread ? " [UNREAD]" : "";
      lines.push(
        `• From: ${t.from} | Subject: ${t.subject}${unread} | ${t.date}`,
      );
      if (t.snippet) lines.push(`  ${t.snippet.slice(0, 150)}`);
    }
    if (state.gmailThreads.length > 15)
      lines.push(`  …and ${state.gmailThreads.length - 15} more`);
  }

  if (state.calendarEvents.length > 0) {
    lines.push(`\n--- Calendar Events (${state.calendarEvents.length}) ---`);
    for (const e of state.calendarEvents.slice(0, 15)) {
      const start = e.start.dateTime ?? e.start.date ?? "";
      const loc = e.location ? ` @ ${e.location}` : "";
      lines.push(`• [id:${e.id}] ${e.summary} — ${start}${loc}`);
      if (e.description) lines.push(`  ${e.description.slice(0, 150)}`);
    }
    if (state.calendarEvents.length > 15)
      lines.push(`  …and ${state.calendarEvents.length - 15} more`);
  }

  if (state.notes.length > 0) {
    lines.push(`\n--- Notes (${state.notes.length}) ---`);
    for (const n of state.notes.slice(0, 10)) {
      const snippet = n.content.replace(/\n/g, " ").slice(0, 200);
      lines.push(
        `• ${n.title}: ${snippet}${n.content.length > 200 ? "…" : ""}`,
      );
    }
    if (state.notes.length > 10)
      lines.push(`  …and ${state.notes.length - 10} more`);
  }

  if (state.tasks.length > 0) {
    const pending = state.tasks.filter((t) => t.status !== "done").length;
    lines.push(`\n--- Tasks (${state.tasks.length}, ${pending} pending) ---`);
    for (const t of state.tasks.slice(0, 15)) {
      let entry = `• [${t.status}] ${t.title} (${t.priority})`;
      if (t.dueDate) entry += ` due:${t.dueDate}`;
      if (t.description) entry += ` — ${t.description}`;
      lines.push(entry);
      for (const s of t.subtasks) {
        lines.push(`  ${s.done ? "☑" : "☐"} ${s.title}`);
      }
    }
    if (state.tasks.length > 15)
      lines.push(`  …and ${state.tasks.length - 15} more`);
  }

  return lines.join("\n");
}

export default function AIAssistant() {
  const { state, dispatch, notify } = useApp();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Get active session and its messages
  const activeSession = state.assistantSessions.find(
    (s) => s.id === state.activeSessionId,
  );
  const messages = activeSession?.messages ?? [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Generate session title from first user message
  function generateTitle(session: AssistantSession): string {
    const firstUserMsg = session.messages.find((m) => m.role === "user");
    if (!firstUserMsg) return "New conversation";
    const preview = firstUserMsg.content.slice(0, 30);
    return preview + (firstUserMsg.content.length > 30 ? "…" : "");
  }

  function createNewSession() {
    const newSession: AssistantSession = {
      id: `session-${Date.now()}`,
      title: "New conversation",
      createdAt: new Date().toISOString(),
      messages: [],
    };
    dispatch({ type: "CREATE_ASSISTANT_SESSION", session: newSession });
  }

  function switchSession(sessionId: string) {
    dispatch({ type: "SET_ACTIVE_ASSISTANT_SESSION", sessionId });
  }

  function deleteSession(sessionId: string, e: React.MouseEvent) {
    e.stopPropagation();
    dispatch({ type: "DELETE_ASSISTANT_SESSION", sessionId });
  }

  function clearCurrentSession() {
    dispatch({ type: "CLEAR_ASSISTANT_MESSAGES" });
  }

  function executeAction(action: AssistantAction) {
    switch (action.type) {
      case "create_event":
        dispatch({
          type: "SET_CALENDAR_PREFILL",
          prefill: {
            title: action.payload?.title ?? "New Event",
            description: action.payload?.description,
            dateHint: action.payload?.dateHint,
            startHint: action.payload?.startHint,
            endHint: action.payload?.endHint,
            endDateHint: action.payload?.endDateHint,
          },
        });
        dispatch({ type: "SET_ACTIVE_PAGE", id: "calendar" });
        dispatch({ type: "SET_OPENCODE_OVERLAY_OPEN", open: false });
        notify("Navigated to Calendar — event pre-filled", "info");
        break;
      case "open_event":
        dispatch({ type: "SET_ACTIVE_PAGE", id: "calendar" });
        dispatch({ type: "SET_OPENCODE_OVERLAY_OPEN", open: false });
        notify("Navigated to Calendar", "info");
        break;
      case "create_task":
        dispatch({
          type: "SET_TASK_PREFILL",
          prefill: {
            title: action.payload?.title ?? "New Task",
            description: action.payload?.description,
            dueDate: action.payload?.dateHint,
          },
        });
        dispatch({ type: "SET_ACTIVE_PAGE", id: "tasks" });
        dispatch({ type: "SET_OPENCODE_OVERLAY_OPEN", open: false });
        notify("Navigated to Tasks — task pre-filled", "info");
        break;
      case "navigate":
        if (action.payload?.pageId) {
          dispatch({ type: "SET_ACTIVE_PAGE", id: action.payload.pageId });
          dispatch({ type: "SET_OPENCODE_OVERLAY_OPEN", open: false });
        }
        break;
    }
  }

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || loading || !state.activeSessionId) return;

    const userMsg: AssistantMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
      sessionId: state.activeSessionId,
    };
    dispatch({ type: "ADD_ASSISTANT_MESSAGE", message: userMsg });
    setInput("");
    setLoading(true);

    try {
      const context = buildPageContext(state);
      const fullPrompt = `[App Context]\n${context}\n\n[User Message]\n${text}${ACTIONS_SYSTEM_SUFFIX}`;
      const rawResponse = await opencodeChat(
        state.opencodeUrl,
        fullPrompt,
        state.assistantModel || undefined,
      );
      const { content, actions } = parseActionsFromResponse(rawResponse);
      const assistantMsg: AssistantMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content,
        actions: actions.length > 0 ? actions : undefined,
        timestamp: new Date().toISOString(),
        sessionId: state.activeSessionId,
      };
      dispatch({ type: "ADD_ASSISTANT_MESSAGE", message: assistantMsg });
    } catch {
      notify("Failed to get AI response", "error");
      const errorMsg: AssistantMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content:
          "Sorry, I couldn't process that request. Make sure the opencode server is running.",
        timestamp: new Date().toISOString(),
        sessionId: state.activeSessionId,
      };
      dispatch({ type: "ADD_ASSISTANT_MESSAGE", message: errorMsg });
    } finally {
      setLoading(false);
    }
  }, [input, loading, state, dispatch, notify]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={() =>
        dispatch({ type: "SET_OPENCODE_OVERLAY_OPEN", open: false })
      }
    >
      <div
        className="flex flex-col bg-surface border border-border-2 rounded-2xl shadow-2xl overflow-hidden"
        style={{
          width: "90%",
          height: "90%",
          maxWidth: 1560,
          maxHeight: 1170,
          animation: "fadeIn 200ms cubic-bezier(0.16,1,0.3,1) both",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="h-14 flex items-center justify-between px-6 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-3">
            <Bot size={18} className="text-accent" />
            <span className="text-sm font-semibold text-text">
              AI Assistant
            </span>
          </div>
          <div className="flex gap-1">
            <button
              onClick={async () => {
                const url = await detectOpencodeServer(state.opencodeUrl);
                dispatch({
                  type: "SET_OPENCODE_AVAILABLE",
                  available: !!url,
                });
              }}
              className="w-8 h-8 flex items-center justify-center text-text-3 hover:text-text hover:bg-surface-2 rounded-lg transition-colors"
              title="Reconnect"
            >
              <RefreshCw size={16} />
            </button>
            <button
              onClick={clearCurrentSession}
              className="w-8 h-8 flex items-center justify-center text-text-3 hover:text-text hover:bg-surface-2 rounded-lg transition-colors"
              title="Clear chat"
            >
              <Trash2 size={16} />
            </button>
            <button
              onClick={() =>
                dispatch({
                  type: "SET_OPENCODE_OVERLAY_OPEN",
                  open: false,
                })
              }
              className="w-8 h-8 flex items-center justify-center text-text-3 hover:text-text hover:bg-surface-2 rounded-lg transition-colors"
              title="Close (Esc)"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Messages */}
        {!state.opencodeAvailable ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
            <div className="w-14 h-14 rounded-2xl bg-surface-2 border border-border flex items-center justify-center">
              <AlertCircle size={28} className="text-warning" />
            </div>
            <div>
              <p className="text-sm font-semibold text-text mb-1">
                opencode not detected
              </p>
              <p className="text-sm text-text-2 leading-relaxed">
                Run{" "}
                <code className="bg-surface-2 border border-border-2 px-1.5 py-0.5 rounded text-xs font-mono text-accent">
                  opencode serve --port 4096
                </code>{" "}
                in your project directory
              </p>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex overflow-hidden">
            {/* Sessions sidebar */}
            <div className="w-56 border-r border-border flex flex-col bg-surface/30">
              <div className="p-3 border-b border-border">
                <button
                  onClick={createNewSession}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-text bg-surface-2 border border-border-2 rounded-lg hover:border-accent hover:text-accent transition-all"
                >
                  <Plus size={14} /> New Chat
                </button>
              </div>
              <div className="flex-1 overflow-y-auto py-2">
                {state.assistantSessions.map((session) => (
                  <button
                    key={session.id}
                    onClick={() => switchSession(session.id)}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors group ${
                      session.id === state.activeSessionId
                        ? "bg-surface-2 text-text"
                        : "text-text-2 hover:text-text hover:bg-surface/50"
                    }`}
                  >
                    <MessageSquare size={14} className="flex-shrink-0" />
                    <span className="truncate flex-1">
                      {session.messages.length === 0
                        ? session.title
                        : generateTitle(session)}
                    </span>
                    {state.assistantSessions.length > 1 && (
                      <button
                        onClick={(e) => deleteSession(session.id, e)}
                        className="opacity-0 group-hover:opacity-100 text-text-3 hover:text-danger transition-all p-1"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Messages area */}
            <div className="flex-1 overflow-y-auto px-6 py-6 flex flex-col gap-6">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center gap-3 opacity-50">
                  <Bot size={36} className="text-border-2" />
                  <p className="text-sm text-text-3">
                    Ask me anything about your workflow
                  </p>
                  <p className="text-xs text-text-3">
                    I can see your emails, calendar, notes, and tasks — and can
                    create events or tasks for you
                  </p>
                </div>
              )}
              {messages.map((msg: AssistantMessage) => (
                <div
                  key={msg.id}
                  className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {msg.role === "assistant" && (
                    <div className="w-7 h-7 rounded-lg bg-accent/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Bot size={14} className="text-accent" />
                    </div>
                  )}
                  <div className="flex flex-col gap-2 max-w-[85%]">
                    <div
                      className={`rounded-2xl text-sm leading-relaxed ${
                        msg.role === "user"
                          ? "bg-accent text-white rounded-br-md whitespace-pre-wrap"
                          : "bg-surface-2 text-text border border-border rounded-bl-md"
                      }`}
                      style={{ padding: "12px 16px" }}
                    >
                      {msg.role === "assistant" ? (
                        <div className="assistant-markdown">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {msg.content}
                          </ReactMarkdown>
                        </div>
                      ) : (
                        msg.content
                      )}
                    </div>
                    {msg.actions && msg.actions.length > 0 && (
                      <div className="flex flex-wrap gap-2 pl-1">
                        {msg.actions.map((action, i) => (
                          <button
                            key={i}
                            onClick={() => executeAction(action)}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all hover:opacity-90"
                            style={{
                              color: "var(--color-accent)",
                              borderColor:
                                "color-mix(in srgb, var(--color-accent) 30%, transparent)",
                              backgroundColor:
                                "color-mix(in srgb, var(--color-accent) 8%, transparent)",
                            }}
                          >
                            {ACTION_ICONS[action.type]}
                            {action.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {msg.role === "user" && (
                    <div className="w-7 h-7 rounded-lg bg-surface-2 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <User size={14} className="text-text-2" />
                    </div>
                  )}
                </div>
              ))}
              {loading && (
                <div className="flex gap-3 items-start">
                  <div className="w-7 h-7 rounded-lg bg-accent/15 flex items-center justify-center flex-shrink-0">
                    <Bot size={14} className="text-accent" />
                  </div>
                  <div className="bg-surface-2 border border-border rounded-2xl rounded-bl-md px-4 py-3">
                    <Loader2 size={16} className="animate-spin text-accent" />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>
        )}

        {/* Input */}
        {state.opencodeAvailable && (
          <label
            className="flex gap-3 items-center bg-surface-2 rounded-xl mx-6 mb-4 cursor-text"
            style={{
              padding: "12px 16px",
              border: "1px solid var(--color-border-2)",
            }}
            onClick={() => inputRef.current?.focus()}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder="Ask anything…"
              rows={1}
              className="flex-1 bg-transparent text-sm text-text placeholder:text-text-3"
              style={{
                minHeight: "28px",
                height: "28px",
                outline: "none",
                border: "none",
                resize: "none",
                padding: 0,
                margin: 0,
              }}
              disabled={loading}
            />
            <button
              onClick={sendMessage}
              disabled={loading || !input.trim()}
              className="w-8 h-8 flex items-center justify-center bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-40 transition-colors flex-shrink-0"
            >
              <Send size={15} />
            </button>
          </label>
        )}
      </div>
    </div>
  );
}
