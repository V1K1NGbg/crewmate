import type { AppConfigurationBackup } from "@crewmate/state";
import type { EncryptedEnvironmentFile, Page, PageSettings } from "@crewmate/types";

const SETTINGS_SECTION_START = "---\n\nCrewmate settings\n";

interface StoredConfiguration extends AppConfigurationBackup {
  version: 1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readPages(value: unknown): Page[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const pages: Page[] = [];
  for (const [index, item] of value.entries()) {
    if (
      !isRecord(item) ||
      typeof item.id !== "string" ||
      typeof item.type !== "string" ||
      typeof item.label !== "string"
    ) {
      return undefined;
    }
    pages.push({
      id: item.id,
      type: item.type,
      label: item.label,
      keybinding:
        typeof item.keybinding === "string"
          ? item.keybinding
          : String(index + 1),
      ...(typeof item.icon === "string" ? { icon: item.icon } : {}),
      ...(typeof item.url === "string" ? { url: item.url } : {}),
    });
  }
  return pages;
}

function readPageSettings(value: unknown): Partial<PageSettings> | undefined {
  if (!isRecord(value)) return undefined;
  const settings: Partial<PageSettings> = {};
  if (isRecord(value.general)) {
    const general: Partial<PageSettings["general"]> = {};
    if (
      typeof value.general.autoRefreshInterval === "number" &&
      Number.isFinite(value.general.autoRefreshInterval)
    ) {
      general.autoRefreshInterval = value.general.autoRefreshInterval;
    }
    if (typeof value.general.colorScheme === "string") {
      general.colorScheme = value.general.colorScheme;
    }
    if (
      value.general.componentSpacing === "minimal" ||
      value.general.componentSpacing === "dense" ||
      value.general.componentSpacing === "compact" ||
      value.general.componentSpacing === "comfortable" ||
      value.general.componentSpacing === "spacious"
    ) {
      general.componentSpacing = value.general.componentSpacing;
    }
    settings.general = general as PageSettings["general"];
  }
  if (isRecord(value.features)) settings.features = value.features;
  return settings;
}

function readPanelWidths(value: unknown): Record<string, number> | undefined {
  if (!isRecord(value)) return undefined;
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, number] =>
        typeof entry[1] === "number" && Number.isFinite(entry[1]),
    ),
  );
}

function readEnvironmentVault(value: unknown): EncryptedEnvironmentFile | undefined {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    value.algorithm !== "AES-GCM" ||
    typeof value.salt !== "string" ||
    typeof value.iv !== "string" ||
    typeof value.ciphertext !== "string" ||
    typeof value.updatedAt !== "string"
  ) {
    return undefined;
  }
  return value as unknown as EncryptedEnvironmentFile;
}

function readBackup(value: unknown): AppConfigurationBackup | undefined {
  if (!isRecord(value) || value.version !== 1) return undefined;
  const backup: AppConfigurationBackup = {};
  const pages = readPages(value.pages);
  const pageSettings = readPageSettings(value.pageSettings);
  const panelWidths = readPanelWidths(value.panelWidths);
  const environmentVault = readEnvironmentVault(value.environmentVault);

  if (pages) backup.pages = pages;
  if (pageSettings) backup.pageSettings = pageSettings;
  if (panelWidths) backup.panelWidths = panelWidths;
  if (environmentVault) backup.environmentVault = environmentVault;
  if (typeof value.aiServerUrl === "string") backup.aiServerUrl = value.aiServerUrl;
  if (typeof value.assistantModel === "string") {
    backup.assistantModel = value.assistantModel;
  }
  return backup;
}

export function parseNotesDocument(documentContent: string): {
  body: string;
  backup?: AppConfigurationBackup;
} {
  const settingsStart = documentContent.lastIndexOf(SETTINGS_SECTION_START);
  if (settingsStart === -1) return { body: documentContent };

  const settingsSection = documentContent.slice(settingsStart);
  const jsonMatch = settingsSection.match(/```json\n([\s\S]*?)\n```/);
  let backup: AppConfigurationBackup | undefined;
  if (jsonMatch) {
    try {
      backup = readBackup(JSON.parse(jsonMatch[1]));
    } catch {
      // Keep the note usable when a user manually edits the managed footer.
    }
  }

  return {
    body: documentContent.slice(0, settingsStart).trimEnd(),
    ...(backup ? { backup } : {}),
  };
}

export function getNotesBody(documentContent: string): string {
  return parseNotesDocument(documentContent).body;
}

export function buildNotesDocument(
  body: string,
  backup: AppConfigurationBackup,
): string {
  const cleanBody = getNotesBody(body).trimEnd();
  const { activePage, ...notesBackup } = backup;
  void activePage;
  const stored: StoredConfiguration = { version: 1, ...notesBackup };
  const colorScheme = backup.pageSettings?.general?.colorScheme ?? "current";
  const pageLabels = backup.pages?.map((page) => page.label).join(", ") || "None";
  const footer = [
    "Crewmate settings",
    `Color scheme: ${colorScheme}`,
    `Pages: ${pageLabels}`,
    "The configuration below is managed by Crewmate.",
    "```json",
    JSON.stringify(stored, null, 2),
    "```",
  ].join("\n");

  const bodyWithSpacing = cleanBody ? `${cleanBody}\n\n` : "";
  return `${bodyWithSpacing}---\n\n${footer}\n`;
}
