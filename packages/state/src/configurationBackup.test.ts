import assert from "node:assert/strict";
import test from "node:test";
import {
  mergeAppConfiguration,
  mergeBackedUpPages,
  normalizeComponentSpacing,
  normalizeFeaturePages,
} from "./configurationBackup.ts";

const current = {
  pages: [
    { id: "notes", type: "notes", label: "Notes", keybinding: "1" },
  ],
  activePage: "notes",
  installedFeatures: [
    { id: "notes", packageName: "@crewmate/notes", installed: true },
    { id: "mail", packageName: "@crewmate/mail", installed: true },
  ],
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

test("restores only installed feature pages and falls back to a valid active page", () => {
  const pages = [
    {
      id: "unknown",
      type: "unknown",
      label: "Unknown",
      keybinding: "1",
    },
    { id: "mail", type: "mail", label: "Mail", keybinding: "2" },
  ];
  const merged = mergeAppConfiguration(current, {
    pages,
    activePage: "missing-page",
  });

  assert.deepEqual(merged.pages, [
    { id: "mail", type: "mail", label: "Mail", keybinding: "1" },
  ]);
  assert.equal(merged.activePage, "mail");
});

test("normalizes persisted pages and rejects unavailable or duplicate features", () => {
  assert.deepEqual(
    normalizeFeaturePages(
      [
        current.pages[0],
        { id: "other-notes", type: "notes", label: "Other notes" },
        { id: "unknown", type: "unknown", label: "Unknown" },
        null,
      ],
      ["notes", "mail"],
    ),
    current.pages,
  );
  assert.deepEqual(
    mergeBackedUpPages(current.pages, [], current.installedFeatures),
    [],
  );
});
