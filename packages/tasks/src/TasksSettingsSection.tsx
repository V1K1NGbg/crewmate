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
          <option value="needsAction">Pending</option>
          <option value="completed">Done</option>
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
          <option value="position">Google Tasks order</option>
          <option value="dueDate">Due date</option>
          <option value="updatedAt">Recently updated</option>
        </select>
      </SettingRow>
    </>
  );
}
