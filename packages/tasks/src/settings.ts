export interface TasksPluginSettings {
  defaultFilter: "all" | "needsAction" | "completed";
  sortBy: "position" | "dueDate" | "updatedAt";
}

export const DEFAULT_TASKS_SETTINGS: TasksPluginSettings = {
  defaultFilter: "all",
  sortBy: "position",
};
