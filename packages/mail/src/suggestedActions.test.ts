import assert from "node:assert/strict";
import test from "node:test";
import { orderSuggestedActions, sanitizeSuggestedActions } from "./suggestedActions.ts";

const all = { calendar: true, tasks: true, notes: true };

test("drops unknown types, missing labels and disabled targets", () => {
  const actions = sanitizeSuggestedActions(
    [
      { type: "delete_everything", label: "x" },
      { type: "create_task", label: "  " },
      { type: "create_event", label: "Meet" },
      null,
      "string",
      { type: "reply_draft", label: "Reply" },
    ],
    { calendar: false, tasks: true, notes: true },
  );
  assert.deepEqual(actions.map((a) => a.type), ["reply_draft"]);
});

test("keeps only bounded string payload fields", () => {
  const [action] = sanitizeSuggestedActions(
    [{ type: "create_task", label: "L".repeat(200), payload: { title: "T", dateHint: 42, evil: "x", replyDraft: "" } }],
    all,
  );
  assert.equal(action.label.length, 80);
  assert.deepEqual(action.payload, { title: "T" });
});

test("orders by usefulness, removes mailbox actions and duplicates", () => {
  const ordered = orderSuggestedActions([
    { type: "star_email", label: "Star" },
    { type: "archive", label: "Archive" },
    { type: "create_event", label: "Meet" },
    { type: "create_event", label: "meet " },
  ]);
  assert.deepEqual(ordered.map((a) => a.type), ["create_event", "star_email"]);
});

test("caps the number of suggestions", () => {
  const many = Array.from({ length: 20 }, (_, i) => ({ type: "create_task" as const, label: `Task ${i}` }));
  assert.equal(orderSuggestedActions(many).length, 10);
});
