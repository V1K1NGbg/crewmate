"use client";

import type { ReactNode } from "react";

/**
 * Shared building blocks for feature plugin `SettingsSection` components, so
 * every package's settings tab (Gmail, Calendar, Notes, Tasks, or any future
 * plugin) looks consistent without each one re-implementing the same markup.
 */

export function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5 pb-5 border-b border-border/50 last:border-b-0 last:pb-0">
      <label className="text-sm font-medium text-text">{label}</label>
      {children}
      {description && (
        <span className="text-xs text-text-3">{description}</span>
      )}
    </div>
  );
}

export function SettingToggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <div className="flex flex-col gap-1 pb-5 border-b border-border/50 last:border-b-0 last:pb-0">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-text">{label}</span>
        <button
          onClick={onChange}
          className={`relative rounded-full transition-colors flex-shrink-0 ${checked ? "bg-accent" : "bg-border-2"}`}
          style={{ height: 22, width: 40 }}
        >
          <div
            className={`absolute top-[3px] w-4 h-4 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-[20px]" : "translate-x-[3px]"}`}
          />
        </button>
      </div>
      {description && (
        <span className="text-xs text-text-3">{description}</span>
      )}
    </div>
  );
}
