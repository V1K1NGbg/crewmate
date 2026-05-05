"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Plus,
  Trash2,
  CheckSquare,
  Sparkles,
  Loader2,
  Clock,
  CalendarPlus,
  ExternalLink,
  RefreshCw,
  Pencil,
  Check,
  X,
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
  const tasksRef = useRef<GoogleTask[]>([]);
  // Keep tasksRef in sync so refreshTasks always has the latest parent map,
  // even across async boundaries where closure-captured state would be stale.
  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>("all");
  const [expandingId, setExpandingId] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [newDue, setNewDue] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [initError, setInitError] = useState<string | null>(null);
  const listIdRef = useRef<string | null>(null);
  const emailContextRef = useRef<Map<string, string>>(new Map()); // taskId → email body

  // Adding subtask state
  const [addingSubtaskTo, setAddingSubtaskTo] = useState<string | null>(null);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");

  // Inline editing state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  // Subtask editing state
  const [editingSubtaskId, setEditingSubtaskId] = useState<string | null>(null);
  const [editSubtaskTitle, setEditSubtaskTitle] = useState("");

  const initList = useCallback(async () => {
    setLoading(true);
    setInitError(null);
    try {
      const res = await fetch("/api/tasks/init", { method: "POST" });
      const initData = await res.json();
      if (!res.ok)
        throw new Error(initData.error ?? "Failed to initialize task list");
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
      setInitError(
        err instanceof Error ? err.message : "Failed to load Google Tasks",
      );
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
      // Google Tasks API sometimes omits the `parent` field on subtasks that
      // were hidden (e.g. because their parent was completed) and then
      // re-surfaced. Build the parent map from the ref (always current, even
      // across async boundaries) so orphaned subtasks get re-attached.
      const localParentMap = new Map(
        tasksRef.current.filter((t) => t.parent).map((t) => [t.id, t.parent!]),
      );
      setTasks(
        (data.items ?? []).map((t: GoogleTask) => ({
          ...t,
          parent: t.parent ?? localParentMap.get(t.id),
        })),
      );
    } catch {
      /* silent */
    }
  }, []);

  useEffect(() => {
    if (session?.accessToken) initList();
  }, [session?.accessToken]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!state.taskPrefill || !listId) return;
    const { title, description, dueDate, emailContext } = state.taskPrefill;
    dispatch({ type: "CLEAR_TASK_PREFILL" });
    handleCreateTask(title || "Untitled", description, dueDate).then(
      (taskId) => {
        if (taskId && emailContext)
          emailContextRef.current.set(taskId, emailContext);
      },
    );
  }, [state.taskPrefill]); // eslint-disable-line react-hooks/exhaustive-deps

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
  ): Promise<string | null> {
    if (!listId || !title.trim()) return null;
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
      return task.id ?? null;
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : "Create failed", "error");
      return null;
    }
  }

  async function handleNewTask() {
    await handleCreateTask(newTitle, newNotes, newDue);
    setNewTitle("");
    setNewNotes("");
    setNewDue("");
    setShowNewForm(false);
  }

  async function handleAddSubtask() {
    if (!listId || !newSubtaskTitle.trim() || !addingSubtaskTo) return;
    try {
      const res = await fetch("/api/tasks/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listId,
          title: newSubtaskTitle.trim(),
          parent: addingSubtaskTo,
        }),
      });
      if (!res.ok) throw new Error("Failed to create subtask");
      const { task: newSubtask } = await res.json();
      // Append subtask to local state so it appears last
      setTasks((prev) => [...prev, newSubtask]);
      setAddingSubtaskTo(null);
      setNewSubtaskTitle("");
      notify("Subtask added", "success");
    } catch (err: unknown) {
      notify(
        err instanceof Error ? err.message : "Failed to add subtask",
        "error",
      );
    }
  }

  async function handleToggleStatus(task: GoogleTask) {
    if (!listId) return;
    const newStatus =
      task.status === "needsAction" ? "completed" : "needsAction";
    // If uncompleting a subtask whose parent is completed, uncomplete the parent
    // first — otherwise Google hides the subtask again and it gets orphaned.
    const parentTask =
      newStatus === "needsAction" && task.parent
        ? tasks.find((t) => t.id === task.parent && t.status === "completed")
        : undefined;
    // If completing a subtask, check if all siblings will now be done too —
    // if so, auto-complete the parent.
    const parentToComplete =
      newStatus === "completed" && task.parent
        ? (() => {
            const parent = tasks.find(
              (t) => t.id === task.parent && t.status === "needsAction",
            );
            if (!parent) return undefined;
            const siblings = tasks.filter(
              (t) => t.parent === task.parent && t.id !== task.id,
            );
            const allDone = siblings.every((s) => s.status === "completed");
            return allDone ? parent : undefined;
          })()
        : undefined;
    // Optimistic update so the UI feels instant
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id === task.id) return { ...t, status: newStatus };
        if (parentTask && t.id === parentTask.id)
          return { ...t, status: "needsAction" };
        if (parentToComplete && t.id === parentToComplete.id)
          return { ...t, status: "completed" };
        return t;
      }),
    );
    try {
      // Uncomplete the parent before the subtask so Google doesn't re-hide it
      if (parentTask) {
        const parentRes = await fetch("/api/tasks/items", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            listId,
            taskId: parentTask.id,
            status: "needsAction",
          }),
        });
        if (!parentRes.ok) throw new Error("Failed to update parent task");
      }
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
      // Auto-complete the parent if all subtasks are now done
      if (parentToComplete) {
        const parentRes = await fetch("/api/tasks/items", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            listId,
            taskId: parentToComplete.id,
            status: "completed",
          }),
        });
        if (!parentRes.ok) throw new Error("Failed to complete parent task");
      }
      // Full refresh so parent/child relationships are always accurate.
      await refreshTasks();
    } catch (err: unknown) {
      // Revert optimistic update on failure
      setTasks((prev) =>
        prev.map((t) => {
          if (t.id === task.id) return { ...t, status: task.status };
          if (parentTask && t.id === parentTask.id)
            return { ...t, status: parentTask.status };
          if (parentToComplete && t.id === parentToComplete.id)
            return { ...t, status: parentToComplete.status };
          return t;
        }),
      );
      notify(err instanceof Error ? err.message : "Update failed", "error");
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
      setTasks((prev) => prev.filter((t) => t.id !== id && t.parent !== id));
      notify("Task deleted", "info");
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : "Delete failed", "error");
    }
  }

  function startEditing(task: GoogleTask) {
    setEditingId(task.id);
    setEditTitle(task.title);
    setEditNotes(task.notes ?? "");
  }

  function cancelEditing() {
    setEditingId(null);
    setEditTitle("");
    setEditNotes("");
  }

  function startEditingSubtask(subtask: GoogleTask) {
    setEditingSubtaskId(subtask.id);
    setEditSubtaskTitle(subtask.title);
  }

  function cancelEditingSubtask() {
    setEditingSubtaskId(null);
    setEditSubtaskTitle("");
  }

  async function saveEditingSubtask(subtask: GoogleTask) {
    if (!listId || !editSubtaskTitle.trim()) return;
    try {
      const res = await fetch("/api/tasks/items", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listId,
          taskId: subtask.id,
          title: editSubtaskTitle.trim(),
        }),
      });
      if (!res.ok) throw new Error("Failed to update subtask");
      await refreshTasks();
      cancelEditingSubtask();
      notify("Subtask updated", "success");
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : "Update failed", "error");
    }
  }

  async function saveEditing(task: GoogleTask) {
    if (!listId || !editTitle.trim()) return;
    setEditSaving(true);
    try {
      const res = await fetch("/api/tasks/items", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listId,
          taskId: task.id,
          title: editTitle.trim(),
          notes: editNotes || undefined,
        }),
      });
      if (!res.ok) throw new Error("Failed to update task");
      // Full refresh to keep parent relationships in sync
      await refreshTasks();
      cancelEditing();
      notify("Task updated", "success");
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : "Update failed", "error");
    } finally {
      setEditSaving(false);
    }
  }

  async function handleAIExpand(task: GoogleTask) {
    if (!state.opencodeAvailable || !listId) {
      notify("opencode server not available", "error");
      return;
    }
    setExpandingId(task.id);
    try {
      const emailContext = emailContextRef.current.get(task.id);
      const contextLines = [`Title: ${task.title}`];
      if (task.notes) contextLines.push(`Description: ${task.notes}`);
      if (emailContext)
        contextLines.push(`\nEmail context:\n${emailContext.slice(0, 3000)}`);
      const prompt = `Break down the following task into exactly 5 concrete, actionable subtasks. Return ONLY a plain numbered list (1. ... 2. ... etc.), no markdown headers, no explanation, nothing else.\n\n${contextLines.join("\n")}`;
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
      // Full refresh to get correct parent fields from API
      await refreshTasks();
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
    return f === "all" ? "All" : f === "needsAction" ? "Pending" : "Done";
  }
  function filterCount(f: FilterType) {
    return f === "all"
      ? tasks.length
      : tasks.filter((t) => t.status === f).length;
  }

  // Build task tree — when a filter is active, include parent tasks of matching
  // subtasks even if the parent itself doesn't match the filter, so subtasks
  // are never orphaned/invisible.
  const directlyFiltered =
    filter === "all" ? tasks : tasks.filter((t) => t.status === filter);

  // Collect parent IDs that need to be shown even if they don't match filter
  const parentIdsNeeded = new Set<string>();
  for (const t of directlyFiltered) {
    if (t.parent) parentIdsNeeded.add(t.parent);
  }
  const filtered = [
    ...directlyFiltered,
    ...tasks.filter(
      (t) => parentIdsNeeded.has(t.id) && !directlyFiltered.includes(t),
    ),
  ];

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
      <div className="flex-1 flex flex-col items-center justify-center gap-6 bg-bg p-12">
        <div className="flex flex-col items-center gap-5 p-8 bg-surface border border-border-2 rounded-2xl max-w-sm w-full">
          <div className="w-12 h-12 bg-surface-2 rounded-xl flex items-center justify-center">
            <CheckSquare size={24} className="text-text-3" />
          </div>
          <div className="flex flex-col items-center gap-2 text-center">
            <h2 className="text-base font-semibold text-text">
              {isUnauthorized
                ? "Re-authentication required"
                : "Could not load Tasks"}
            </h2>
            <p className="text-sm text-text-2 leading-relaxed">
              {isUnauthorized
                ? "Sign out and sign back in to grant access to Google Tasks."
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
              onClick={initList}
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
          Google Tasks…
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden bg-bg">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-bg flex-shrink-0">
        {/* Filter tabs — same style as GmailPage */}
        <div className="flex border border-border-2 rounded-lg overflow-hidden">
          {FILTER_OPTIONS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{ padding: "2px 12px" }}
              className={`flex items-center gap-1.5 text-sm font-semibold transition-colors ${
                filter === f
                  ? "text-accent border-b-2 border-accent"
                  : "text-text-3 hover:text-text-2 hover:bg-surface"
              } ${f !== "all" ? "border-l border-border-2" : ""}`}
            >
              {filterLabel(f)}
              <span
                className={`text-xs font-medium ${
                  filter === f ? "text-accent" : "text-text-2"
                }`}
              >
                {filterCount(f)}
              </span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {listId && (
            <a
              href="https://tasks.google.com"
              target="_blank"
              rel="noopener noreferrer"
              style={{ padding: "2px 12px" }}
              className="flex items-center gap-1.5 text-sm text-text-2 border border-border-2 rounded-lg hover:border-accent hover:text-accent transition-all"
              title="Open in Google Tasks"
            >
              <ExternalLink size={13} /> Open in Tasks
            </a>
          )}
          <button
            onClick={refreshTasks}
            className="w-8 h-8 flex items-center justify-center text-text-2 hover:text-text hover:bg-surface rounded-lg transition-colors"
            title="Refresh"
          >
            <RefreshCw size={14} />
          </button>
          <button
            onClick={() => setShowNewForm(!showNewForm)}
            style={{ padding: "2px 12px" }}
            className="flex items-center gap-1.5 text-sm font-medium text-text-2 border border-border-2 rounded-lg hover:border-accent hover:text-accent transition-all"
          >
            <Plus size={14} /> New task
          </button>
        </div>
      </div>

      {/* New task form */}
      {showNewForm && (
        <div
          className="flex flex-col gap-3 px-6 py-3.5 bg-surface border-b border-border"
          style={{ animation: "slideDown 0.15s ease-out both" }}
        >
          <input
            autoFocus
            className="w-full bg-bg border border-border-2 rounded-lg px-4 py-2.5 text-sm text-text outline-none focus:border-accent placeholder:text-text-3 transition-colors"
            placeholder="Task title..."
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleNewTask()}
          />
          <textarea
            className="w-full bg-bg border border-border-2 rounded-lg px-4 py-2.5 text-sm text-text outline-none focus:border-accent resize-none placeholder:text-text-3 transition-colors leading-relaxed"
            placeholder="Notes (optional — helps AI breakdown)..."
            rows={2}
            value={newNotes}
            onChange={(e) => setNewNotes(e.target.value)}
          />
          <div className="flex gap-2 items-center flex-wrap">
            <input
              type="date"
              className="bg-bg border border-border-2 rounded-lg px-3 py-2 text-sm text-text outline-none cursor-pointer hover:border-accent transition-colors"
              value={newDue}
              onChange={(e) => setNewDue(e.target.value)}
            />
            <div className="flex gap-2 ml-auto">
              <button
                onClick={() => setShowNewForm(false)}
                style={{ padding: "2px 12px" }}
                className="text-sm font-medium text-text-2 border border-border-2 rounded-lg hover:text-text hover:bg-surface-2 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleNewTask}
                disabled={!newTitle.trim()}
                style={{ padding: "2px 12px" }}
                className="text-sm font-semibold text-white bg-accent rounded-lg hover:bg-accent-hover transition-all disabled:opacity-40"
              >
                Save &amp; add
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Task list */}
      <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-2.5">
        {topLevel.map((task) => {
          const done = task.status === "completed";
          const isExpanding = expandingId === task.id;
          const subtasks = childrenMap.get(task.id) ?? [];
          const isEditing = editingId === task.id;
          return (
            <div
              key={task.id}
              className={`rounded-xl border transition-all ${
                done
                  ? "border-border bg-surface/50 opacity-60"
                  : "border-border-2 bg-surface hover:border-text-3"
              }`}
            >
              <div className="flex items-start gap-3 px-4 py-3.5">
                <button
                  onClick={() => handleToggleStatus(task)}
                  className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-all mt-0.5 ${
                    done ? "bg-accent border-accent" : "border-text-3"
                  }`}
                  title={`Status: ${task.status}`}
                >
                  {done && (
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 10 10"
                      fill="none"
                      className="text-white"
                    >
                      <path
                        d="M2 5l2.5 2.5 5-5"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  {isEditing ? (
                    <div className="flex flex-col gap-2">
                      <input
                        autoFocus
                        className="w-full bg-bg border border-accent rounded-lg px-3 py-1.5 text-sm text-text outline-none transition-colors"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveEditing(task);
                          if (e.key === "Escape") cancelEditing();
                        }}
                      />
                      <textarea
                        className="w-full bg-bg border border-border-2 rounded-lg px-3 py-1.5 text-sm text-text outline-none focus:border-accent resize-none placeholder:text-text-3 transition-colors leading-relaxed"
                        placeholder="Notes (optional)..."
                        rows={2}
                        value={editNotes}
                        onChange={(e) => setEditNotes(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") cancelEditing();
                        }}
                      />
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => saveEditing(task)}
                          disabled={editSaving || !editTitle.trim()}
                          style={{ padding: "2px 12px" }}
                          className="flex items-center gap-1 text-sm font-semibold bg-accent text-white rounded-lg hover:bg-accent-hover transition-all disabled:opacity-40"
                        >
                          {editSaving ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <Check size={12} />
                          )}{" "}
                          Save
                        </button>
                        <button
                          onClick={cancelEditing}
                          style={{ padding: "2px 12px" }}
                          className="flex items-center gap-1 text-sm font-medium text-text-2 border border-border-2 rounded-lg hover:text-text hover:bg-surface-2 transition-all"
                        >
                          <X size={12} /> Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <span
                        className={`block text-sm font-medium leading-snug truncate ${done ? "line-through text-text-3" : "text-text"}`}
                      >
                        {task.title}
                      </span>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {task.due && (
                          <span className="flex items-center gap-1 text-xs text-text-2">
                            <Clock size={12} className="text-text-3" />
                            {format(new Date(task.due), "MMM d")}
                          </span>
                        )}
                        {subtasks.length > 0 && (
                          <span className="text-xs text-text-3">
                            {
                              subtasks.filter((s) => s.status === "completed")
                                .length
                            }
                            /{subtasks.length} subtasks done
                          </span>
                        )}
                        {task.notes && (
                          <span className="text-xs text-text-3 truncate max-w-xs">
                            {task.notes.slice(0, 60)}
                            {task.notes.length > 60 ? "…" : ""}
                          </span>
                        )}
                      </div>
                    </>
                  )}
                </div>
                {!isEditing && (
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => startEditing(task)}
                      className="w-8 h-8 flex items-center justify-center text-text-3 hover:text-accent hover:bg-accent/10 rounded-lg transition-colors"
                      title="Edit task"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => handleAddToCalendar(task)}
                      className="w-8 h-8 flex items-center justify-center text-text-3 hover:text-success hover:bg-success/10 rounded-lg transition-colors"
                      title="Add to calendar"
                    >
                      <CalendarPlus size={14} />
                    </button>
                    <button
                      onClick={() => handleAIExpand(task)}
                      disabled={isExpanding}
                      style={{ padding: "2px 12px" }}
                      className="flex items-center gap-1.5 text-sm font-medium text-text-2 border border-border-2 rounded-lg hover:border-accent hover:text-accent transition-all disabled:opacity-50"
                    >
                      {isExpanding ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <Sparkles size={12} />
                      )}{" "}
                      Break down
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(task.id)}
                      className="w-8 h-8 flex items-center justify-center text-text-3 hover:text-danger hover:bg-danger/10 rounded-lg transition-colors"
                      title="Delete task"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>

              <div className="border-t border-border/50">
                {subtasks.length > 0 ? (
                  <>
                    {subtasks.map((sub) => {
                      const subDone = sub.status === "completed";
                      return (
                        <div
                          key={sub.id}
                          className="flex items-center gap-3 pl-12 pr-4 py-2 hover:bg-bg/40 transition-colors"
                        >
                          <button
                            onClick={() => handleToggleStatus(sub)}
                            className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                              subDone
                                ? "bg-accent border-accent"
                                : "border-border-2"
                            }`}
                          >
                            {subDone && (
                              <svg
                                width="10"
                                height="10"
                                viewBox="0 0 10 10"
                                fill="none"
                                className="text-white"
                              >
                                <path
                                  d="M2 5l2.5 2.5 5-5"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            )}
                          </button>
                          {editingSubtaskId === sub.id ? (
                            <div className="flex-1 flex items-center gap-2">
                              <input
                                autoFocus
                                className="flex-1 bg-bg border border-accent rounded-lg px-2 py-1 text-sm text-text outline-none"
                                value={editSubtaskTitle}
                                onChange={(e) =>
                                  setEditSubtaskTitle(e.target.value)
                                }
                                onKeyDown={(e) => {
                                  if (e.key === "Enter")
                                    saveEditingSubtask(sub);
                                  if (e.key === "Escape")
                                    cancelEditingSubtask();
                                }}
                              />
                              <button
                                onClick={() => saveEditingSubtask(sub)}
                                disabled={!editSubtaskTitle.trim()}
                                style={{ padding: "2px 8px" }}
                                className="text-xs font-semibold text-white bg-accent rounded hover:bg-accent-hover disabled:opacity-40"
                              >
                                Save
                              </button>
                              <button
                                onClick={cancelEditingSubtask}
                                style={{ padding: "2px 8px" }}
                                className="text-xs font-medium text-text-2 border border-border-2 rounded hover:text-text hover:bg-surface-2"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <>
                              <span
                                className={`flex-1 text-sm truncate ${subDone ? "line-through text-text-3" : "text-text"}`}
                              >
                                {sub.title}
                              </span>
                              {sub.due && (
                                <span className="flex items-center gap-1 text-xs text-text-3 flex-shrink-0">
                                  <Clock size={11} />
                                  {format(new Date(sub.due), "MMM d")}
                                </span>
                              )}
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                <button
                                  onClick={() => startEditingSubtask(sub)}
                                  className="w-8 h-8 flex items-center justify-center text-text-3 hover:text-accent hover:bg-accent/10 rounded-lg transition-colors"
                                  title="Edit subtask"
                                >
                                  <Pencil size={13} />
                                </button>
                                <button
                                  onClick={() => setConfirmDeleteId(sub.id)}
                                  className="w-8 h-8 flex items-center justify-center text-text-3 hover:text-danger hover:bg-danger/10 rounded-lg transition-colors"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}

                    {/* Add subtask form */}
                    {addingSubtaskTo === task.id ? (
                      <div className="flex items-center gap-2 pl-12 pr-4 py-2">
                        <div className="w-6 h-6 flex-shrink-0" />
                        <input
                          autoFocus
                          className="flex-1 bg-bg border border-border-2 rounded-lg px-3 py-1.5 text-sm text-text outline-none focus:border-accent"
                          placeholder="Subtask title..."
                          value={newSubtaskTitle}
                          onChange={(e) => setNewSubtaskTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleAddSubtask();
                            if (e.key === "Escape") {
                              setAddingSubtaskTo(null);
                              setNewSubtaskTitle("");
                            }
                          }}
                        />
                        <button
                          onClick={handleAddSubtask}
                          disabled={!newSubtaskTitle.trim()}
                          style={{ padding: "2px 12px" }}
                          className="text-sm font-medium text-white bg-accent rounded-lg hover:bg-accent-hover disabled:opacity-40"
                        >
                          Add
                        </button>
                        <button
                          onClick={() => {
                            setAddingSubtaskTo(null);
                            setNewSubtaskTitle("");
                          }}
                          style={{ padding: "2px 10px" }}
                          className="text-sm font-medium text-text-2 border border-border-2 rounded-lg hover:text-text hover:bg-surface-2 transition-all"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setAddingSubtaskTo(task.id)}
                        style={{ padding: "2px 12px" }}
                        className="flex items-center gap-1.5 text-sm font-medium text-text-2 border border-border-2 rounded-lg hover:border-accent hover:text-accent transition-all ml-3 mb-2"
                      >
                        <Plus size={12} /> Add subtask
                      </button>
                    )}
                  </>
                ) : (
                  /* No subtasks yet */
                  <div className="pl-12 pr-4 py-3 text-xs text-text-3 flex items-center gap-2">
                    <span>No subtasks.</span>
                    <button
                      onClick={() => setAddingSubtaskTo(task.id)}
                      style={{ padding: "2px 10px" }}
                      className="text-xs font-medium text-text-2 border border-border-2 rounded hover:border-accent hover:text-accent transition-all"
                    >
                      Add one
                    </button>
                    <span>or use AI breakdown above.</span>
                  </div>
                )}
              </div>

              {task.notes && (
                <div className="px-5 pb-4 pt-2 border-t border-border/50">
                  <p className="text-sm text-text-2 italic leading-relaxed px-2 pt-2">
                    {task.notes}
                  </p>
                </div>
              )}
            </div>
          );
        })}
        {topLevel.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-text-3">
            <CheckSquare size={32} />
            <p className="text-sm">
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
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setConfirmDeleteId(null)}
        >
          <div
            className="bg-surface border border-border-2 rounded-xl w-full max-w-sm shadow-2xl flex flex-col gap-4"
            style={{ padding: "20px" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col gap-1">
              <h3 className="text-sm font-semibold text-text">Delete task?</h3>
              <p className="text-sm text-text-2 leading-relaxed">
                This task will be permanently removed from Google Tasks.
              </p>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmDeleteId(null)}
                style={{ padding: "2px 12px" }}
                className="text-sm font-medium text-text-2 border border-border-2 rounded-lg hover:text-text hover:bg-surface-2 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  handleDeleteTask(confirmDeleteId);
                  setConfirmDeleteId(null);
                }}
                style={{ padding: "2px 12px" }}
                className="text-sm font-semibold text-white bg-danger rounded-lg hover:bg-red-600 transition-all"
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
