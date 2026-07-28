import type { ComponentType } from "react";

// ─── Page types ───────────────────────────────────────────────────────────────

/**
 * A page's `type` is either the id of an installed feature plugin (see
 * `FeaturePlugin` below) or the reserved `"custom"` kind for user-defined
 * URL-embed tabs. It is a plain string (not a fixed union) so the app can
 * host any number of feature packages without the shared types needing to
 * know their names in advance.
 */
export type PageType = string;

export interface Page {
  id: string;
  type: PageType;
  label: string;
  /** Only meaningful for `type: "custom"` pages — plugin pages use their own icon. */
  icon?: string;
  url?: string;
  keybinding: string;
}

// ─── Feature packages (pluggable menus) ────────────────────────────────────────

/** Identifies a pluggable menu feature package, e.g. "mail" or "calendar". */
export type FeaturePackageId = string;

/**
 * Describes whether a given @crewmate/* feature package is actually present
 * in the current install (declared as a dependency of the app), independent
 * of whether the user has chosen to enable it in the UI.
 */
export interface FeaturePackageInfo {
  id: FeaturePackageId;
  packageName: string;
  installed: boolean;
}

// ─── Feature plugin contract ───────────────────────────────────────────────────
//
// This is the single contract every @crewmate/* menu package implements to
// plug itself into the host app. The app never imports a feature package's
// internals directly — it only ever talks to this shape, so it can compose
// any number of installed/enabled plugins generically.

export interface FeatureSettingsProps<TSettings = Record<string, unknown>> {
  settings: TSettings;
  onChange: (partial: Partial<TSettings>) => void;
}

/** Generic dispatch shape accepted by assistant action handlers, matching
 * `Dispatch<Action>` from `@crewmate/state` structurally without needing to
 * import it (which would create a circular package dependency). */
export type GenericDispatch = (
  action: { type: string } & Record<string, unknown>,
) => void;

export interface AssistantActionDef {
  /** Discriminator matched against the AI's suggested action type, e.g. "create_event". */
  type: string;
  icon: ComponentType<{ size?: number }>;
  /** Appended to the assistant's system prompt to document this action's JSON shape. */
  promptHint: string;
  /**
   * Builds this plugin's page-prefill payload from the AI's action payload.
   * Omit for actions that only need to navigate (no prefill), e.g. "open_event".
   */
  buildPrefill?: (payload: Record<string, unknown> | undefined) => unknown;
}

export interface FeaturePlugin<TSettings = Record<string, unknown>> {
  /** Stable id, also used as the page `type`/`id` and the settings/data bucket key. */
  id: string;
  packageName: string;
  label: string;
  description: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  /** Fallback identity color (hex/rgb) used when the active color scheme has no override. */
  color: string;
  keybinding?: string;
  /** Whether a fresh install should show this page by default. */
  enabledByDefault?: boolean;
  Page: ComponentType;
  defaultSettings: TSettings;
  SettingsSection?: ComponentType<FeatureSettingsProps<TSettings>>;
  /** Builds a text block describing this feature's current data for the AI
   * assistant's context prompt. Receives `state.featureData[plugin.id]`. */
  buildAssistantContext?: (data: unknown) => string | null;
  /** Extra assistant actions this feature contributes to the global AI chat. */
  assistantActions?: AssistantActionDef[];
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
  emailContext?: string;
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
  endDateHint?: string; // for multi-day all-day events
  emailContext?: string;
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
  /**
   * Per-page identity colors, keyed by feature plugin id. Optional — a
   * plugin without an entry here falls back to its own `FeaturePlugin.color`.
   * Kept generic so themes don't need to know which packages are installed.
   */
  pages?: Record<string, string>;
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
      pages: {
        mail: "#f87171", // red
        calendar: "#818cf8", // indigo
        notes: "#fbbf24", // amber
        tasks: "#4ade80", // green
      },
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
      pages: {
        mail: "#f92672", // pink-red
        calendar: "#66d9e8", // cyan
        notes: "#e6db74", // yellow
        tasks: "#a6e22e", // green
      },
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
      pages: {
        mail: "#bf616a", // red
        calendar: "#88c0d0", // cyan
        notes: "#ebcb8b", // yellow
        tasks: "#a3be8c", // green
      },
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
      pages: {
        mail: "#dc322f", // red
        calendar: "#268bd2", // blue
        notes: "#b58900", // yellow
        tasks: "#859900", // green
      },
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
      pages: {
        mail: "#ff5555", // red
        calendar: "#bd93f9", // purple
        notes: "#f1fa8c", // yellow
        tasks: "#50fa7b", // green
      },
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
      pages: {
        mail: "#fb4934", // red
        calendar: "#83a598", // aqua
        notes: "#fe8019", // orange
        tasks: "#b8bb26", // green
      },
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
      pages: {
        mail: "#dc2626", // red
        calendar: "#6366f1", // indigo
        notes: "#ca8a04", // amber
        tasks: "#16a34a", // green
      },
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
      pages: {
        mail: "#dc322f", // red
        calendar: "#268bd2", // blue
        notes: "#b58900", // yellow
        tasks: "#859900", // green
      },
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
      pages: {
        mail: "#cf222e", // red
        calendar: "#0969da", // blue
        notes: "#9a6700", // amber
        tasks: "#1a7f37", // green
      },
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
      pages: {
        mail: "#d20f39", // red
        calendar: "#7287fd", // lavender
        notes: "#df8e1d", // yellow
        tasks: "#40a02b", // green
      },
    },
  },
];

// ─── Settings ─────────────────────────────────────────────────────────────────

export interface GeneralSettings {
  autoRefreshInterval: number; // seconds, 0 = disabled
  colorScheme: string; // color scheme id
}

/**
 * Feature-specific settings are opaque to the shared kernel — each plugin
 * defines and owns its own settings shape (see its `defaultSettings` /
 * `SettingsSection`) and reads/writes its slot in `features` by its id.
 */
export interface PageSettings {
  general: GeneralSettings;
  features: Record<string, unknown>;
}

// ─── AI Assistant ─────────────────────────────────────────────────────────────

export interface AssistantAction {
  type: string;
  label: string;
  payload?: Record<string, unknown>;
}

export interface AssistantMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  sessionId: string;
  actions?: AssistantAction[];
}

export interface AssistantSession {
  id: string;
  title: string;
  createdAt: string;
  messages: AssistantMessage[];
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
  calendarId?: string; // which calendar this event belongs to
}
