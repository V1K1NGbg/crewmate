import test from "node:test";
import assert from "node:assert/strict";
import { setMarkdownTaskChecked } from "./markdownTasks.ts";

test("checks a task on the selected Markdown line", () => {
  const markdown = "- [ ] First\n- [ ] Second\n- [x] Third";

  assert.equal(
    setMarkdownTaskChecked(markdown, 2, true),
    "- [ ] First\n- [x] Second\n- [x] Third",
  );
});

test("unchecks nested and ordered tasks without changing their text", () => {
  const markdown = "1. [ ] Parent\n   - [X] Nested **task**";

  assert.equal(
    setMarkdownTaskChecked(markdown, 2, false),
    "1. [ ] Parent\n   - [ ] Nested **task**",
  );
});

test("leaves non-task and invalid source lines unchanged", () => {
  const markdown = "Paragraph with [ ] brackets\n- Regular list item";

  assert.equal(setMarkdownTaskChecked(markdown, 1, true), markdown);
  assert.equal(setMarkdownTaskChecked(markdown, 3, true), markdown);
  assert.equal(setMarkdownTaskChecked(markdown, 0, true), markdown);
});
