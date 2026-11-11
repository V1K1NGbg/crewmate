import type { GeneralSettings, PageSettings } from "@crewmate/types";

/**
 * Versioned localStorage persistence for the app kernel.
 *
 * Every persisted payload carries `schemaVersion`. On load, payloads are
 * migrated one version at a time (`MIGRATIONS[v]` turns version v into v+1).
 * Unknown or newer versions are discarded rather than guessed at. To change
 * the persisted shape: bump `PERSISTED_SCHEMA_VERSION` and add a migration.
 */
export const PERSISTED_SCHEMA_VERSION = 2;
export const DEFAULT_AI_SERVER_URL = "http://127.0.0.1:8080/v1";
const LEGACY_OPENCODE_DEFAULT_URL = "http://localhost:4096";

export type PersistedRecord = Record<string, unknown>;

function isRecord(value: unknown): value is PersistedRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const MIGRATIONS: Record<number, (state: PersistedRecord) => PersistedRecord> = {
  /** v1 (unversioned): Opencode-specific AI settings → generic OpenAI-compatible server. */
  1: (state) => {
    const next = { ...state };
    if (typeof next.aiServerUrl !== "string") {
      const legacyUrl = next.opencodeUrl;
      if (typeof legacyUrl === "string" && legacyUrl && legacyUrl !== LEGACY_OPENCODE_DEFAULT_URL) {
        next.aiServerUrl = legacyUrl;
      }
      // Opencode model ids are meaningless for the new server type.
      delete next.assistantModel;
    }
    delete next.opencodeUrl;
    return next;
  },
};

/**
 * Parses and migrates a raw persisted payload to the current schema.
 * Malformed, unknown-version, or future-version payloads yield `{}` so the
 * app starts from defaults instead of crashing or misreading data.
 */
export function migratePersistedState(raw: unknown): PersistedRecord {
  if (!isRecord(raw)) return {};
  const version = raw.schemaVersion === undefined ? 1 : raw.schemaVersion;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1 || version > PERSISTED_SCHEMA_VERSION) {
    return {};
  }
  let state: PersistedRecord = { ...raw };
  for (let current = version; current < PERSISTED_SCHEMA_VERSION; current += 1) {
    const migrate = MIGRATIONS[current];
    if (!migrate) return {};
    state = migrate(state);
  }
  return { ...state, schemaVersion: PERSISTED_SCHEMA_VERSION };
}

/** Reads a JSON string from storage and migrates it; never throws. */
export function parsePersistedState(json: string | null): PersistedRecord {
  if (!json) return {};
  try {
    return migratePersistedState(JSON.parse(json));
  } catch {
    return {};
  }
}

const COMPONENT_SPACINGS = new Set(["minimal", "dense", "compact", "comfortable", "spacious"]);

/** Merges persisted general settings over defaults one key at a time, validating each value. */
export function normalizeGeneralSettings(saved: unknown): GeneralSettings {
  const value = isRecord(saved) ? saved : {};
  const interval = value.autoRefreshInterval;
  return {
    autoRefreshInterval:
      typeof interval === "number" && Number.isFinite(interval) && interval >= 0 && interval <= 86_400
        ? interval
        : 0,
    colorScheme:
      typeof value.colorScheme === "string" && value.colorScheme.trim() ? value.colorScheme : "default",
    componentSpacing: COMPONENT_SPACINGS.has(value.componentSpacing as string)
      ? (value.componentSpacing as GeneralSettings["componentSpacing"])
      : "compact",
  };
}

/**
 * Restores feature settings over each plugin's defaults and normalizes
 * values whose vocabulary or bounds changed over time.
 */
export function migratePageSettings(
  saved: unknown,
  initialFeatureSettings: Record<string, unknown>,
): PageSettings {
  const savedSettings = isRecord(saved) ? saved : {};
  const savedFeatures = isRecord(savedSettings.features) ? savedSettings.features : {};
  const features = { ...initialFeatureSettings };
  for (const [featureId, defaults] of Object.entries(initialFeatureSettings)) {
    const persisted = savedFeatures[featureId];
    if (!isRecord(persisted)) continue;
    const migrated = { ...(isRecord(defaults) ? defaults : {}), ...persisted };
    if (featureId === "tasks") {
      const oldFilter = migrated.defaultFilter;
      migrated.defaultFilter = oldFilter === "done" ? "completed" : oldFilter === "pending" || oldFilter === "in-progress" ? "needsAction" : oldFilter;
      const oldSort = migrated.sortBy;
      migrated.sortBy = oldSort === "priority" ? "position" : oldSort === "createdAt" ? "updatedAt" : oldSort;
    }
    if (featureId === "mail") {
      const limit = Number(migrated.maxThreads);
      migrated.maxThreads = Number.isInteger(limit) && limit >= 1 && limit <= 50 ? limit : 20;
      if (typeof migrated.defaultQuery !== "string" || !migrated.defaultQuery.trim()) migrated.defaultQuery = "in:inbox";
      const mainLanguage = typeof migrated.mainLanguage === "string" ? migrated.mainLanguage.trim().toLowerCase() : "";
      const legacyLanguages: Record<string, string> = { english: "en", dutch: "nl", german: "de", french: "fr", spanish: "es", italian: "it", portuguese: "pt" };
      migrated.mainLanguage = legacyLanguages[mainLanguage] ?? (mainLanguage || "en");
      if (typeof migrated.autoTranslateForeignEmails !== "boolean") migrated.autoTranslateForeignEmails = true;
      if (typeof migrated.allowAITranslationFallback !== "boolean") migrated.allowAITranslationFallback = false;
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
    general: normalizeGeneralSettings(savedSettings.general),
    features,
  };
}

/** Restores panel widths, dropping anything that is not a positive finite number. */
export function normalizePanelWidths(saved: unknown): Record<string, number> {
  if (!isRecord(saved)) return {};
  const widths: Record<string, number> = {};
  for (const [key, value] of Object.entries(saved)) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0 && value < 10_000) widths[key] = value;
  }
  return widths;
}
