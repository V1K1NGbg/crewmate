"use client";

import {
    createContext,
    useContext,
    useEffect,
    useReducer,
    useRef,
    useCallback,
    type ReactNode,
    type Dispatch,
} from "react";
import type {
    Page,
    Note,
    Task,
    AppNotification,
    CalendarPrefill,
    NotePrefill,
    TaskPrefill,
    PageSettings,
    AssistantMessage,
    GmailThread,
    CalendarEvent,
} from "@/types";

/* ------------------------------------------------------------------ */
/* Default pages                                                       */
/* ------------------------------------------------------------------ */

const DEFAULT_PAGES: Page[] = [
    { id: "mail", type: "mail", label: "Mail", icon: "Mail", keybinding: "1" },
    {
        id: "calendar",
        type: "calendar",
        label: "Calendar",
        icon: "Calendar",
        keybinding: "2",
    },
    {
        id: "notes",
        type: "notes",
        label: "Notes",
        icon: "FileText",
        keybinding: "3",
    },
    {
        id: "tasks",
        type: "tasks",
        label: "Tasks",
        icon: "CheckSquare",
        keybinding: "4",
    },
];

/* ------------------------------------------------------------------ */
/* Default settings                                                    */
/* ------------------------------------------------------------------ */

export const DEFAULT_PAGE_SETTINGS: PageSettings = {
    general: { autoRefreshInterval: 0 },
    gmail: { maxThreads: 20, defaultQuery: "is:inbox", suggestionModel: "" },
    calendar: {
        defaultView: "month",
        showWeekends: true,
        showDeclined: false,
        startHour: 8,
        endHour: 20,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    notes: { fontSize: 14, autoSaveDelay: 1000 },
    tasks: { defaultFilter: "all", sortBy: "priority" },
};

/* ------------------------------------------------------------------ */
/* State & actions                                                     */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = "crewmate-state";

export interface AppState {
    pages: Page[];
    activePage: string;
    opencodeUrl: string;
    assistantModel: string;
    activeNoteId: string | null;
    opencodeOverlayOpen: boolean;
    opencodeAvailable: boolean;
    dataFileConnected: boolean;
    notes: Note[];
    tasks: Task[];
    notification: AppNotification | null;
    calendarPrefill: CalendarPrefill | null;
    notePrefill: NotePrefill | null;
    taskPrefill: TaskPrefill | null;
    pageSettings: PageSettings;
    assistantMessages: AssistantMessage[];
    panelWidths: Record<string, number>;
    gmailThreads: GmailThread[];
    calendarEvents: CalendarEvent[];
}

export type Action =
    | { type: "SET_ACTIVE_PAGE"; id: string }
    | { type: "ADD_PAGE"; page: Omit<Page, "keybinding"> }
    | { type: "REMOVE_PAGE"; id: string }
    | { type: "SET_OPENCODE_OVERLAY_OPEN"; open: boolean }
    | { type: "SET_OPENCODE_URL"; url: string }
    | { type: "SET_ASSISTANT_MODEL"; model: string }
    | { type: "SET_OPENCODE_AVAILABLE"; available: boolean }
    | { type: "SET_NOTES"; notes: Note[] }
    | { type: "ADD_NOTE"; note: Note }
    | { type: "UPDATE_NOTE"; id: string; partial: Partial<Note> }
    | { type: "DELETE_NOTE"; id: string }
    | { type: "SET_ACTIVE_NOTE_ID"; id: string | null }
    | { type: "SET_TASKS"; tasks: Task[] }
    | { type: "ADD_TASK"; task: Task }
    | { type: "UPDATE_TASK"; id: string; partial: Partial<Task> }
    | { type: "DELETE_TASK"; id: string }
    | { type: "SET_NOTIFICATION"; notification: AppNotification | null }
    | { type: "SET_CALENDAR_PREFILL"; prefill: CalendarPrefill }
    | { type: "CLEAR_CALENDAR_PREFILL" }
    | { type: "SET_NOTE_PREFILL"; prefill: NotePrefill }
    | { type: "CLEAR_NOTE_PREFILL" }
    | { type: "SET_TASK_PREFILL"; prefill: TaskPrefill }
    | { type: "CLEAR_TASK_PREFILL" }
    | {
          type: "UPDATE_PAGE_SETTINGS";
          key: keyof PageSettings;
          settings: Partial<PageSettings[keyof PageSettings]>;
      }
    | { type: "ADD_ASSISTANT_MESSAGE"; message: AssistantMessage }
    | { type: "CLEAR_ASSISTANT_MESSAGES" }
    | { type: "SET_PANEL_WIDTH"; key: string; width: number }
    | { type: "SET_GMAIL_THREADS"; threads: GmailThread[] }
    | { type: "SET_CALENDAR_EVENTS"; events: CalendarEvent[] }
    | { type: "SET_DATA_FILE_CONNECTED"; connected: boolean };

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function assignKeybindings(pages: Page[]): Page[] {
    return pages.map((p, i) => ({ ...p, keybinding: String(i + 1) }));
}

function loadPersisted(): Partial<AppState> {
    if (typeof localStorage === "undefined") return {};
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    } catch {
        return {};
    }
}

