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
  AppNotification,
  PageSettings,
  GeneralSettings,
  AssistantMessage,
  AssistantSession,
  FeaturePackageInfo,
} from "@crewmate/types";
import {
  initializeAssistantSessions,
  removeAssistantSession,
} from "./assistantSessions";

/* ------------------------------------------------------------------ */
/* State & actions                                                     */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = "crewmate-state";

export interface AppState {
  pages: Page[];
  activePage: string;
  aiServerUrl: string;
  assistantModel: string;
  aiOverlayOpen: boolean;
  aiServerAvailable: boolean;
  notification: AppNotification | null;
  pageSettings: PageSettings;
  assistantSessions: AssistantSession[];
  activeSessionId: string | null;
  panelWidths: Record<string, number>;
  installedFeatures: FeaturePackageInfo[];
  /** Shared, cross-feature data cache, keyed by feature plugin id (e.g. the
   * mail package publishes its fetched threads under `featureData.mail`) so
   * other features/the AI assistant can read it without the kernel needing
   * to know each feature's data shape. */
  featureData: Record<string, unknown>;
  /** One-shot "prefill" payloads a feature can leave for another page to pick
   * up on mount (e.g. "create a calendar event from this email"), keyed by
   * the target page id. */
  pagePrefills: Record<string, unknown>;
}

export type Action =
  | { type: "SET_ACTIVE_PAGE"; id: string }
  | { type: "ADD_PAGE"; page: Omit<Page, "keybinding"> }
  | { type: "REMOVE_PAGE"; id: string }
  | { type: "SET_AI_OVERLAY_OPEN"; open: boolean }
  | { type: "SET_AI_SERVER_URL"; url: string }
  | { type: "SET_ASSISTANT_MODEL"; model: string }
  | { type: "SET_AI_SERVER_AVAILABLE"; available: boolean }
  | { type: "SET_NOTIFICATION"; notification: AppNotification | null }
  | { type: "SET_FEATURE_DATA"; featureId: string; data: unknown }
  | { type: "SET_PAGE_PREFILL"; pageId: string; prefill: unknown }
  | { type: "CLEAR_PAGE_PREFILL"; pageId: string }
  | {
      type: "UPDATE_FEATURE_SETTINGS";
      featureId: string;
      settings: Record<string, unknown>;
    }
  | { type: "UPDATE_GENERAL_SETTINGS"; settings: Partial<GeneralSettings> }
  | { type: "SET_COLOR_SCHEME"; schemeId: string }
  | { type: "ADD_ASSISTANT_MESSAGE"; message: AssistantMessage }
  | { type: "CLEAR_ASSISTANT_MESSAGES" }
  | { type: "SET_ACTIVE_ASSISTANT_SESSION"; sessionId: string | null }
  | { type: "CREATE_ASSISTANT_SESSION"; session: AssistantSession }
  | { type: "DELETE_ASSISTANT_SESSION"; sessionId: string }
  | { type: "SET_PANEL_WIDTH"; key: string; width: number }
  | { type: "SET_INSTALLED_FEATURES"; features: FeaturePackageInfo[] }
  | { type: "SET_FEATURE_ENABLED"; page: Page; enabled: boolean };

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

