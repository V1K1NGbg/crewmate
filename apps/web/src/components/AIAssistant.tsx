"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
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
  Navigation,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { buildAssistantSessionMemory, useApp } from "@crewmate/state";
import { aiChat, detectAIServer } from "@crewmate/lib";
import type { AssistantMessage, AssistantSession, AssistantAction } from "@crewmate/types";
import { PLUGINS, getPlugin } from "@/plugins/registry";

/** Assistant actions contributed by every currently-enabled plugin. */
function enabledActionDefs(state: ReturnType<typeof useApp>["state"]) {
  return PLUGINS.filter((p) => state.pages.some((pg) => pg.type === p.id)).flatMap(
    (p) => (p.assistantActions ?? []).map((def) => ({ plugin: p, def })),
  );
}

function actionIcon(actionType: string): React.ReactNode {
  if (actionType === "navigate") return <Navigation size={15} />;
  for (const p of PLUGINS) {
    const def = p.assistantActions?.find((a) => a.type === actionType);
    if (def) {
      const Icon = def.icon;
      return <Icon size={15} />;
    }
  }
  return null;
}

function buildActionsSystemSuffix(
  state: ReturnType<typeof useApp>["state"],
): string {
  const entries = enabledActionDefs(state);
  const supported = ["navigate", ...entries.map(({ def }) => def.type)];
  const exampleActions = entries.map(({ def }) => def.promptHint).join(",");
  const examplePage = state.pages[0];
  const navigateHint = examplePage
    ? `{"type":"navigate","label":"Go to ${examplePage.label}","payload":{"pageId":"${examplePage.id}"}}`
    : '{"type":"navigate","label":"Go to a page","payload":{"pageId":"..."}}';

  return `

At the end of your response, you MAY optionally append a JSON block of actions if the user's request implies creating, viewing, or navigating to something. Format:
\`\`\`actions
[${exampleActions ? exampleActions + "," : ""}${navigateHint}]
\`\`\`
Supported action types: ${supported.join(", ")} (navigate takes a pageId).
Only include the actions block when it genuinely helps, and only use action types from the supported list above — other menus are currently disabled. Never include it for conversational replies.`;
}

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

  for (const pg of state.pages) {
    const plugin = getPlugin(pg.type);
    if (!plugin?.buildAssistantContext) continue;
    const text = plugin.buildAssistantContext(state.featureData[plugin.id]);
    if (text) lines.push(text);
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
  const messages = useMemo(
    () => activeSession?.messages ?? [],
    [activeSession?.messages],
  );

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

  function deleteSession(sessionId: string) {
    dispatch({ type: "DELETE_ASSISTANT_SESSION", sessionId });
  }

  function clearCurrentSession() {
    dispatch({ type: "CLEAR_ASSISTANT_MESSAGES" });
  }

  function executeAction(action: AssistantAction) {
    if (action.type === "navigate") {
      const targetPageId = action.payload?.pageId as string | undefined;
      if (targetPageId && !state.pages.some((p) => p.id === targetPageId)) {
        notify("That page isn't available.", "error");
        return;
      }
      if (targetPageId) {
        dispatch({ type: "SET_ACTIVE_PAGE", id: targetPageId });
        dispatch({ type: "SET_AI_OVERLAY_OPEN", open: false });
      }
      return;
    }

    const page = state.pages.find((pg) =>
      getPlugin(pg.type)?.assistantActions?.some((a) => a.type === action.type),
    );
    const plugin = page ? getPlugin(page.type) : undefined;
    const actionDef = plugin?.assistantActions?.find(
      (a) => a.type === action.type,
    );
    if (!page || !plugin || !actionDef) {
      notify(
        "That action isn't available — enable the related page in Settings.",
        "error",
      );
      return;
    }

    if (actionDef.buildPrefill) {
      dispatch({
        type: "SET_PAGE_PREFILL",
        pageId: plugin.id,
        prefill: actionDef.buildPrefill(action.payload),
      });
    }
    dispatch({ type: "SET_ACTIVE_PAGE", id: page.id });
    dispatch({ type: "SET_AI_OVERLAY_OPEN", open: false });
    notify(
      `Navigated to ${plugin.label}${actionDef.buildPrefill ? " — pre-filled" : ""}`,
      "info",
    );
  }

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || loading || !state.activeSessionId) return;
    const sessionId = state.activeSessionId;
    const requestSession = state.assistantSessions.find((session) => session.id === sessionId);

    const userMsg: AssistantMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
      sessionId,
    };
    dispatch({ type: "ADD_ASSISTANT_MESSAGE", message: userMsg });
    setInput("");
    setLoading(true);

    try {
      const context = buildPageContext(state);
      const memory = buildAssistantSessionMemory(requestSession);
      const fullPrompt = `[App Context]\n${context}${
        memory ? `\n\n[Conversation Memory]\n${memory}` : ""
      }\n\n[User Message]\n${text}${buildActionsSystemSuffix(state)}`;
      const rawResponse = await aiChat(
        state.aiServerUrl,
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
        sessionId,
      };
      dispatch({ type: "ADD_ASSISTANT_MESSAGE", message: assistantMsg });
    } catch {
      notify("Failed to get AI response", "error");
      const errorMsg: AssistantMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content:
          "Sorry, I couldn't process that request. Make sure your AI server is running and has a model loaded.",
        timestamp: new Date().toISOString(),
        sessionId,
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
        dispatch({ type: "SET_AI_OVERLAY_OPEN", open: false })
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
                const available = await detectAIServer(state.aiServerUrl);
                dispatch({
                  type: "SET_AI_SERVER_AVAILABLE",
                  available,
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
                  type: "SET_AI_OVERLAY_OPEN",
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
        {!state.aiServerAvailable ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
            <div className="w-14 h-14 rounded-2xl bg-surface-2 border border-border flex items-center justify-center">
              <AlertCircle size={28} className="text-warning" />
            </div>
            <div>
              <p className="text-sm font-semibold text-text mb-1">
                AI server not detected
              </p>
              <p className="text-sm text-text-2 leading-relaxed">
                Start an OpenAI-compatible server, for example{" "}
                <code className="bg-surface-2 border border-border-2 px-1.5 py-0.5 rounded text-xs font-mono text-accent">
                  llama-server --port 8080
                </code>{" "}
                with a model loaded
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
                  <div
                    key={session.id}
                    className={`group flex w-full items-center text-sm transition-colors ${
                      session.id === state.activeSessionId
                        ? "bg-surface-2 text-text"
                        : "text-text-2 hover:text-text hover:bg-surface/50"
                    }`}
                  >
                    <button
                      onClick={() => switchSession(session.id)}
                      className="flex min-w-0 flex-1 items-center gap-2 py-2 pl-3 text-left"
                    >
                      <MessageSquare size={14} className="flex-shrink-0" />
                      <span className="truncate flex-1">
                        {session.messages.length === 0
                          ? session.title
                          : generateTitle(session)}
                      </span>
                    </button>
                    <button
                      onClick={() => deleteSession(session.id)}
                      className="mr-2 p-1 text-text-3 opacity-0 transition-all hover:text-danger focus:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100"
                      aria-label={`Delete ${generateTitle(session)}`}
                      title="Delete conversation"
                    >
                      <X size={12} />
                    </button>
                  </div>
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
                            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border transition-all hover:opacity-90"
                            style={{
                              color: "var(--color-accent)",
                              borderColor:
                                "color-mix(in srgb, var(--color-accent) 30%, transparent)",
                              backgroundColor:
                                "color-mix(in srgb, var(--color-accent) 8%, transparent)",
                            }}
                          >
                            {actionIcon(action.type)}
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
        {state.aiServerAvailable && (
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
