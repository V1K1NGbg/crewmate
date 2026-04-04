// ─── Page types ───────────────────────────────────────────────────────────────

export type PageType = "mail" | "calendar" | "notes" | "tasks" | "custom";

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

// ─── Color Schemes ────────────────────────────────────────────────────────────

export interface ColorSchemeColors {
  bg: string;
  surface: string;
  surface2: string;
  border: string;
  border2: string;
  text: string;
  text2: string;
  text3: string;
  accent: string;
  accentHover: string;
  accentMuted: string;
  success: string;
  warning: string;
  danger: string;
}

export interface ColorScheme {
  id: string;
  name: string;
  colors: ColorSchemeColors;
}

export const COLOR_SCHEMES: ColorScheme[] = [
  {
    id: "default",
    name: "Default",
    colors: {
      bg: "#09090b",
      surface: "#18181b",
      surface2: "#27272a",
      border: "#27272a",
      border2: "#3f3f46",
      text: "#fafafa",
      text2: "#a1a1aa",
      text3: "#71717a",
      accent: "#818cf8",
      accentHover: "#6366f1",
      accentMuted: "#818cf820",
      success: "#4ade80",
      warning: "#fbbf24",
      danger: "#f87171",
    },
  },
  {
    id: "monokai",
    name: "Monokai",
    colors: {
      bg: "#191919",
      surface: "#1e1e1e",
      surface2: "#262626",
      border: "#404040",
      border2: "#505050",
      text: "#f8f8f2",
      text2: "#cfcfc2",
      text3: "#75715e",
      accent: "#f92672",
      accentHover: "#fd4f85",
      accentMuted: "#f9267230",
      success: "#a6e22e",
      warning: "#e6db74",
      danger: "#f92672",
    },
  },
  {
    id: "nord",
    name: "Nord",
    colors: {
      bg: "#2e3440",
      surface: "#3b4252",
      surface2: "#434c5e",
      border: "#3b4252",
      border2: "#4c566a",
      text: "#eceff4",
      text2: "#d8dee9",
      text3: "#9099a5",
      accent: "#88c0d0",
      accentHover: "#81a1c1",
      accentMuted: "#88c0d030",
      success: "#a3be8c",
      warning: "#ebcb8b",
      danger: "#bf616a",
    },
  },
  {
    id: "solarized-dark",
    name: "Solarized Dark",
    colors: {
      bg: "#002b36",
      surface: "#073642",
      surface2: "#094151",
      border: "#073642",
      border2: "#586e75",
      text: "#839496",
      text2: "#93a1a1",
      text3: "#657b83",
      accent: "#268bd2",
      accentHover: "#1a6fb3",
      accentMuted: "#268bd230",
      success: "#859900",
      warning: "#b58900",
      danger: "#dc322f",
    },
  },
  {
    id: "dracula",
    name: "Dracula",
    colors: {
      bg: "#282a36",
      surface: "#383a59",
      surface2: "#44475a",
      border: "#383a59",
      border2: "#6272a4",
      text: "#f8f8f2",
      text2: "#d0d0d0",
      text3: "#6272a4",
      accent: "#bd93f9",
      accentHover: "#a77bf3",
      accentMuted: "#bd93f930",
      success: "#50fa7b",
      warning: "#f1fa8c",
      danger: "#ff5555",
    },
  },
  {
    id: "gruvbox-dark",
    name: "Gruvbox Dark",
    colors: {
      bg: "#282828",
      surface: "#3c3836",
      surface2: "#504945",
      border: "#3c3836",
      border2: "#665c54",
      text: "#ebdbb2",
      text2: "#d5c4a1",
      text3: "#928374",
      accent: "#fabd2f",
      accentHover: "#f0b030",
      accentMuted: "#fabd2f30",
      success: "#b8bb26",
      warning: "#fabd2f",
      danger: "#fb4934",
    },
  },
  {
    id: "light",
    name: "Light",
    colors: {
      bg: "#ffffff",
      surface: "#f5f5f5",
      surface2: "#ebebeb",
      border: "#e5e5e5",
      border2: "#d4d4d4",
      text: "#171717",
      text2: "#525252",
      text3: "#737373",
      accent: "#6366f1",
      accentHover: "#4f46e5",
      accentMuted: "#6366f120",
      success: "#16a34a",
      warning: "#ca8a04",
      danger: "#dc2626",
    },
  },
  {
    id: "solarized-light",
    name: "Solarized Light",
    colors: {
      bg: "#fdf6e3",
      surface: "#eee8d5",
      surface2: "#e4ddc7",
      border: "#eee8d5",
      border2: "#d9c8a5",
      text: "#657b83",
      text2: "#586e75",
      text3: "#93a1a1",
      accent: "#268bd2",
      accentHover: "#1a6fb3",
      accentMuted: "#268bd230",
      success: "#859900",
      warning: "#b58900",
      danger: "#dc322f",
    },
  },
  {
    id: "github-light",
    name: "GitHub Light",
    colors: {
      bg: "#ffffff",
      surface: "#f6f8fa",
      surface2: "#eaeef2",
      border: "#d0d7de",
      border2: "#d8dee9",
      text: "#24292f",
      text2: "#57606a",
      text3: "#8c959f",
      accent: "#0969da",
      accentHover: "#0550ae",
      accentMuted: "#0969da20",
      success: "#1a7f37",
      warning: "#9a6700",
      danger: "#cf222e",
    },
  },
  {
    id: "catppuccin-latte",
    name: "Latte",
    colors: {
      bg: "#eff1f5",
      surface: "#e6e9ef",
      surface2: "#ccd0da",
      border: "#e6e9ef",
      border2: "#bcc0cc",
      text: "#4c4f69",
      text2: "#5c5f77",
      text3: "#9ca0b0",
      accent: "#7287fd",
      accentHover: "#5c6bc0",
      accentMuted: "#7287fd20",
      success: "#40a02b",
      warning: "#df8e1d",
      danger: "#d20f39",
    },
  },
];

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
  colorScheme: string; // color scheme id
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
