export interface TasksPluginSettings {
  defaultFilter: "all" | "pending" | "in-progress" | "done";
  sortBy: "priority" | "dueDate" | "createdAt";
}

export const DEFAULT_TASKS_SETTINGS: TasksPluginSettings = {
  defaultFilter: "all",
  sortBy: "priority",
};
