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
  EncryptedEnvironmentFile,
} from "@crewmate/types";
import {
  initializeAssistantSessions,
  removeAssistantSession,
  appendAssistantMessage,
} from "./assistantSessions";
import {
  mergeAppConfiguration,
  normalizeFeaturePages,
  normalizeComponentSpacing,
  type AppConfigurationBackup,
} from "./configurationBackup";

export type { AppConfigurationBackup } from "./configurationBackup";
export { buildAssistantSessionMemory } from "./assistantSessions";

/* ------------------------------------------------------------------ */
/* State & actions                                                     */
/* ------------------------------------------------------------------ */

const LEGACY_STORAGE_KEY = "crewmate-state";
const STORAGE_PREFIX = "crewmate-state:";
const STORAGE_SCHEMA_VERSION = 2;

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
  environmentVault: EncryptedEnvironmentFile | null;
  /** High-entropy local secret. Deliberately excluded from the Notes backup. */
  environmentPassword: string;
}

export type Action =
  | { type: "SET_ACTIVE_PAGE"; id: string }
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
  | { type: "SET_FEATURE_ENABLED"; page: Page; enabled: boolean }
  | { type: "RESTORE_APP_CONFIGURATION"; backup: AppConfigurationBackup }
  | { type: "SET_ENVIRONMENT_VAULT"; vault: EncryptedEnvironmentFile | null }
  | { type: "SET_ENVIRONMENT_PASSWORD"; password: string };

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function assignKeybindings(pages: Page[]): Page[] {
  return pages.map((p, i) => ({ ...p, keybinding: String(i + 1) }));
}

function storageKey(accountKey: string) {
  return `${STORAGE_PREFIX}${accountKey}`;
}

function loadPersisted(accountKey: string): Partial<AppState> {
  if (typeof localStorage === "undefined") return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey(accountKey)) ?? "{}") as Record<string, unknown>;
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    return parsed && typeof parsed === "object" ? parsed as Partial<AppState> : {};
  } catch {
    return {};
  }
}

