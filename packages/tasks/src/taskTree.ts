import type { GoogleTask } from "./useTasks";
import type { TasksPluginSettings } from "./settings";

export type TaskFilter = TasksPluginSettings["defaultFilter"];
export type TaskSort = TasksPluginSettings["sortBy"];

export interface TaskTree {
  topLevel: GoogleTask[];
  childrenByParent: Map<string, GoogleTask[]>;
}

export function compareTasks(sortBy: TaskSort) {
  return (a: GoogleTask, b: GoogleTask): number => {
    const byPosition = (a.position ?? "").localeCompare(b.position ?? "");
    if (sortBy === "dueDate") return (a.due ?? "9999").localeCompare(b.due ?? "9999") || byPosition;
    if (sortBy === "updatedAt") return (b.updated ?? "").localeCompare(a.updated ?? "") || byPosition;
    return byPosition;
  };
}

/**
 * Filters and sorts tasks into a parent → subtask tree. When a filter is
 * active, the parents of matching subtasks are kept even if they do not match
 * themselves, so subtasks are never orphaned.
 */
export function buildTaskTree(tasks: GoogleTask[], filter: TaskFilter, sortBy: TaskSort): TaskTree {
  const direct = filter === "all" ? tasks : tasks.filter((task) => task.status === filter);
  const directIds = new Set(direct.map((task) => task.id));
  const neededParents = new Set(direct.flatMap((task) => (task.parent ? [task.parent] : [])));
  const visible = [...direct, ...tasks.filter((task) => neededParents.has(task.id) && !directIds.has(task.id))];
  const visibleIds = new Set(visible.map((task) => task.id));

  const childrenByParent = new Map<string, GoogleTask[]>();
  const topLevel: GoogleTask[] = [];
  for (const task of visible) {
    // A subtask whose parent is not loaded is shown at the top level instead of disappearing.
    if (task.parent && visibleIds.has(task.parent)) {
      childrenByParent.set(task.parent, [...(childrenByParent.get(task.parent) ?? []), task]);
    } else {
      topLevel.push(task);
    }
  }
  const compare = compareTasks(sortBy);
  topLevel.sort(compare);
  for (const children of childrenByParent.values()) children.sort(compare);
  return { topLevel, childrenByParent };
}

export function countTasks(tasks: GoogleTask[], filter: TaskFilter): number {
  return filter === "all" ? tasks.length : tasks.filter((task) => task.status === filter).length;
}
