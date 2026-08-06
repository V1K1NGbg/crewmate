import assert from "node:assert/strict";
import test from "node:test";
import {
  mergeAppConfiguration,
  mergeBackedUpPages,
  normalizeComponentSpacing,
} from "./configurationBackup.ts";

const current = {
  pages: [
    { id: "notes", type: "notes", label: "Notes", keybinding: "1" },
    {
      id: "custom-1",
      type: "custom",
      label: "Dashboard",
      keybinding: "2",
      url: "https://example.com",
    },
  ],
  activePage: "notes",
  pageSettings: {
    general: {
      autoRefreshInterval: 30,
      colorScheme: "dracula",
      componentSpacing: "comfortable" as const,
    },
    features: {
      notes: { fontSize: 16, autoSaveDelay: 1000, futureSetting: true },
      mail: { maxThreads: 25 },
    },
  },
  panelWidths: { navigation: 240 },
  aiServerUrl: "http://localhost:8080/v1",
  assistantModel: "current-model",
  environmentVault: null,
};

test("normalizes component spacing values", () => {
  assert.equal(normalizeComponentSpacing("minimal"), "minimal");
  assert.equal(normalizeComponentSpacing("dense"), "dense");
  assert.equal(normalizeComponentSpacing("comfortable"), "comfortable");
  assert.equal(normalizeComponentSpacing("spacious"), "spacious");
  assert.equal(normalizeComponentSpacing(undefined), "compact");
  assert.equal(normalizeComponentSpacing("huge"), "compact");
});

test("restores backed-up configuration while retaining newly added settings", () => {
  const merged = mergeAppConfiguration(current, {
    pageSettings: {
      general: { colorScheme: "nord" },
      features: { notes: { fontSize: 14 } },
    },
    assistantModel: "saved-model",
  });

  assert.deepEqual(merged.pageSettings.general, {
    autoRefreshInterval: 30,
    colorScheme: "nord",
    componentSpacing: "comfortable",
  });
  assert.deepEqual(merged.pageSettings.features.notes, {
    fontSize: 14,
    autoSaveDelay: 1000,
    futureSetting: true,
  });
  assert.deepEqual(merged.pageSettings.features.mail, { maxThreads: 25 });
  assert.deepEqual(merged.pages, current.pages);
  assert.equal(merged.assistantModel, "saved-model");
});

test("ignores malformed component spacing from a backup", () => {
  const merged = mergeAppConfiguration(current, {
    pageSettings: {
      general: { componentSpacing: "huge" as "compact" },
    },
  });

  assert.equal(merged.pageSettings.general.componentSpacing, "comfortable");
});

test("restores custom pages and falls back to a valid active page", () => {
  const pages = [
    {
      id: "custom-2",
      type: "custom",
      label: "Portal",
      keybinding: "1",
      url: "https://example.org",
    },
  ];
  const merged = mergeAppConfiguration(current, {
    pages,
    activePage: "missing-page",
  });

  assert.deepEqual(merged.pages, pages);
  assert.equal(merged.activePage, "custom-2");
});

test("keeps a custom page added locally while a stale Notes backup loads", () => {
  const saved = [current.pages[0]];
  assert.deepEqual(
    mergeBackedUpPages(current.pages, saved, "custom-1").map(({ id }) => id),
    ["notes", "custom-1"],
  );
  const restored = mergeAppConfiguration(
    { ...current, activePage: "custom-1" },
    { pages: saved, activePage: "notes" },
  );
  assert.equal(restored.activePage, "custom-1");
});
