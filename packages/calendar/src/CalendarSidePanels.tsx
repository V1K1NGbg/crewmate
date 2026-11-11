"use client";

import type { PointerEventHandler } from "react";
import {
  AlignLeft,
  Calendar as CalIcon,
  CheckSquare,
  Clock,
  Download,
  FileText,
  MapPin,
  X,
} from "lucide-react";
import { format } from "date-fns";
import type { Note, Task } from "@crewmate/types";
import type { CalendarEvent } from "./useCalendar";

interface ResizeHandle {
  width: number;
  onPointerDown: PointerEventHandler<HTMLDivElement>;
  onPointerMove: PointerEventHandler<HTMLDivElement>;
  onPointerUp: PointerEventHandler<HTMLDivElement>;
  onPointerCancel: PointerEventHandler<HTMLDivElement>;
  onLostPointerCapture: PointerEventHandler<HTMLDivElement>;
}

/** Side panel listing open tasks and notes that can be turned into events. */
export function CalendarImportPanel({
  tasks,
  notes,
  resize,
  onClose,
  onImportTask,
  onImportNote,
}: {
  tasks: Task[];
  notes: Note[];
  resize: ResizeHandle;
  onClose: () => void;
  onImportTask: (task: Task) => void;
  onImportNote: (note: Note) => void;
}) {
  return (
    <aside
      className="flex-shrink-0 flex flex-col border-l border-border bg-bg overflow-hidden relative"
      style={{
        width: resize.width,
        animation: "slideInRight 200ms ease-out",
      }}
    >
      <div
        className="resize-handle"
        style={{ left: 0 }}
        onPointerDown={resize.onPointerDown}
        onPointerMove={resize.onPointerMove}
        onPointerUp={resize.onPointerUp}
        onPointerCancel={resize.onPointerCancel}
        onLostPointerCapture={resize.onLostPointerCapture}
      />
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Download size={13} className="text-accent" />
          <span className="text-xs font-semibold text-text">
            Import to Calendar
          </span>
        </div>
        <button
          aria-label="Close task import"
          onClick={onClose}
          className="text-text-3 hover:text-text p-1 rounded-lg hover:bg-surface-2 transition-colors"
        >
          <X size={14} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {tasks.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 px-4 py-2 text-xs uppercase tracking-widest text-text-3 font-semibold border-b border-border/50 sticky top-0 bg-bg">
              <CheckSquare size={12} /> Tasks
            </div>
            {tasks
              .filter((t) => t.status !== "completed")
              .map((task) => (
                <button
                  key={task.id}
                  onClick={() => onImportTask(task)}
                  className="w-full flex flex-col gap-0.5 px-4 py-2.5 text-left border-b border-border/30 hover:bg-surface transition-colors"
                >
                  <span className="text-xs text-text truncate">
                    {task.title}
                  </span>
                  {task.dueDate && (
                    <span className="text-xs text-text-3 flex items-center gap-1">
                      <Clock size={11} />
                      {format(new Date(task.dueDate), "MMM d")}
                    </span>
                  )}
                  <span
                    className={`text-xs font-medium ${task.priority === "high" ? "text-danger" : task.priority === "medium" ? "text-warning" : "text-text-3"}`}
                  >
                    {task.priority}
                  </span>
                </button>
              ))}
          </div>
        )}
        {notes.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 px-4 py-2 text-xs uppercase tracking-widest text-text-3 font-semibold border-b border-border/50 sticky top-0 bg-bg">
              <FileText size={12} /> Notes
            </div>
            {notes.map((note) => (
              <button
                key={note.id}
                onClick={() => onImportNote(note)}
                className="w-full flex flex-col gap-0.5 px-4 py-2.5 text-left border-b border-border/30 hover:bg-surface transition-colors"
              >
                <span className="text-xs text-text truncate">
                  {note.title}
                </span>
                <span className="text-xs text-text-3 truncate">
                  {note.content.replace(/[#*_`\n]/g, " ").slice(0, 50)}
                </span>
              </button>
            ))}
          </div>
        )}
        {tasks.length === 0 && notes.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 py-10 px-4 text-center">
            <Download size={20} className="text-text-3" />
            <p className="text-xs text-text-3 leading-relaxed">
              No tasks or notes loaded yet.
              <br />
              Open some in Tasks or Notes first.
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}

/** Read-only details of the selected event with edit/delete actions. */
export function EventDetailsPanel({
  event,
  color,
  whenLabel,
  calendarName,
  writable,
  onClose,
  onEdit,
  onDelete,
}: {
  event: CalendarEvent;
  color: string;
  whenLabel: string;
  calendarName?: string;
  writable: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className="absolute top-0 right-0 bottom-0 w-80 bg-bg border-l border-border flex flex-col z-40 shadow-2xl"
      style={{ animation: "slideInRight 200ms ease-out" }}
    >
      <div
        className="h-1 flex-shrink-0"
        style={{ backgroundColor: color }}
      />
      <div className="flex items-start justify-between px-5 py-4 border-b border-border">
        <div className="flex-1 min-w-0 pr-3">
          <span className="text-sm font-semibold text-text leading-snug block">
            {event.summary}
          </span>
        </div>
        <button
          aria-label="Close event details"
          onClick={onClose}
          className="text-text-3 hover:text-text p-1.5 rounded-lg hover:bg-surface transition-colors flex-shrink-0"
        >
          <X size={14} />
        </button>
      </div>
      <div className="flex flex-col gap-4 px-5 py-4 flex-1 overflow-y-auto">
        <div className="flex items-start gap-3 text-sm text-text-2">
          <Clock size={14} className="flex-shrink-0 mt-0.5 text-text-3" />
          <div className="leading-relaxed">
            {whenLabel}
          </div>
        </div>
        {event.location && (
          <div className="flex items-start gap-3 text-sm text-text-2">
            <MapPin
              size={14}
              className="flex-shrink-0 mt-0.5 text-text-3"
            />
            <span className="leading-relaxed">
              {event.location}
            </span>
          </div>
        )}
        {event.description && (
          <div className="flex items-start gap-3 text-sm text-text-2">
            <AlignLeft
              size={14}
              className="flex-shrink-0 mt-0.5 text-text-3"
            />
            <span className="leading-relaxed">
              {event.description}
            </span>
          </div>
        )}
        {calendarName && (
          <div className="flex items-start gap-3 text-sm text-text-2">
            <CalIcon
              size={14}
              className="flex-shrink-0 mt-0.5 text-text-3"
            />
            <span className="leading-relaxed">
              {calendarName}
            </span>
          </div>
        )}
      </div>
      <div className="px-5 pb-5 flex flex-col gap-2">
        <button
          onClick={onEdit}
          disabled={!writable}
          style={{ padding: "2px 12px" }}
          className="w-full text-sm font-medium text-text-2 border border-border-2 rounded-lg hover:bg-surface-2 hover:text-text transition-all"
        >
          Edit event
        </button>
        <button
          onClick={onDelete}
          disabled={!writable}
          style={{ padding: "2px 12px" }}
          className="w-full text-sm font-medium text-danger border border-danger/25 rounded-lg hover:bg-danger/8 hover:border-danger/50 transition-all"
        >
          Delete event
        </button>
      </div>
    </div>
  );
}
