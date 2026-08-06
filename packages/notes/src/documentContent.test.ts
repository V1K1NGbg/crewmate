import assert from "node:assert/strict";
import test from "node:test";
import {
  buildNotesDocument,
  getNotesBody,
  parseNotesDocument,
} from "./documentContent.ts";

const backup = {
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
      notes: { fontSize: 14, autoSaveDelay: 1000 },
      mail: { maxThreads: 25 },
    },
  },
  panelWidths: { navigation: 240 },
  aiServerUrl: "http://localhost:8080/v1",
  assistantModel: "local-model",
};
const { activePage, ...backupWithoutActivePage } = backup;
void activePage;

test("backs up all settings, pages, and the color scheme below a divider", () => {
  const documentContent = buildNotesDocument("# My note\n\nDetails", backup);

  assert.match(documentContent, /\n\n---\n\nCrewmate settings\n/);
  assert.match(documentContent, /Color scheme: dracula/);
  assert.match(documentContent, /Pages: Notes, Dashboard/);
  assert.doesNotMatch(documentContent, /"activePage"/);
  assert.deepEqual(parseNotesDocument(documentContent), {
    body: "# My note\n\nDetails",
    backup: backupWithoutActivePage,
  });
});

test("ignores an active page stored by an older Notes footer", () => {
  const oldDocument = buildNotesDocument("Visible note", backup).replace(
    '"version": 1,',
    '"version": 1,\n  "activePage": "mail",',
  );

  assert.deepEqual(parseNotesDocument(oldDocument), {
    body: "Visible note",
    backup: backupWithoutActivePage,
  });
});

test("removes the managed configuration from content rendered by Notes", () => {
  assert.equal(getNotesBody(buildNotesDocument("Visible note", backup)), "Visible note");
});

test("round trips an encrypted environment vault below the visible note body", () => {
  const environmentVault = {
    version: 1 as const,
    algorithm: "AES-GCM" as const,
    salt: "salt",
    iv: "iv",
    ciphertext: "ciphertext",
    updatedAt: "2026-08-05T00:00:00.000Z",
  };
  const document = buildNotesDocument("Visible", { environmentVault });
  const parsed = parseNotesDocument(document);
  assert.equal(parsed.body, "Visible");
  assert.deepEqual(parsed.backup?.environmentVault, environmentVault);
});

test("hides the managed footer when the note body is empty", () => {
  assert.equal(getNotesBody(buildNotesDocument("", backup)), "");
});

test("does not mistake an ordinary markdown divider for the settings footer", () => {
  const body = "First section\n\n---\n\nSecond section";
  assert.equal(getNotesBody(body), body);
});

test("replaces an existing managed footer instead of duplicating it", () => {
  const firstDocument = buildNotesDocument("Visible note", backup);
  const updatedDocument = buildNotesDocument(firstDocument, {
    ...backup,
    pageSettings: {
      ...backup.pageSettings,
      general: {
        autoRefreshInterval: 30,
        colorScheme: "nord",
        componentSpacing: "comfortable" as const,
      },
    },
  });

  assert.equal(updatedDocument.match(/Crewmate settings/g)?.length, 1);
  assert.match(updatedDocument, /Color scheme: nord/);
});

test("keeps the note body and ignores a malformed backup", () => {
  const documentContent =
    "Visible note\n\n---\n\nCrewmate settings\n```json\n{bad json}\n```\n";

  assert.deepEqual(parseNotesDocument(documentContent), {
    body: "Visible note",
  });
});

test("upgrades the old settings footer without restoring old defaults", () => {
  const oldDocument =
    "Visible note\n\n---\n\nCrewmate settings\nFont size: 14px\nAuto-save delay: 1s\n";

  assert.deepEqual(parseNotesDocument(oldDocument), {
    body: "Visible note",
  });
  assert.deepEqual(
    parseNotesDocument(buildNotesDocument(getNotesBody(oldDocument), backup)),
    { body: "Visible note", backup: backupWithoutActivePage },
  );
});
