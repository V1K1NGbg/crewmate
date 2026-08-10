import type {
  ComponentSpacing,
  GeneralSettings,
  Page,
  PageSettings,
  EncryptedEnvironmentFile,
  FeaturePackageInfo,
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
  installedFeatures: FeaturePackageInfo[];
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

export function normalizeFeaturePages(
  value: unknown,
  availableFeatureIds: Iterable<string>,
): Page[] {
  if (!Array.isArray(value)) return [];
  const available = new Set(availableFeatureIds);
  const seenTypes = new Set<string>();
  const pages: Page[] = [];

  for (const candidate of value) {
    if (!isRecord(candidate)) continue;
    const { id, type, label } = candidate;
    if (
      typeof id !== "string" ||
      typeof type !== "string" ||
      typeof label !== "string" ||
      !available.has(type) ||
      seenTypes.has(type)
    ) {
      continue;
    }
    seenTypes.add(type);
    pages.push({ id, type, label, keybinding: String(pages.length + 1) });
  }

  return pages;
}

export function mergeBackedUpPages(
  current: Page[],
  saved: Page[] | undefined,
  installedFeatures: FeaturePackageInfo[],
): Page[] {
  if (!saved) return current;
  return normalizeFeaturePages(
    saved,
    installedFeatures
      .filter((feature) => feature.installed)
      .map((feature) => feature.id),
  );
}

export function mergeAppConfiguration(
  current: AppConfigurationState,
  saved: AppConfigurationBackup,
): AppConfigurationState {
  const pages = mergeBackedUpPages(
    current.pages,
    saved.pages,
    current.installedFeatures,
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
    installedFeatures: current.installedFeatures,
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
