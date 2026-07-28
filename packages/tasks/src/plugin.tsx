import { lazy } from "react";
import { CheckSquare } from "lucide-react";
import type { FeaturePlugin, Task } from "@crewmate/types";
import { DEFAULT_TASKS_SETTINGS, type TasksPluginSettings } from "./settings";

function buildAssistantContext(data: unknown): string | null {
  const tasks = (data as Task[] | undefined) ?? [];
  if (tasks.length === 0) return null;
  const pending = tasks.filter((t) => t.status !== "done").length;
  const lines: string[] = [`\n--- Tasks (${tasks.length}, ${pending} pending) ---`];
  for (const t of tasks.slice(0, 15)) {
    let entry = `• [${t.status}] ${t.title} (${t.priority})`;
    if (t.dueDate) entry += ` due:${t.dueDate}`;
    if (t.description) entry += ` — ${t.description}`;
    lines.push(entry);
    for (const s of t.subtasks) {
      lines.push(`  ${s.done ? "☑" : "☐"} ${s.title}`);
    }
  }
  if (tasks.length > 15) lines.push(`  …and ${tasks.length - 15} more`);
  return lines.join("\n");
}

export const tasksPlugin: FeaturePlugin<TasksPluginSettings> = {
  id: "tasks",
  packageName: "@crewmate/tasks",
  label: "Tasks",
  description: "Track Google Tasks with subtasks, priorities, and AI breakdown.",
  icon: CheckSquare,
  color: "#4ade80",
  keybinding: "4",
  enabledByDefault: true,
  Page: lazy(() => import("./TasksPage")),
  defaultSettings: DEFAULT_TASKS_SETTINGS,
  SettingsSection: lazy(() => import("./TasksSettingsSection")),
  buildAssistantContext,
  assistantActions: [
    {
      type: "create_task",
      icon: CheckSquare,
      promptHint:
        '{"type":"create_task","label":"Create task","payload":{"title":"...","description":"...","dateHint":"2024-03-15"}}',
      buildPrefill: (payload) => ({
        title: payload?.title ?? "New Task",
        description: payload?.description,
        dueDate: payload?.dateHint,
      }),
    },
  ],
};