/* ------------------------------------------------------------------ */
/* Reducer                                                             */
/* ------------------------------------------------------------------ */

function reducer(state: AppState, action: Action): AppState {
    switch (action.type) {
        case "SET_ACTIVE_PAGE":
            return { ...state, activePage: action.id };

        case "ADD_PAGE": {
            const newPage: Page = {
                ...action.page,
                keybinding: String(state.pages.length + 1),
            };
            return { ...state, pages: [...state.pages, newPage] };
        }
        case "REMOVE_PAGE": {
            const pages = assignKeybindings(
                state.pages.filter((p) => p.id !== action.id),
            );
            const activePage =
                state.activePage === action.id
                    ? (pages[0]?.id ?? "mail")
                    : state.activePage;
            return { ...state, pages, activePage };
        }

        case "SET_OPENCODE_OVERLAY_OPEN":
            return { ...state, opencodeOverlayOpen: action.open };
        case "SET_OPENCODE_URL":
            return { ...state, opencodeUrl: action.url };
        case "SET_ASSISTANT_MODEL":
            return { ...state, assistantModel: action.model };
        case "SET_OPENCODE_AVAILABLE":
            return { ...state, opencodeAvailable: action.available };

        case "SET_NOTES":
            return { ...state, notes: action.notes };
        case "ADD_NOTE":
            return { ...state, notes: [action.note, ...state.notes] };
        case "UPDATE_NOTE":
            return {
                ...state,
                notes: state.notes.map((n) =>
                    n.id === action.id
                        ? {
                              ...n,
                              ...action.partial,
                              updatedAt: new Date().toISOString(),
                          }
                        : n,
                ),
            };
        case "DELETE_NOTE":
            return {
                ...state,
                notes: state.notes.filter((n) => n.id !== action.id),
            };
        case "SET_ACTIVE_NOTE_ID":
            return { ...state, activeNoteId: action.id };

        case "SET_TASKS":
            return { ...state, tasks: action.tasks };
        case "ADD_TASK":
            return { ...state, tasks: [action.task, ...state.tasks] };
        case "UPDATE_TASK":
            return {
                ...state,
                tasks: state.tasks.map((t) =>
                    t.id === action.id
                        ? {
                              ...t,
                              ...action.partial,
                              updatedAt: new Date().toISOString(),
                          }
                        : t,
                ),
            };
        case "DELETE_TASK":
            return {
                ...state,
                tasks: state.tasks.filter((t) => t.id !== action.id),
            };

        case "SET_NOTIFICATION":
            return { ...state, notification: action.notification };
        case "SET_CALENDAR_PREFILL":
            return { ...state, calendarPrefill: action.prefill };
        case "CLEAR_CALENDAR_PREFILL":
            return { ...state, calendarPrefill: null };
        case "SET_NOTE_PREFILL":
            return { ...state, notePrefill: action.prefill };
        case "CLEAR_NOTE_PREFILL":
            return { ...state, notePrefill: null };
        case "SET_TASK_PREFILL":
            return { ...state, taskPrefill: action.prefill };
        case "CLEAR_TASK_PREFILL":
            return { ...state, taskPrefill: null };

        case "UPDATE_PAGE_SETTINGS":
            return {
                ...state,
                pageSettings: {
                    ...state.pageSettings,
                    [action.key]: {
                        ...state.pageSettings[action.key],
                        ...action.settings,
                    },
                },
            };

        case "ADD_ASSISTANT_MESSAGE":
            return {
                ...state,
                assistantMessages: [...state.assistantMessages, action.message],
            };
        case "CLEAR_ASSISTANT_MESSAGES":
            return { ...state, assistantMessages: [] };

        case "SET_PANEL_WIDTH":
            return {
                ...state,
                panelWidths: {
                    ...state.panelWidths,
                    [action.key]: action.width,
                },
            };

        case "SET_GMAIL_THREADS":
            return { ...state, gmailThreads: action.threads };
        case "SET_CALENDAR_EVENTS":
            return { ...state, calendarEvents: action.events };

        case "SET_DATA_FILE_CONNECTED":
            return { ...state, dataFileConnected: action.connected };

        default:
            return state;
    }
}

