"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useApp } from "@crewmate/state";
import {
  saveTaskEmailContext,
  deleteTaskEmailContext,
} from "./taskEmailContext";
import type { Task } from "@crewmate/types";

export interface GoogleTask {
  id: string;
  title: string;
  notes?: string;
  status: "needsAction" | "completed";
  due?: string;
  updated?: string;
  parent?: string;
  position?: string;
}

export function googleTasksToAppTasks(items: GoogleTask[]): Task[] {
  const childrenMap = new Map<string, GoogleTask[]>();
  const topLevel: GoogleTask[] = [];
  for (const t of items) {
    if (t.parent) {
      const list = childrenMap.get(t.parent) ?? [];
      list.push(t);
      childrenMap.set(t.parent, list);
    } else {
      topLevel.push(t);
    }
  }
  const now = new Date().toISOString();
  return topLevel.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.notes,
    status: t.status === "completed" ? "done" : "pending",
    priority: "medium" as const,
    dueDate: t.due,
    subtasks: (childrenMap.get(t.id) ?? []).map((s) => ({
      id: s.id,
      title: s.title,
      done: s.status === "completed",
    })),
    createdAt: t.updated ?? now,
    updatedAt: t.updated ?? now,
    fileName: "",
  }));
}

export function useTasks(accountKey = "anonymous") {
  const { notify } = useApp();
  const [listId, setListId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<GoogleTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  const listIdRef = useRef<string | null>(null);
  const tasksRef = useRef<GoogleTask[]>([]);

  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

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

  const createTask = useCallback(
    async (
      title: string,
      notes?: string,
      due?: string,
      emailContext?: string,
    ): Promise<string | null> => {
      const id = listIdRef.current;
      if (!id || !title.trim()) return null;
      try {
        const res = await fetch("/api/tasks/items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            listId: id,
            title: title.trim(),
            notes: notes || undefined,
            due: due || undefined,
          }),
        });
        if (!res.ok) throw new Error("Failed to create task");
        const { task } = await res.json();
        setTasks((prev) => [task, ...prev]);
        if (task.id && emailContext)
          saveTaskEmailContext(accountKey, task.id, emailContext);
        notify("Task created", "success");
        return task.id ?? null;
      } catch (err: unknown) {
        notify(err instanceof Error ? err.message : "Create failed", "error");
        return null;
      }
    },
    [accountKey, notify],
  );

  const createSubtask = useCallback(
    async (
      parentId: string,
      title: string,
      options?: { silent?: boolean },
    ): Promise<boolean> => {
      const id = listIdRef.current;
      if (!id || !title.trim()) return false;
      try {
        const res = await fetch("/api/tasks/items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            listId: id,
            title: title.trim(),
            parent: parentId,
          }),
        });
        if (!res.ok) throw new Error("Failed to create subtask");
        const { task: newSubtask } = await res.json();
        setTasks((prev) => [newSubtask, ...prev]);
        if (!options?.silent) notify("Subtask added", "success");
        return true;
      } catch (err: unknown) {
        notify(
          err instanceof Error ? err.message : "Failed to add subtask",
          "error",
        );
        return false;
      }
    },
    [notify],
  );

  const toggleStatus = useCallback(
    async (task: GoogleTask) => {
      const listId = listIdRef.current;
      if (!listId) return;
      const currentTasks = tasksRef.current;
      const newStatus =
        task.status === "needsAction" ? "completed" : "needsAction";
      const parentTask =
        newStatus === "needsAction" && task.parent
          ? currentTasks.find(
              (t) => t.id === task.parent && t.status === "completed",
            )
          : undefined;
      const parentToComplete =
        newStatus === "completed" && task.parent
          ? (() => {
              const parent = currentTasks.find(
                (t) => t.id === task.parent && t.status === "needsAction",
              );
              if (!parent) return undefined;
              const siblings = currentTasks.filter(
                (t) => t.parent === task.parent && t.id !== task.id,
              );
              const allDone = siblings.every((s) => s.status === "completed");
              return allDone ? parent : undefined;
            })()
          : undefined;
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
        await refreshTasks();
      } catch (err: unknown) {
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
    },
    [notify, refreshTasks],
  );

  const deleteTask = useCallback(
    async (taskId: string) => {
      const listId = listIdRef.current;
      if (!listId) return;
      try {
        const res = await fetch(
          `/api/tasks/items?listId=${encodeURIComponent(listId)}&taskId=${encodeURIComponent(taskId)}`,
          { method: "DELETE" },
        );
        if (!res.ok) throw new Error("Failed to delete task");
        deleteTaskEmailContext(accountKey, taskId);
        setTasks((prev) =>
          prev.filter((t) => t.id !== taskId && t.parent !== taskId),
        );
        notify("Task deleted", "info");
      } catch (err: unknown) {
        notify(err instanceof Error ? err.message : "Delete failed", "error");
      }
    },
    [accountKey, notify],
  );

  const updateTask = useCallback(
    async (taskId: string, patch: { title?: string; notes?: string }) => {
      const listId = listIdRef.current;
      if (!listId) return false;
      try {
        const res = await fetch("/api/tasks/items", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ listId, taskId, ...patch }),
        });
        if (!res.ok) throw new Error("Failed to update task");
        await refreshTasks();
        notify("Task updated", "success");
        return true;
      } catch (err: unknown) {
        notify(err instanceof Error ? err.message : "Update failed", "error");
        return false;
      }
    },
    [notify, refreshTasks],
  );

  return {
    listId,
    tasks,
    loading,
    initError,
    initList,
    refreshTasks,
    createTask,
    createSubtask,
    toggleStatus,
    deleteTask,
    updateTask,
  };
}
