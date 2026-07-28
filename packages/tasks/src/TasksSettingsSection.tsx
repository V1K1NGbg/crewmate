"use client";

import { SettingRow } from "@crewmate/lib";
import type { FeatureSettingsProps } from "@crewmate/types";
import type { TasksPluginSettings } from "./settings";

export default function TasksSettingsSection({
  settings,
  onChange,
}: FeatureSettingsProps<TasksPluginSettings>) {
  return (
    <>
      <SettingRow label="Default filter">
        <select
          className="settings-select"
          value={settings.defaultFilter}
          onChange={(e) =>
            onChange({
              defaultFilter: e.target.value as TasksPluginSettings["defaultFilter"],
            })
          }
        >
          <option value="all">All</option>
          <option value="pending">Pending</option>
          <option value="in-progress">In progress</option>
          <option value="done">Done</option>
        </select>
      </SettingRow>
      <SettingRow label="Sort by">
        <select
          className="settings-select"
          value={settings.sortBy}
          onChange={(e) =>
            onChange({ sortBy: e.target.value as TasksPluginSettings["sortBy"] })
          }
        >
          <option value="priority">Priority</option>
          <option value="dueDate">Due date</option>
          <option value="createdAt">Created date</option>
        </select>
      </SettingRow>
    </>
  );
}
