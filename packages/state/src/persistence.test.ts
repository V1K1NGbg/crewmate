import assert from "node:assert/strict";
import test from "node:test";
import {
  PERSISTED_SCHEMA_VERSION,
  migratePageSettings,
  migratePersistedState,
  normalizeGeneralSettings,
  normalizePanelWidths,
  parsePersistedState,
} from "./persistence.ts";

test("malformed storage yields empty state", () => {
  assert.deepEqual(parsePersistedState(null), {});
  assert.deepEqual(parsePersistedState("{oops"), {});
  assert.deepEqual(parsePersistedState("[1,2]"), {});
  assert.deepEqual(parsePersistedState("null"), {});
});

test("future or invalid schema versions reset instead of being misread", () => {
  assert.deepEqual(migratePersistedState({ schemaVersion: PERSISTED_SCHEMA_VERSION + 1, pages: [] }), {});
  assert.deepEqual(migratePersistedState({ schemaVersion: "2" }), {});
  assert.deepEqual(migratePersistedState({ schemaVersion: 0 }), {});
});

test("unversioned legacy Opencode settings migrate to the current schema", () => {
  const migrated = migratePersistedState({ opencodeUrl: "http://my-box:4096", assistantModel: "opencode/x", activePage: "mail" });
  assert.equal(migrated.schemaVersion, PERSISTED_SCHEMA_VERSION);
  assert.equal(migrated.aiServerUrl, "http://my-box:4096");
  assert.equal(migrated.assistantModel, undefined);
  assert.equal(migrated.opencodeUrl, undefined);
  assert.equal(migrated.activePage, "mail");
});

test("the old Opencode default URL is not carried over", () => {
  assert.equal(migratePersistedState({ opencodeUrl: "http://localhost:4096" }).aiServerUrl, undefined);
});

test("current-version payloads pass through unchanged", () => {
  const value = { schemaVersion: PERSISTED_SCHEMA_VERSION, aiServerUrl: "https://ai.example", assistantModel: "m" };
  assert.deepEqual(migratePersistedState(value), value);
});

test("general settings merge per key with validation", () => {
  assert.deepEqual(normalizeGeneralSettings({ colorScheme: "ocean" }), {
    autoRefreshInterval: 0,
    colorScheme: "ocean",
    componentSpacing: "compact",
  });
  assert.deepEqual(normalizeGeneralSettings({ autoRefreshInterval: "60", colorScheme: 4, componentSpacing: "huge" }), {
    autoRefreshInterval: 0,
    colorScheme: "default",
    componentSpacing: "compact",
  });
});

test("feature settings keep new defaults when old payloads lack fields", () => {
  const settings = migratePageSettings(
    { features: { calendar: { showWeekends: false }, unknown: { x: 1 } } },
    { calendar: { showWeekends: true, startHour: 8, endHour: 20, timezone: "UTC" } },
  );
  assert.deepEqual(settings.features.calendar, { showWeekends: false, startHour: 8, endHour: 20, timezone: "UTC" });
  assert.equal("unknown" in settings.features, false);
});

test("legacy task and mail vocabularies are normalized", () => {
  const settings = migratePageSettings(
    { features: { tasks: { defaultFilter: "done", sortBy: "priority" }, mail: { maxThreads: 500, defaultQuery: "" } } },
    { tasks: {}, mail: {} },
  );
  assert.equal((settings.features.tasks as Record<string, unknown>).defaultFilter, "completed");
  assert.equal((settings.features.tasks as Record<string, unknown>).sortBy, "position");
  assert.equal((settings.features.mail as Record<string, unknown>).maxThreads, 20);
  assert.equal((settings.features.mail as Record<string, unknown>).defaultQuery, "in:inbox");
});

test("panel widths drop invalid values", () => {
  assert.deepEqual(normalizePanelWidths({ a: 300, b: "wide", c: -1, d: Infinity }), { a: 300 });
  assert.deepEqual(normalizePanelWidths(null), {});
});