function migratePageSettings(
  saved: Partial<PageSettings> | undefined,
  initialFeatureSettings: Record<string, unknown>,
): PageSettings {
  const savedGeneral = saved?.general;
  const features = { ...initialFeatureSettings };
  for (const [featureId, defaults] of Object.entries(initialFeatureSettings)) {
    const persisted = saved?.features?.[featureId];
    if (!persisted || typeof persisted !== "object" || Array.isArray(persisted)) continue;
    const migrated = { ...(defaults as Record<string, unknown>), ...(persisted as Record<string, unknown>) };
    if (featureId === "tasks") {
      const oldFilter = migrated.defaultFilter;
      migrated.defaultFilter = oldFilter === "done" ? "completed" : oldFilter === "pending" || oldFilter === "in-progress" ? "needsAction" : oldFilter;
      const oldSort = migrated.sortBy;
      migrated.sortBy = oldSort === "priority" ? "position" : oldSort === "createdAt" ? "updatedAt" : oldSort;
    }
    if (featureId === "mail") {
      const limit = Number(migrated.maxThreads);
      migrated.maxThreads = Number.isInteger(limit) && limit >= 1 && limit <= 50 ? limit : 20;
      if (typeof migrated.defaultQuery !== "string") migrated.defaultQuery = "in:inbox";
      if (typeof migrated.mainLanguage !== "string" || !migrated.mainLanguage.trim()) migrated.mainLanguage = "English";
      if (typeof migrated.autoTranslateForeignEmails !== "boolean") migrated.autoTranslateForeignEmails = true;
    }
    if (featureId === "calendar") {
      const start = Number(migrated.startHour);
      const end = Number(migrated.endHour);
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > 24 || start >= end) {
        migrated.startHour = 8;
        migrated.endHour = 20;
      }
    }
    features[featureId] = migrated;
  }
  return {
    general: {
      autoRefreshInterval: 0,
      colorScheme: "default",
      ...savedGeneral,
      componentSpacing: normalizeComponentSpacing(
        savedGeneral?.componentSpacing,
      ),
    },
    features: {
      ...features,
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
      return {
        ...state,
        assistantSessions: appendAssistantMessage(
          state.assistantSessions,
          action.message,
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

    case "RESTORE_APP_CONFIGURATION":
      return {
        ...state,
        ...mergeAppConfiguration(state, action.backup),
      };

    case "SET_ENVIRONMENT_VAULT":
      return { ...state, environmentVault: action.vault };

    case "SET_ENVIRONMENT_PASSWORD":
      return { ...state, environmentPassword: action.password };

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
  clearLocalData: (allAccounts?: boolean) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({
  children,
  initialInstalledFeatures,
  initialPages,
  initialFeatureSettings,
  accountKey,
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
  /** Stable opaque account namespace supplied by the authenticated host. */
  accountKey: string;
}) {
  const saved = typeof window !== "undefined" ? loadPersisted(accountKey) : {};
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
  const installedFeatureIds = (initialInstalledFeatures ?? [])
    .filter((feature) => feature.installed)
    .map((feature) => feature.id);
  const availableFeatureIds =
    installedFeatureIds.length > 0
      ? installedFeatureIds
      : (initialPages ?? []).map((page) => page.type);
  const persistedPages = Array.isArray(saved.pages)
    ? normalizeFeaturePages(saved.pages, availableFeatureIds)
    : (initialPages ?? []);
  const persistedActivePage =
    typeof saved.activePage === "string" &&
    persistedPages.some((page) => page.id === saved.activePage)
      ? saved.activePage
      : (persistedPages[0]?.id ?? "");

  const [state, dispatch] = useReducer(reducer, {
    pages: persistedPages,
    activePage: persistedActivePage,
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
    environmentVault: saved.environmentVault ?? null,
    environmentPassword:
      typeof saved.environmentPassword === "string"
        ? saved.environmentPassword
        : "",
  });

  const notifTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (state.environmentPassword) return;
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    dispatch({
      type: "SET_ENVIRONMENT_PASSWORD",
      password: btoa(binary)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, ""),
    });
  }, [state.environmentPassword]);

  const notify = useCallback(
    (message: string, type: AppNotification["type"] = "info") => {
      dispatch({
        type: "SET_NOTIFICATION",
        notification: { message, type },
      });
    },
    [],
  );

  const clearLocalData = useCallback((allAccounts = false) => {
    if (allAccounts) {
      for (let index = localStorage.length - 1; index >= 0; index -= 1) {
        const key = localStorage.key(index);
        if (key && (key.startsWith(STORAGE_PREFIX) || key === LEGACY_STORAGE_KEY || key.startsWith("crewmate-task-email:"))) {
          localStorage.removeItem(key);
        }
      }
    } else {
      localStorage.removeItem(storageKey(accountKey));
    }
    window.location.reload();
  }, [accountKey]);

  // Persist relevant slices to localStorage
  useEffect(() => {
    try {
      const assistantSessions = state.assistantSessions.slice(0, 25).map((session) => ({
        ...session,
        messages: session.messages.slice(-100),
      }));
      localStorage.setItem(
        storageKey(accountKey),
        JSON.stringify({
        schemaVersion: STORAGE_SCHEMA_VERSION,
        pages: state.pages,
        activePage: state.activePage,
        aiServerUrl: state.aiServerUrl,
        assistantModel: state.assistantModel,
        pageSettings: state.pageSettings,
        panelWidths: state.panelWidths,
        assistantSessions,
        activeSessionId: state.activeSessionId,
        environmentVault: state.environmentVault,
        environmentPassword: state.environmentPassword,
        }),
      );
    } catch {
      // Storage quota and privacy-mode failures must not break the app render loop.
    }
  }, [
    accountKey,
    state.pages,
    state.activePage,
    state.aiServerUrl,
    state.assistantModel,
    state.pageSettings,
    state.panelWidths,
    state.assistantSessions,
    state.activeSessionId,
    state.environmentVault,
    state.environmentPassword,
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
    <AppContext.Provider value={{ state, dispatch, notify, clearLocalData }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
