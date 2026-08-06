import assert from "node:assert/strict";
import test from "node:test";
import type { Page } from "@crewmate/types";
import {
  appendCustomPage,
  normalizeCustomPageUrl,
  toEmbeddableCustomPageUrl,
  updateCustomPage,
} from "./pages.ts";

const pages: Page[] = [
  {
    id: "mail",
    type: "mail",
    label: "Mail",
    keybinding: "1",
  },
];

test("appends custom pages", () => {
  assert.deepEqual(
    appendCustomPage(pages, {
      id: "custom-1",
      type: "custom",
      label: "Dashboard",
      url: "https://example.com",
    }),
    [
      ...pages,
      {
        id: "custom-1",
        type: "custom",
        label: "Dashboard",
        url: "https://example.com/",
        keybinding: "2",
      },
    ],
  );
});

test("normalizes safe page URLs and rejects non-web schemes", () => {
  assert.equal(normalizeCustomPageUrl("example.com"), "https://example.com/");
  assert.equal(normalizeCustomPageUrl("javascript:alert(1)"), null);
});

test("uses official iframe-compatible Google page variants", () => {
  assert.equal(
    toEmbeddableCustomPageUrl("https://www.google.com/"),
    "https://www.google.com/webhp?igu=1",
  );
  assert.equal(
    toEmbeddableCustomPageUrl("https://docs.google.com/document/d/abc/edit"),
    "https://docs.google.com/document/d/abc/preview",
  );
});

test("updates only custom pages with a valid URL", () => {
  const custom = appendCustomPage(pages, {
    id: "custom-1",
    type: "custom",
    label: "Old",
    url: "example.com",
  });
  assert.equal(updateCustomPage(custom, "custom-1", { label: "New", url: "google.com" })[1].url, "https://google.com/");
  assert.equal(updateCustomPage(pages, "mail", { label: "Changed", url: "example.com" }), pages);
});

test("rejects creation of built-in feature pages", () => {
  const result = appendCustomPage(pages, {
    id: "another-mail",
    type: "mail",
    label: "Other mail",
  });

  assert.equal(result, pages);
});
