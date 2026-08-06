import assert from "node:assert/strict";
import test from "node:test";
import { appendCategorizedNote } from "./categorizedNotes.ts";

test("creates one mail category and keeps later mail notes inside it", () => {
  const first = appendCategorizedNote("Personal", "Mail notes", "First", "One", "today");
  const second = appendCategorizedNote(first, "Mail notes", "Second", "Two", "tomorrow");
  assert.equal(second.match(/## Mail notes/g)?.length, 1);
  assert.match(second, /## Mail notes\n\n### Second[\s\S]*### First/);
});
