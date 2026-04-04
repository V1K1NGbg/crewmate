"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
    Plus,
    Trash2,
    CheckSquare,
    Square,
    ChevronDown,
    ChevronRight,
    Sparkles,
    Loader2,
    AlertCircle,
    Clock,
    CalendarPlus,
    Circle,
    ExternalLink,
    RefreshCw,
} from "lucide-react";
import { format } from "date-fns";
import { useSession } from "next-auth/react";
import { useApp } from "@/context/AppContext";
import { opencodeChat } from "@/lib/opencode";

interface GoogleTask {
    id: string;
    title: string;
    notes?: string;
    status: "needsAction" | "completed";
    due?: string;
    updated?: string;
    parent?: string;
}

const FILTER_OPTIONS = ["all", "needsAction", "completed"] as const;
type FilterType = (typeof FILTER_OPTIONS)[number];

export default function TasksPage() {
    const { state, dispatch, notify } = useApp();
    const { data: session } = useSession();

    const [listId, setListId] = useState<string | null>(null);
    const [tasks, setTasks] = useState<GoogleTask[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<FilterType>("all");
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [expandingId, setExpandingId] = useState<string | null>(null);
    const [showNewForm, setShowNewForm] = useState(false);
    const [newTitle, setNewTitle] = useState("");
    const [newNotes, setNewNotes] = useState("");
    const [newDue, setNewDue] = useState("");
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    const [initError, setInitError] = useState<string | null>(null);
    const listIdRef = useRef<string | null>(null);

    const initList = useCallback(async () => {
        setLoading(true);
        setInitError(null);
        try {
            const res = await fetch("/api/tasks/init", { method: "POST" });
            const initData = await res.json();
            if (!res.ok)
                throw new Error(
                    initData.error ?? "Failed to initialize task list",
                );
            setListId(initData.taskListId);
            listIdRef.current = initData.taskListId;

            const itemsRes = await fetch(
                `/api/tasks/items?listId=${encodeURIComponent(initData.taskListId)}`,
            );
            const itemsData = await itemsRes.json();
            if (!itemsRes.ok)
                throw new Error(itemsData.error ?? "Failed to load tasks");
            setTasks(itemsData.items ?? []);
        } catch (err: unknown) {
            const msg =
                err instanceof Error
                    ? err.message
                    : "Failed to load Google Tasks";
            setInitError(msg);
        } finally {
            setLoading(false);
        }
    }, []);

    const refreshTasks = useCallback(async () => {
        const id = listIdRef.current;
        if (!id) return;
        try {
            const res = await fetch(
                `/api/tasks/items?listId=${encodeURIComponent(id)}`,
            );
            if (!res.ok) return;
            const data = await res.json();
            setTasks(data.items ?? []);
        } catch {
            // silent refresh failure
        }
    }, []);

    useEffect(() => {
        if (session?.accessToken) initList();
    }, [session?.accessToken]); // eslint-disable-line react-hooks/exhaustive-deps

    // Consume taskPrefill
    useEffect(() => {
        if (!state.taskPrefill || !listId) return;
        const { title, description, dueDate } = state.taskPrefill;
        dispatch({ type: "CLEAR_TASK_PREFILL" });
        handleCreateTask(title || "Untitled", description, dueDate);
    }, [state.taskPrefill]); // eslint-disable-line react-hooks/exhaustive-deps

    // Auto-refresh
    useEffect(() => {
        const interval = state.pageSettings.general.autoRefreshInterval;
        if (!interval || !listIdRef.current) return;
        const id = setInterval(refreshTasks, interval * 1000);
        return () => clearInterval(id);
    }, [state.pageSettings.general.autoRefreshInterval, refreshTasks, listId]);

    async function handleCreateTask(
        title: string,
        notes?: string,
        due?: string,
    ) {
        if (!listId || !title.trim()) return;
        try {
            const res = await fetch("/api/tasks/items", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    listId,
                    title: title.trim(),
                    notes: notes || undefined,
                    due: due || undefined,
                }),
            });
            if (!res.ok) throw new Error("Failed to create task");
            const { task } = await res.json();
            setTasks((prev) => [task, ...prev]);
            notify("Task created", "success");
        } catch (err: unknown) {
            notify(
                err instanceof Error ? err.message : "Create failed",
                "error",
            );
        }
    }

    async function handleNewTask() {
        await handleCreateTask(newTitle, newNotes, newDue);
        setNewTitle("");
        setNewNotes("");
        setNewDue("");
        setShowNewForm(false);
    }

    async function handleToggleStatus(task: GoogleTask) {
        if (!listId) return;
        const newStatus =
            task.status === "needsAction" ? "completed" : "needsAction";
        try {
            const res = await fetch("/api/tasks/items", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    listId,
                    taskId: task.id,
                    status: newStatus,
                }),
            });
            if (!res.ok) throw new Error("Failed to update task");
            const { task: updated } = await res.json();
            setTasks((prev) =>
                prev.map((t) => (t.id === task.id ? updated : t)),
            );
        } catch (err: unknown) {
            notify(
                err instanceof Error ? err.message : "Update failed",
                "error",
            );
        }
    }

    async function handleDeleteTask(id: string) {
        if (!listId) return;
        try {
            const res = await fetch(
                `/api/tasks/items?listId=${encodeURIComponent(listId)}&taskId=${encodeURIComponent(id)}`,
                { method: "DELETE" },
            );
            if (!res.ok) throw new Error("Failed to delete task");
            setTasks((prev) => prev.filter((t) => t.id !== id));
            notify("Task deleted", "info");
        } catch (err: unknown) {
            notify(
                err instanceof Error ? err.message : "Delete failed",
                "error",
            );
        }
    }

    async function handleAIExpand(task: GoogleTask) {
        if (!state.opencodeAvailable || !listId) {
            notify("opencode server not available", "error");
            return;
        }
        setExpandingId(task.id);
        try {
            const context = task.notes
                ? `Title: ${task.title}\nDescription: ${task.notes}`
                : `Title: ${task.title}`;
            const prompt = `Break down the following task into exactly 5 concrete, actionable subtasks. Return ONLY a plain numbered list (1. ... 2. ... etc.), no markdown headers, no explanation, nothing else.\n\n${context}`;
            const response = await opencodeChat(state.opencodeUrl, prompt);
            const lines = response
                .split("\n")
                .map((l) =>
                    l
                        .replace(/^[\d]+[.)]\s*/, "")
                        .replace(/^[-*]\s*/, "")
                        .trim(),
                )
                .filter(Boolean)
                .slice(0, 5);

            // Create subtasks under the parent task
            for (const line of lines) {
                const res = await fetch("/api/tasks/items", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        listId,
                        title: line,
                        parent: task.id,
                    }),
                });
                if (!res.ok) throw new Error("Failed to create subtask");
            }
            // Refresh to get the updated tree from Google
            await refreshTasks();
            setExpandedId(task.id);
            notify("AI breakdown complete — subtasks added", "success");
        } catch (err: unknown) {
            notify(
                err instanceof Error ? err.message : "AI breakdown failed",
                "error",
            );
        } finally {
            setExpandingId(null);
        }
    }

    function handleAddToCalendar(task: GoogleTask) {
        dispatch({
            type: "SET_CALENDAR_PREFILL",
            prefill: {
                title: task.title,
                description: task.notes,
                dateHint: task.due ? task.due.split("T")[0] : undefined,
            },
        });
        dispatch({ type: "SET_ACTIVE_PAGE", id: "calendar" });
        notify("Navigated to Calendar — event pre-filled", "info");
    }

    function filterLabel(f: FilterType) {
        if (f === "all") return "All";
        if (f === "needsAction") return "Pending";
        return "Done";
    }

    function filterCount(f: FilterType) {
        return f === "all"
            ? tasks.length
            : tasks.filter((t) => t.status === f).length;
    }

    const filtered = tasks.filter(
        (t) => filter === "all" || t.status === filter,
    );

    // Group subtasks under their parent
    const childrenMap = new Map<string, GoogleTask[]>();
    const topLevel: GoogleTask[] = [];
    for (const t of filtered) {
        if (t.parent) {
            const list = childrenMap.get(t.parent) ?? [];
            list.push(t);
            childrenMap.set(t.parent, list);
        } else {
            topLevel.push(t);
        }
    }

    if (!session?.accessToken || initError) {
        const isUnauthorized =
            !session?.accessToken ||
            initError?.toLowerCase().includes("unauthorized");
        return (
            <div className="flex-1 flex flex-col items-center justify-center gap-6 bg-[#0d1117] p-12">
                <div className="flex flex-col items-center gap-5 p-8 bg-[#161b22] border border-[#30363d] rounded-2xl max-w-sm w-full">
                    <div className="w-14 h-14 bg-[#21262d] rounded-xl flex items-center justify-center">
                        <CheckSquare size={28} className="text-[#484f58]" />
                    </div>
                    <div className="flex flex-col items-center gap-2 text-center">
                        <h2 className="text-lg font-semibold text-[#f0f6fc]">
                            {isUnauthorized
                                ? "Re-authentication required"
                                : "Could not load Tasks"}
                        </h2>
                        <p className="text-sm text-[#8b949e] leading-relaxed">
                            {isUnauthorized
                                ? "Sign out and sign back in to grant access to Google Tasks."
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
                            onClick={initList}
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
                    Loading Google Tasks…
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col flex-1 overflow-hidden bg-[#0d1117]">
            {/* Toolbar */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#21262d] bg-[#0d1117] flex-shrink-0">
                <div className="flex gap-2.5">
                    {FILTER_OPTIONS.map((f) => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                                filter === f
                                    ? "text-[#58a6ff] bg-[#1f4a7a] shadow-sm"
                                    : "text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#161b22]"
                            }`}
                        >
                            {filterLabel(f)}
                            <span
                                className={`text-xs px-1.5 py-0.5 rounded-full ${filter === f ? "bg-[#58a6ff]/20 text-[#58a6ff]" : "bg-[#21262d] text-[#484f58]"}`}
                            >
                                {filterCount(f)}
                            </span>
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-2.5">
                    {listId && (
                        <a
                            href="https://tasks.google.com"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 px-4 py-2 text-sm text-[#8b949e] border border-[#30363d] rounded-lg hover:border-[#58a6ff] hover:text-[#58a6ff] hover:bg-[#58a6ff]/5 transition-all"
                            title="Open in Google Tasks"
                        >
                            <ExternalLink size={14} />
                            Open in Tasks
                        </a>
                    )}
                    <button
                        onClick={refreshTasks}
                        className="w-9 h-9 flex items-center justify-center text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#161b22] rounded-lg transition-colors"
                        title="Refresh"
                    >
                        <RefreshCw size={16} />
                    </button>
                    <button
                        onClick={() => setShowNewForm(!showNewForm)}
                        className="flex items-center gap-2 px-4 py-2 bg-[#58a6ff] text-white text-sm font-semibold rounded-lg hover:bg-[#388bfd] transition-all shadow-md shadow-[#58a6ff]/20"
                    >
                        <Plus size={16} /> New task
                    </button>
                </div>
            </div>

            {/* New task form */}
            {showNewForm && (
                <div
                    className="flex flex-col gap-3.5 px-6 py-4 bg-[#161b22] border-b border-[#21262d]"
                    style={{ animation: "slideDown 0.15s ease-out both" }}
                >
                    <input
                        autoFocus
                        className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-4 py-3.5 text-sm text-[#f0f6fc] outline-none focus:border-[#58a6ff] placeholder:text-[#484f58] transition-colors"
                        placeholder="Task title..."
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleNewTask()}
                    />
                    <textarea
                        className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-4 py-3.5 text-sm text-[#f0f6fc] outline-none focus:border-[#58a6ff] resize-none placeholder:text-[#484f58] transition-colors leading-relaxed"
                        placeholder="Notes (optional — helps AI breakdown)..."
                        rows={2}
                        value={newNotes}
                        onChange={(e) => setNewNotes(e.target.value)}
                    />
                    <div className="flex gap-2.5 items-center flex-wrap">
                        <input
                            type="date"
                            className="bg-[#0d1117] border border-[#30363d] rounded-lg px-3.5 py-2.5 text-sm text-[#f0f6fc] outline-none cursor-pointer hover:border-[#58a6ff] transition-colors"
                            value={newDue}
                            onChange={(e) => setNewDue(e.target.value)}
                        />
                        <div className="flex gap-2.5 ml-auto">
                            <button
                                onClick={() => setShowNewForm(false)}
                                className="px-5 py-2.5 text-sm text-[#8b949e] border border-[#30363d] rounded-lg hover:text-[#f0f6fc] hover:bg-[#21262d] transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleNewTask}
                                disabled={!newTitle.trim()}
                                className="px-5 py-2.5 bg-[#238636] text-white text-sm font-semibold rounded-lg hover:bg-[#2ea043] transition-all disabled:opacity-40"
                            >
                                Save &amp; add
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Task list */}
            <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-3">
                {topLevel.map((task) => {
                    const done = task.status === "completed";
                    const isExpanded = expandedId === task.id;
                    const isExpanding = expandingId === task.id;
                    const subtasks = childrenMap.get(task.id) ?? [];
                    return (
                        <div
                            key={task.id}
                            className={`rounded-lg border transition-all ${
                                done
                                    ? "border-[#21262d] bg-[#161b22]/50 opacity-60"
                                    : "border-[#30363d] bg-[#161b22] hover:border-[#484f58] hover:bg-[#1c2128]"
                            }`}
                        >
                            <div className="flex items-center gap-3.5 px-5 py-4">
                                <button
                                    onClick={() => handleToggleStatus(task)}
                                    className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-lg hover:bg-[#21262d] transition-colors"
                                    title={`Status: ${task.status} — click to toggle`}
                                >
                                    {done ? (
                                        <CheckSquare
                                            size={18}
                                            className="text-[#7ee787]"
                                        />
                                    ) : (
                                        <Circle
                                            size={18}
                                            className="text-[#484f58]"
                                        />
                                    )}
                                </button>

                                <div className="flex-1 min-w-0">
                                    <span
                                        className={`block text-sm font-medium leading-snug truncate ${
                                            done
                                                ? "line-through text-[#484f58]"
                                                : "text-[#f0f6fc]"
                                        }`}
                                    >
                                        {task.title}
                                    </span>
                                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                        {task.due && (
                                            <span className="flex items-center gap-1 text-xs text-[#8b949e]">
                                                <Clock
                                                    size={13}
                                                    className="text-[#484f58]"
                                                />
                                                {format(
                                                    new Date(task.due),
                                                    "MMM d",
                                                )}
                                            </span>
                                        )}
                                        {subtasks.length > 0 && (
                                            <span className="text-xs text-[#484f58]">
                                                {
                                                    subtasks.filter(
                                                        (s) =>
                                                            s.status ===
                                                            "completed",
                                                    ).length
                                                }
                                                /{subtasks.length} subtasks done
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 flex-shrink-0">
                                    <button
                                        onClick={() =>
                                            handleAddToCalendar(task)
                                        }
                                        className="flex items-center justify-center w-9 h-9 text-[#484f58] hover:text-[#7ee787] hover:bg-[#7ee787]/10 rounded-lg transition-colors"
                                        title="Add to calendar"
                                    >
                                        <CalendarPlus size={15} />
                                    </button>
                                    <button
                                        onClick={() => handleAIExpand(task)}
                                        disabled={isExpanding}
                                        className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-[#8b949e] border border-[#30363d] rounded-lg hover:border-[#58a6ff] hover:text-[#58a6ff] hover:bg-[#58a6ff]/5 transition-all disabled:opacity-50"
                                    >
                                        {isExpanding ? (
                                            <Loader2
                                                size={12}
                                                className="animate-spin"
                                            />
                                        ) : (
                                            <Sparkles size={12} />
                                        )}
                                        Break down
                                    </button>
                                    <button
                                        onClick={() =>
                                            setExpandedId(
                                                isExpanded ? null : task.id,
                                            )
                                        }
                                        className="flex items-center justify-center w-9 h-9 text-[#484f58] hover:text-[#f0f6fc] hover:bg-[#21262d] rounded-lg transition-colors"
                                        title={
                                            isExpanded
                                                ? "Collapse"
                                                : `Expand${subtasks.length > 0 ? ` (${subtasks.length} subtask${subtasks.length > 1 ? "s" : ""})` : ""}`
                                        }
                                    >
                                        {isExpanded ? (
                                            <ChevronDown size={15} />
                                        ) : (
                                            <ChevronRight size={15} />
                                        )}
                                    </button>
                                    <button
                                        onClick={() =>
                                            setConfirmDeleteId(task.id)
                                        }
                                        className="flex items-center justify-center w-9 h-9 text-[#484f58] hover:text-[#f85149] hover:bg-[#f85149]/10 rounded-lg transition-colors"
                                        title="Delete task"
                                    >
                                        <Trash2 size={15} />
                                    </button>
                                </div>
                            </div>

                            {/* Subtasks */}
                            {isExpanded && subtasks.length > 0 && (
                                <div className="border-t border-[#21262d]/50">
                                    {subtasks.map((sub) => {
                                        const subDone =
                                            sub.status === "completed";
                                        return (
                                            <div
                                                key={sub.id}
                                                className="flex items-center gap-3 pl-14 pr-5 py-2.5 hover:bg-[#0d1117]/40 transition-colors"
                                            >
                                                <button
                                                    onClick={() =>
                                                        handleToggleStatus(sub)
                                                    }
                                                    className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-md hover:bg-[#21262d] transition-colors"
                                                    title={`Status: ${sub.status} — click to toggle`}
                                                >
                                                    {subDone ? (
                                                        <CheckSquare
                                                            size={14}
                                                            className="text-[#7ee787]"
                                                        />
                                                    ) : (
                                                        <Circle
                                                            size={14}
                                                            className="text-[#30363d]"
                                                        />
                                                    )}
                                                </button>
                                                <span
                                                    className={`flex-1 text-sm truncate ${
                                                        subDone
                                                            ? "line-through text-[#484f58]"
                                                            : "text-[#c9d1d9]"
                                                    }`}
                                                >
                                                    {sub.title}
                                                </span>
                                                {sub.due && (
                                                    <span className="flex items-center gap-1 text-xs text-[#484f58] flex-shrink-0">
                                                        <Clock size={11} />
                                                        {format(
                                                            new Date(sub.due),
                                                            "MMM d",
                                                        )}
                                                    </span>
                                                )}
                                                <button
                                                    onClick={() =>
                                                        setConfirmDeleteId(
                                                            sub.id,
                                                        )
                                                    }
                                                    className="flex items-center justify-center w-7 h-7 text-[#30363d] hover:text-[#f85149] hover:bg-[#f85149]/10 rounded-md transition-colors flex-shrink-0"
                                                    title="Delete subtask"
                                                >
                                                    <Trash2 size={13} />
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {isExpanded && task.notes && (
                                <div className="px-6 pb-6 pt-2 border-t border-[#21262d]/50">
                                    <p className="text-sm text-[#8b949e] italic leading-relaxed px-2 pt-2">
                                        {task.notes}
                                    </p>
                                </div>
                            )}
                        </div>
                    );
                })}
                {topLevel.length === 0 && (
                    <div className="flex flex-col items-center justify-center gap-3.5 py-20 text-[#484f58]">
                        <CheckSquare size={36} />
                        <p className="text-base">
                            {filter === "all"
                                ? "No tasks yet. Create one!"
                                : `No ${filterLabel(filter).toLowerCase()} tasks.`}
                        </p>
                    </div>
                )}
            </div>

            {/* Confirm delete dialog */}
            {confirmDeleteId !== null && (
                <div
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
                    onClick={() => setConfirmDeleteId(null)}
                >
                    <div
                        className="bg-[#161b22] border border-[#30363d] rounded-lg w-full max-w-sm shadow-2xl p-6 flex flex-col gap-4"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex flex-col gap-1">
                            <h3 className="text-base font-semibold text-[#f0f6fc]">
                                Delete task?
                            </h3>
                            <p className="text-sm text-[#8b949e] leading-relaxed">
                                This task will be permanently removed from
                                Google Tasks.
                            </p>
                        </div>
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => setConfirmDeleteId(null)}
                                className="px-5 py-2.5 text-sm text-[#8b949e] border border-[#30363d] rounded-lg hover:text-[#f0f6fc] hover:bg-[#21262d] transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => {
                                    handleDeleteTask(confirmDeleteId);
                                    setConfirmDeleteId(null);
                                }}
                                className="px-5 py-2.5 text-sm font-semibold text-white bg-[#f85149] rounded-lg hover:bg-[#da3633] transition-colors"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
