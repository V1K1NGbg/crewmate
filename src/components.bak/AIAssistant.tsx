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
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useApp } from "@/context/AppContext";
import { opencodeChat, detectOpencodeServer } from "@/lib/opencode";
import type { AssistantMessage } from "@/types";

function buildPageContext(state: ReturnType<typeof useApp>["state"]): string {
    const page = state.pages.find((p) => p.id === state.activePage);
    const lines: string[] = [
        `Current page: ${page?.label ?? state.activePage} (${page?.type ?? "unknown"})`,
        `Total pages: ${state.pages.map((p) => p.label).join(", ")}`,
    ];

    // Gmail threads
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

    // Calendar events
    if (state.calendarEvents.length > 0) {
        lines.push(
            `\n--- Calendar Events (${state.calendarEvents.length}) ---`,
        );
        for (const e of state.calendarEvents.slice(0, 15)) {
            const start = e.start.dateTime ?? e.start.date ?? "";
            const loc = e.location ? ` @ ${e.location}` : "";
            lines.push(`• ${e.summary} — ${start}${loc}`);
            if (e.description) lines.push(`  ${e.description.slice(0, 150)}`);
        }
        if (state.calendarEvents.length > 15)
            lines.push(`  …and ${state.calendarEvents.length - 15} more`);
    }

    // Notes — include titles and content snippets
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

    // Tasks — include full details with subtasks
    if (state.tasks.length > 0) {
        const pending = state.tasks.filter((t) => t.status !== "done").length;
        lines.push(
            `\n--- Tasks (${state.tasks.length}, ${pending} pending) ---`,
        );
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

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [state.assistantMessages]);

    // Do NOT autofocus the input

    const sendMessage = useCallback(async () => {
        const text = input.trim();
        if (!text || loading) return;

        const userMsg: AssistantMessage = {
            id: crypto.randomUUID(),
            role: "user",
            content: text,
            timestamp: new Date().toISOString(),
        };
        dispatch({ type: "ADD_ASSISTANT_MESSAGE", message: userMsg });
        setInput("");
        setLoading(true);

        try {
            const context = buildPageContext(state);
            const fullPrompt = `[App Context]\n${context}\n\n[User Message]\n${text}`;
            const response = await opencodeChat(
                state.opencodeUrl,
                fullPrompt,
                state.assistantModel || undefined,
            );

            const assistantMsg: AssistantMessage = {
                id: crypto.randomUUID(),
                role: "assistant",
                content: response,
                timestamp: new Date().toISOString(),
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
            };
            dispatch({ type: "ADD_ASSISTANT_MESSAGE", message: errorMsg });
        } finally {
            setLoading(false);
        }
    }, [input, loading, state, dispatch, notify]);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={() =>
                dispatch({ type: "SET_OPENCODE_OVERLAY_OPEN", open: false })
            }
        >
            <div
                className="flex flex-col bg-[#0d1117] border border-[#21262d] rounded-2xl shadow-2xl overflow-hidden"
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
                <div className="h-14 flex items-center justify-between px-6 border-b border-[#21262d] flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <Bot size={20} className="text-[#58a6ff]" />
                        <span className="text-base font-semibold text-[#e6edf3]">
                            AI Assistant
                        </span>
                    </div>
                    <div className="flex gap-1.5">
                        <button
                            onClick={async () => {
                                const url = await detectOpencodeServer(
                                    state.opencodeUrl,
                                );
                                dispatch({
                                    type: "SET_OPENCODE_AVAILABLE",
                                    available: !!url,
                                });
                            }}
                            className="w-9 h-9 flex items-center justify-center text-[#484f58] hover:text-[#c9d1d9] hover:bg-[#161b22] rounded-lg transition-colors"
                            title="Reconnect to server"
                        >
                            <RefreshCw size={18} />
                        </button>
                        <button
                            onClick={() =>
                                dispatch({ type: "CLEAR_ASSISTANT_MESSAGES" })
                            }
                            className="w-9 h-9 flex items-center justify-center text-[#484f58] hover:text-[#c9d1d9] hover:bg-[#161b22] rounded-lg transition-colors"
                            title="Clear chat"
                        >
                            <Trash2 size={18} />
                        </button>
                        <button
                            onClick={() =>
                                dispatch({
                                    type: "SET_OPENCODE_OVERLAY_OPEN",
                                    open: false,
                                })
                            }
                            className="w-9 h-9 flex items-center justify-center text-[#484f58] hover:text-[#c9d1d9] hover:bg-[#161b22] rounded-lg transition-colors"
                            title="Close (Esc)"
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* Messages */}
                {!state.opencodeAvailable ? (
                    <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
                        <div className="w-14 h-14 rounded-2xl bg-[#161b22] border border-[#21262d] flex items-center justify-center">
                            <AlertCircle size={32} className="text-[#d29922]" />
                        </div>
                        <div>
                            <p className="text-base font-semibold text-[#e6edf3] mb-1">
                                opencode not detected
                            </p>
                            <p className="text-base text-[#8b949e] leading-relaxed">
                                Run{" "}
                                <code className="bg-[#161b22] border border-[#30363d] px-1.5 py-0.5 rounded text-sm font-mono text-[#79c0ff]">
                                    opencode web --port 4096
                                </code>{" "}
                                in your project directory
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
                        {state.assistantMessages.length === 0 && (
                            <div className="flex flex-col items-center justify-center h-full text-center gap-3.5 opacity-60">
                                <Bot size={40} className="text-[#30363d]" />
                                <p className="text-base text-[#484f58]">
                                    Ask me anything about your workflow
                                </p>
                                <p className="text-base text-[#30363d]">
                                    I can see your current page, notes, and
                                    tasks
                                </p>
                            </div>
                        )}
                        {state.assistantMessages.map((msg) => (
                            <div
                                key={msg.id}
                                className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                            >
                                {msg.role === "assistant" && (
                                    <div className="w-8 h-8 rounded-lg bg-[#1f4a7a] flex items-center justify-center flex-shrink-0 mt-0.5">
                                        <Bot
                                            size={16}
                                            className="text-[#58a6ff]"
                                        />
                                    </div>
                                )}
                                <div
                                    className={`max-w-[85%] rounded-2xl px-5 py-3 text-base leading-relaxed ${
                                        msg.role === "user"
                                            ? "bg-[#1f6feb] text-white rounded-br-md whitespace-pre-wrap"
                                            : "bg-[#161b22] text-[#e6edf3] border border-[#21262d] rounded-bl-md"
                                    }`}
                                >
                                    {msg.role === "assistant" ? (
                                        <div className="assistant-markdown">
                                            <ReactMarkdown
                                                remarkPlugins={[remarkGfm]}
                                            >
                                                {msg.content}
                                            </ReactMarkdown>
                                        </div>
                                    ) : (
                                        msg.content
                                    )}
                                </div>
                                {msg.role === "user" && (
                                    <div className="w-8 h-8 rounded-lg bg-[#21262d] flex items-center justify-center flex-shrink-0 mt-0.5">
                                        <User
                                            size={16}
                                            className="text-[#8b949e]"
                                        />
                                    </div>
                                )}
                            </div>
                        ))}
                        {loading && (
                            <div className="flex gap-3 items-start">
                                <div className="w-8 h-8 rounded-lg bg-[#1f4a7a] flex items-center justify-center flex-shrink-0">
                                    <Bot size={16} className="text-[#58a6ff]" />
                                </div>
                                <div className="bg-[#161b22] border border-[#21262d] rounded-2xl rounded-bl-md px-5 py-3.5">
                                    <Loader2
                                        size={18}
                                        className="animate-spin text-[#58a6ff]"
                                    />
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>
                )}

                {/* Input */}
                {state.opencodeAvailable && (
                    <div className="p-5 border-t border-[#21262d]">
                        <div className="flex gap-2.5 items-end">
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
                                className="flex-1 bg-[#161b22] border border-[#30363d] rounded-xl px-5 py-3.5 text-base text-[#e6edf3] outline-none focus:border-[#58a6ff] transition-colors resize-none placeholder:text-[#484f58]"
                                style={{
                                    maxHeight: 130,
                                    height: "auto",
                                    minHeight: 48,
                                }}
                                disabled={loading}
                            />
                            <button
                                onClick={sendMessage}
                                disabled={loading || !input.trim()}
                                className="w-11 h-11 flex items-center justify-center bg-[#1f6feb] text-white rounded-xl hover:bg-[#388bfd] disabled:opacity-40 disabled:hover:bg-[#1f6feb] transition-colors flex-shrink-0"
                            >
                                <Send size={18} />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
