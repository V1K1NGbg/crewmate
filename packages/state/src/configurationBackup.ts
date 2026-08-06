import type {
  ComponentSpacing,
  GeneralSettings,
  Page,
  PageSettings,
  EncryptedEnvironmentFile,
} from "@crewmate/types";

export const DEFAULT_COMPONENT_SPACING: ComponentSpacing = "compact";

export function normalizeComponentSpacing(
  value: unknown,
  fallback: ComponentSpacing = DEFAULT_COMPONENT_SPACING,
): ComponentSpacing {
  return value === "minimal" ||
    value === "dense" ||
    value === "compact" ||
    value === "comfortable" ||
    value === "spacious"
    ? value
    : fallback;
}

export interface AppConfigurationBackup {
  pages?: Page[];
  activePage?: string;
  pageSettings?: Partial<PageSettings>;
  panelWidths?: Record<string, number>;
  aiServerUrl?: string;
  assistantModel?: string;
  environmentVault?: EncryptedEnvironmentFile | null;
}

export interface AppConfigurationState {
  pages: Page[];
  activePage: string;
  pageSettings: PageSettings;
  panelWidths: Record<string, number>;
  aiServerUrl: string;
  assistantModel: string;
  environmentVault: EncryptedEnvironmentFile | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mergeFeatureSettings(
  current: Record<string, unknown>,
  saved: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!saved) return current;

  const merged = { ...current };
  for (const [featureId, savedSettings] of Object.entries(saved)) {
    const currentSettings = current[featureId];
    merged[featureId] =
      isRecord(currentSettings) && isRecord(savedSettings)
        ? { ...currentSettings, ...savedSettings }
        : savedSettings;
  }
  return merged;
}

export function mergeBackedUpPages(
  current: Page[],
  saved: Page[] | undefined,
  currentActivePage?: string,
): Page[] {
  if (!saved) return current;
  const currentCustom = current.filter((page) => page.type === "custom");
  const currentCustomById = new Map(
    currentCustom.map((page) => [page.id, page]),
  );
  const savedNonCustom = saved.filter((page) => page.type !== "custom");
  const savedCustom = saved
    .filter((page) => page.type === "custom")
    .map((page) => currentCustomById.get(page.id) ?? page);
  const savedIds = new Set(savedCustom.map((page) => page.id));
  const locallyAdded = currentCustom.filter(
    (page) => !savedIds.has(page.id) && page.id === currentActivePage,
  );
  return [...savedNonCustom, ...savedCustom, ...locallyAdded].map(
    (page, index) => ({ ...page, keybinding: String(index + 1) }),
  );
}

export function mergeAppConfiguration(
  current: AppConfigurationState,
  saved: AppConfigurationBackup,
): AppConfigurationState {
  const pages = mergeBackedUpPages(
    current.pages,
    saved.pages,
    current.activePage,
  );
  const currentActiveWasNotBackedUp =
    pages.some((page) => page.id === current.activePage) &&
    !saved.pages?.some((page) => page.id === current.activePage);
  const requestedActivePage = currentActiveWasNotBackedUp
    ? current.activePage
    : (saved.activePage ?? current.activePage);
  const activePage = pages.some((page) => page.id === requestedActivePage)
    ? requestedActivePage
    : (pages[0]?.id ?? "");
  const savedGeneral = saved.pageSettings?.general as
    | Partial<GeneralSettings>
    | undefined;

  return {
    pages,
    activePage,
    pageSettings: {
      general: {
        ...current.pageSettings.general,
        ...savedGeneral,
        componentSpacing: normalizeComponentSpacing(
          savedGeneral?.componentSpacing,
          normalizeComponentSpacing(
            current.pageSettings.general.componentSpacing,
          ),
        ),
      },
      features: mergeFeatureSettings(
        current.pageSettings.features,
        saved.pageSettings?.features,
      ),
    },
    panelWidths: {
      ...current.panelWidths,
      ...saved.panelWidths,
    },
    aiServerUrl: saved.aiServerUrl ?? current.aiServerUrl,
    assistantModel: saved.assistantModel ?? current.assistantModel,
    environmentVault:
      saved.environmentVault === undefined
        ? current.environmentVault
        : saved.environmentVault,
  };
}
