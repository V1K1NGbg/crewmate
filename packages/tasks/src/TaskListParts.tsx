"use client";

import type { RefObject } from "react";
import { Clock, Pencil, Trash2 } from "lucide-react";
import { format } from "date-fns";
import type { GoogleTask } from "./useTasks";

/** Completion checkbox shared by tasks and subtasks. */
export function TaskCheckbox({
  checked,
  onToggle,
  label,
  className = "",
  uncheckedBorder = "border-text-3",
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
  className?: string;
  uncheckedBorder?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={onToggle}
      className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
        checked ? "bg-accent border-accent" : uncheckedBorder
      } ${className}`}
    >
      {checked && (
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="text-white" aria-hidden="true">
          <path d="M2 5l2.5 2.5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}

/** Inline form for adding a subtask under a task. */
export function AddSubtaskForm({
  value,
  onChange,
  onSubmit,
  onCancel,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex items-center gap-2 pl-12 pr-4 py-2">
      <div className="w-6 h-6 flex-shrink-0" />
      <input
        autoFocus
        aria-label="Subtask title"
        className="flex-1 bg-bg border border-border-2 rounded-lg px-3 py-1.5 text-sm text-text outline-none focus:border-accent"
        placeholder="Subtask title..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSubmit();
          if (e.key === "Escape") onCancel();
        }}
      />
      <button
        onClick={onSubmit}
        disabled={!value.trim()}
        style={{ padding: "2px 12px" }}
        className="text-sm font-medium text-white bg-accent rounded-lg hover:bg-accent-hover disabled:opacity-40"
      >
        Add
      </button>
      <button
        onClick={onCancel}
        style={{ padding: "2px 10px" }}
        className="text-sm font-medium text-text-2 border border-border-2 rounded-lg hover:text-text hover:bg-surface-2 transition-all"
      >
        Cancel
      </button>
    </div>
  );
}

/** One subtask row, in view or inline-edit mode. */
export function SubtaskRow({
  subtask,
  editing,
  editTitle,
  onEditTitleChange,
  onStartEdit,
  onSave,
  onCancel,
  onToggle,
  onDelete,
}: {
  subtask: GoogleTask;
  editing: boolean;
  editTitle: string;
  onEditTitleChange: (value: string) => void;
  onStartEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const done = subtask.status === "completed";
  return (
    <div className="flex items-center gap-3 pl-12 pr-4 py-2 hover:bg-bg/40 transition-colors">
      <TaskCheckbox
        checked={done}
        onToggle={onToggle}
        label={`Mark "${subtask.title}" ${done ? "not done" : "done"}`}
        uncheckedBorder="border-border-2"
      />
      {editing ? (
        <div className="flex-1 flex items-center gap-2">
          <input
            autoFocus
            aria-label="Subtask title"
            className="flex-1 bg-bg border border-accent rounded-lg px-2 py-1 text-sm text-text outline-none"
            value={editTitle}
            onChange={(e) => onEditTitleChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSave();
              if (e.key === "Escape") onCancel();
            }}
          />
          <button
            onClick={onSave}
            disabled={!editTitle.trim()}
            style={{ padding: "2px 8px" }}
            className="text-xs font-semibold text-white bg-accent rounded hover:bg-accent-hover disabled:opacity-40"
          >
            Save
          </button>
          <button
            onClick={onCancel}
            style={{ padding: "2px 8px" }}
            className="text-xs font-medium text-text-2 border border-border-2 rounded hover:text-text hover:bg-surface-2"
          >
            Cancel
          </button>
        </div>
      ) : (
        <>
          <span className={`flex-1 text-sm truncate ${done ? "line-through text-text-3" : "text-text"}`}>
            {subtask.title}
          </span>
          {subtask.due && (
            <span className="flex items-center gap-1 text-xs text-text-3 flex-shrink-0">
              <Clock size={11} />
              {format(new Date(subtask.due), "MMM d")}
            </span>
          )}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              aria-label="Edit subtask"
              onClick={onStartEdit}
              className="w-8 h-8 flex items-center justify-center text-text-3 hover:text-accent hover:bg-accent/10 rounded-lg transition-colors"
              title="Edit subtask"
            >
              <Pencil size={13} />
            </button>
            <button
              aria-label="Delete subtask"
              onClick={onDelete}
              className="w-8 h-8 flex items-center justify-center text-text-3 hover:text-danger hover:bg-danger/10 rounded-lg transition-colors"
              title="Delete subtask"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** Confirmation before permanently deleting a task from Google Tasks. */
export function ConfirmDeleteTaskDialog({
  dialogRef,
  onCancel,
  onConfirm,
}: {
  dialogRef: RefObject<HTMLDivElement | null>;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-task-title"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="bg-surface border border-border-2 rounded-xl w-full max-w-sm shadow-2xl flex flex-col gap-4"
        style={{ padding: "20px" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col gap-1">
          <h3 id="delete-task-title" className="text-sm font-semibold text-text">Delete task?</h3>
          <p className="text-sm text-text-2 leading-relaxed">
            This task will be permanently removed from Google Tasks.
          </p>
        </div>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            style={{ padding: "2px 12px" }}
            className="text-sm font-medium text-text-2 border border-border-2 rounded-lg hover:text-text hover:bg-surface-2 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{ padding: "2px 12px" }}
            className="text-sm font-semibold text-white bg-danger rounded-lg hover:bg-red-600 transition-all"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