/* ------------------------------------------------------------------ */
/* Context                                                             */
/* ------------------------------------------------------------------ */

interface AppContextValue {
    state: AppState;
    dispatch: Dispatch<Action>;
    notify: (message: string, type?: AppNotification["type"]) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
    const saved = typeof window !== "undefined" ? loadPersisted() : {};

    const [state, dispatch] = useReducer(reducer, {
        pages: (saved.pages as Page[]) ?? DEFAULT_PAGES,
        activePage: (saved.activePage as string) ?? "mail",
        opencodeUrl: (saved.opencodeUrl as string) ?? "http://localhost:4096",
        assistantModel: (saved.assistantModel as string) ?? "",
        activeNoteId: (saved.activeNoteId as string | null) ?? null,
        opencodeOverlayOpen: false,
        opencodeAvailable: false,
        dataFileConnected: false,
        notes: [],
        tasks: [],
        notification: null,
        calendarPrefill: null,
        notePrefill: null,
        taskPrefill: null,
        pageSettings: {
            ...DEFAULT_PAGE_SETTINGS,
            ...(saved.pageSettings ?? {}),
        } as PageSettings,
        assistantMessages: [],
        panelWidths: (saved.panelWidths as Record<string, number>) ?? {},
        gmailThreads: [],
        calendarEvents: [],
    });

    const notifTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const notify = useCallback(
        (message: string, type: AppNotification["type"] = "info") => {
            dispatch({
                type: "SET_NOTIFICATION",
                notification: { message, type },
            });
        },
        [],
    );

    // Persist relevant slices to localStorage
    useEffect(() => {
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({
                pages: state.pages,
                activePage: state.activePage,
                opencodeUrl: state.opencodeUrl,
                assistantModel: state.assistantModel,
                activeNoteId: state.activeNoteId,
                pageSettings: state.pageSettings,
                panelWidths: state.panelWidths,
            }),
        );
    }, [
        state.pages,
        state.activePage,
        state.opencodeUrl,
        state.assistantModel,
        state.activeNoteId,
        state.pageSettings,
        state.panelWidths,
    ]);

    // Auto-dismiss notifications after 3.5s
    useEffect(() => {
        if (notifTimerRef.current) clearTimeout(notifTimerRef.current);
        if (state.notification) {
            notifTimerRef.current = setTimeout(() => {
                dispatch({ type: "SET_NOTIFICATION", notification: null });
            }, 3500);
        }
    }, [state.notification]);

    return (
        <AppContext.Provider value={{ state, dispatch, notify }}>
            {children}
        </AppContext.Provider>
    );
}

export function useApp() {
    const ctx = useContext(AppContext);
    if (!ctx) throw new Error("useApp must be used within AppProvider");
    return ctx;
}