function migratePageSettings(
  saved: Partial<PageSettings> | undefined,
  initialFeatureSettings: Record<string, unknown>,
): PageSettings {
  return {
    general: {
      autoRefreshInterval: 0,
      colorScheme: "default",
      ...(saved?.general ?? {}),
    },
    features: {
      ...initialFeatureSettings,
      ...(saved?.features ?? {}),
    },
  };
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
          ? (pages[0]?.id ?? "")
          : state.activePage;
      return { ...state, pages, activePage };
    }

    case "SET_AI_OVERLAY_OPEN":
      return { ...state, aiOverlayOpen: action.open };
    case "SET_AI_SERVER_URL":
      return { ...state, aiServerUrl: action.url };
    case "SET_ASSISTANT_MODEL":
      return { ...state, assistantModel: action.model };
    case "SET_AI_SERVER_AVAILABLE":
      return { ...state, aiServerAvailable: action.available };

    case "SET_NOTIFICATION":
      return { ...state, notification: action.notification };

    case "SET_FEATURE_DATA":
      return {
        ...state,
        featureData: { ...state.featureData, [action.featureId]: action.data },
      };

    case "SET_PAGE_PREFILL":
      return {
        ...state,
        pagePrefills: { ...state.pagePrefills, [action.pageId]: action.prefill },
      };
    case "CLEAR_PAGE_PREFILL": {
      const pagePrefills = { ...state.pagePrefills };
      delete pagePrefills[action.pageId];
      return { ...state, pagePrefills };
    }

    case "UPDATE_FEATURE_SETTINGS":
      return {
        ...state,
        pageSettings: {
          ...state.pageSettings,
          features: {
            ...state.pageSettings.features,
            [action.featureId]: {
              ...(state.pageSettings.features[action.featureId] as
                | Record<string, unknown>
                | undefined),
              ...action.settings,
            },
          },
        },
      };

    case "UPDATE_GENERAL_SETTINGS":
      return {
        ...state,
        pageSettings: {
          ...state.pageSettings,
          general: { ...state.pageSettings.general, ...action.settings },
        },
      };

    case "SET_COLOR_SCHEME":
      return {
        ...state,
        pageSettings: {
          ...state.pageSettings,
          general: {
            ...state.pageSettings.general,
            colorScheme: action.schemeId,
          },
        },
      };

    case "ADD_ASSISTANT_MESSAGE": {
      if (!state.activeSessionId) return state;
      return {
        ...state,
        assistantSessions: state.assistantSessions.map((s) =>
          s.id === state.activeSessionId
            ? { ...s, messages: [...s.messages, action.message] }
            : s,
        ),
      };
    }
    case "CLEAR_ASSISTANT_MESSAGES": {
      if (!state.activeSessionId) return state;
      return {
        ...state,
        assistantSessions: state.assistantSessions.map((s) =>
          s.id === state.activeSessionId ? { ...s, messages: [] } : s,
        ),
      };
    }
    case "SET_ACTIVE_ASSISTANT_SESSION":
      return { ...state, activeSessionId: action.sessionId };
    case "CREATE_ASSISTANT_SESSION":
      return {
        ...state,
        assistantSessions: [action.session, ...state.assistantSessions],
        activeSessionId: action.session.id,
      };
    case "DELETE_ASSISTANT_SESSION": {
      const assistantState = removeAssistantSession(
        state.assistantSessions,
        state.activeSessionId,
        action.sessionId,
      );
      return {
        ...state,
        ...assistantState,
      };
    }

    case "SET_PANEL_WIDTH":
      return {
        ...state,
        panelWidths: {
          ...state.panelWidths,
          [action.key]: action.width,
        },
      };

    case "SET_INSTALLED_FEATURES":
      return { ...state, installedFeatures: action.features };

    case "SET_FEATURE_ENABLED": {
      const isEnabled = state.pages.some((p) => p.type === action.page.type);
      if (action.enabled === isEnabled) return state;

      let pages: Page[];
      if (action.enabled) {
        pages = assignKeybindings([...state.pages, { ...action.page }]);
      } else {
        pages = assignKeybindings(
          state.pages.filter((p) => p.type !== action.page.type),
        );
      }

      const activePage = pages.some((p) => p.id === state.activePage)
        ? state.activePage
        : (pages[0]?.id ?? "");

      return { ...state, pages, activePage };
    }

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

export function AppProvider({
  children,
  initialInstalledFeatures,
  initialPages,
  initialFeatureSettings,
}: {
  children: ReactNode;
  /**
   * Feature-package availability computed server-side (see apps/web's
   * app/page.tsx), so the UI knows on first paint which @crewmate/* menu
   * packages are actually resolvable, without a client round-trip.
   */
  initialInstalledFeatures?: FeaturePackageInfo[];
  /** Default page list for a fresh install, built by the host app from its
   * plugin registry. The kernel itself has no built-in notion of pages. */
  initialPages?: Page[];
  /** Default settings blob per feature plugin id, built by the host app from
   * each plugin's own `defaultSettings`. */
  initialFeatureSettings?: Record<string, unknown>;
}) {
  const saved = typeof window !== "undefined" ? loadPersisted() : {};
  const legacySaved = saved as Partial<AppState> & { opencodeUrl?: string };
  const currentAIServerUrl =
    typeof saved.aiServerUrl === "string" ? saved.aiServerUrl : null;
  const hasCurrentAISettings = currentAIServerUrl !== null;
  const legacyAIServerUrl =
    legacySaved.opencodeUrl &&
    legacySaved.opencodeUrl !== "http://localhost:4096"
      ? legacySaved.opencodeUrl
      : null;
  const savedAIServerUrl =
    currentAIServerUrl ??
    legacyAIServerUrl ??
    "http://127.0.0.1:8080/v1";
  const initialAssistantState = initializeAssistantSessions(
    saved.assistantSessions,
    saved.activeSessionId,
  );

  const [state, dispatch] = useReducer(reducer, {
    pages: (saved.pages as Page[]) ?? initialPages ?? [],
    activePage:
      (saved.activePage as string) ?? initialPages?.[0]?.id ?? "",
    aiServerUrl: savedAIServerUrl,
    assistantModel: hasCurrentAISettings
      ? ((saved.assistantModel as string) ?? "")
      : "",
    aiOverlayOpen: false,
    aiServerAvailable: false,
    notification: null,
    pageSettings: migratePageSettings(
      saved.pageSettings as Partial<PageSettings> | undefined,
      initialFeatureSettings ?? {},
    ),
    ...initialAssistantState,
    panelWidths: (saved.panelWidths as Record<string, number>) ?? {},
    installedFeatures: initialInstalledFeatures ?? [],
    featureData: {},
    pagePrefills: {},
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
        aiServerUrl: state.aiServerUrl,
        assistantModel: state.assistantModel,
        pageSettings: state.pageSettings,
        panelWidths: state.panelWidths,
        assistantSessions: state.assistantSessions,
        activeSessionId: state.activeSessionId,
      }),
    );
  }, [
    state.pages,
    state.activePage,
    state.aiServerUrl,
    state.assistantModel,
    state.pageSettings,
    state.panelWidths,
    state.assistantSessions,
    state.activeSessionId,
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
