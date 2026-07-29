import assert from "node:assert/strict";
import test from "node:test";
import type { AssistantSession } from "@crewmate/types";
import {
  initializeAssistantSessions,
  removeAssistantSession,
} from "./assistantSessions.ts";

function session(id: string): AssistantSession {
  return {
    id,
    title: "New conversation",
    createdAt: "2026-07-29T00:00:00.000Z",
    messages: [],
  };
}

test("fresh initialization creates and activates a session", () => {
  const created = session("new");
  const result = initializeAssistantSessions(
    undefined,
    undefined,
    () => created,
  );

  assert.deepEqual(result.assistantSessions, [created]);
  assert.equal(result.activeSessionId, created.id);
});

test("initialization keeps a valid persisted active session", () => {
  const sessions = [session("first"), session("active")];
  const result = initializeAssistantSessions(sessions, "active");

  assert.deepEqual(result.assistantSessions, sessions);
  assert.equal(result.activeSessionId, "active");
});

test("initialization replaces a stale active ID with the first valid session", () => {
  const sessions = [session("first"), session("second")];
  const result = initializeAssistantSessions(sessions, "missing");

  assert.equal(result.activeSessionId, "first");
});

test("deleting the active session activates the first remaining session", () => {
  const result = removeAssistantSession(
    [session("active"), session("next")],
    "active",
    "active",
  );

  assert.deepEqual(
    result.assistantSessions.map(({ id }) => id),
    ["next"],
  );
  assert.equal(result.activeSessionId, "next");
});

test("deleting the last session creates and activates a replacement", () => {
  const replacement = session("replacement");
  const result = removeAssistantSession(
    [session("only")],
    "only",
    "only",
    () => replacement,
  );

  assert.deepEqual(result.assistantSessions, [replacement]);
  assert.equal(result.activeSessionId, "replacement");
});
