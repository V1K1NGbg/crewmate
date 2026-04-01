// ─── Page types ───────────────────────────────────────────────────────────────

export type PageType =
  | "mail"
  | "calendar"
  | "notes"
  | "tasks"
  | "custom";

export interface Page {
  id: string;
  type: PageType;
  label: string;
  icon: string;
  url?: string;
  keybinding: string;
}

// ─── Notes ────────────────────────────────────────────────────────────────────

export interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  fileName: string;
}

export interface NotePrefill {
  title: string;
  content: string;
}

// ─── Tasks ────────────────────────────────────────────────────────────────────

export interface SubTask {
  id: string;
  title: string;
  done: boolean;
}

export type TaskStatus = "pending" | "in-progress" | "done";
export type TaskPriority = "low" | "medium" | "high";

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate?: string;
  subtasks: SubTask[];
  createdAt: string;
  updatedAt: string;
  fileName: string;
}

export interface TaskPrefill {
  title: string;
  description?: string;
  dueDate?: string;
}

// ─── UI ───────────────────────────────────────────────────────────────────────

export type NotificationType = "info" | "success" | "error";

export interface AppNotification {
  message: string;
  type: NotificationType;
}

export interface CalendarPrefill {
  title: string;
  description?: string;
  dateHint?: string;
  startHint?: string;
  endHint?: string;
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export interface GmailSettings {
  maxThreads: number;
  defaultQuery: string;
  suggestionModel: string;
}

export interface CalendarSettings {
  defaultView: "month" | "week";
  showWeekends: boolean;
  showDeclined: boolean;
  startHour: number;
  endHour: number;
  timezone: string;
}

export interface NotesSettings {
  fontSize: number;
  autoSaveDelay: number;
}

export interface TasksSettings {
  defaultFilter: "all" | "pending" | "in-progress" | "done";
  sortBy: "priority" | "dueDate" | "createdAt";
}

export interface GeneralSettings {
  autoRefreshInterval: number; // seconds, 0 = disabled
}

export interface PageSettings {
  general: GeneralSettings;
  gmail: GmailSettings;
  calendar: CalendarSettings;
  notes: NotesSettings;
  tasks: TasksSettings;
}

// ─── AI Assistant ─────────────────────────────────────────────────────────────

export interface AssistantMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

// ─── Gmail ────────────────────────────────────────────────────────────────────

export interface GmailThread {
  id: string;
  snippet: string;
  subject: string;
  from: string;
  date: string;
  messageCount: number;
  unread: boolean;
}

export interface GmailMessage {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  snippet: string;
  body: string;
  labelIds: string[];
}

// ─── Calendar ─────────────────────────────────────────────────────────────────

export interface CalendarEventDateTime {
  dateTime?: string;
  date?: string;
  timeZone?: string;
}

export interface CalendarEvent {
  id: string;
  summary?: string;
  description?: string;
  start: CalendarEventDateTime;
  end: CalendarEventDateTime;
  location?: string;
  colorId?: string;
  htmlLink?: string;
}
