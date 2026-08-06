import assert from "node:assert/strict";
import test from "node:test";
import type { AssistantSession } from "@crewmate/types";
import {
  buildAssistantSessionMemory,
  appendAssistantMessage,
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

test("drops malformed messages and repairs message session ownership", () => {
  const persisted = session("owner");
  persisted.messages = [
    { id: "ok", role: "user", content: "hello", timestamp: "now", sessionId: "wrong" },
    { id: "bad", role: "user", content: "bad", timestamp: 42 as unknown as string, sessionId: "owner" },
  ];
  const result = initializeAssistantSessions([persisted], "owner");
  assert.deepEqual(result.assistantSessions[0].messages, [
    { id: "ok", role: "user", content: "hello", timestamp: "now", sessionId: "owner" },
  ]);
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

test("builds memory only from the requested session and keeps recent messages", () => {
  const selected = session("selected");
  selected.messages = [
    { id: "1", role: "user", content: "old detail", timestamp: "", sessionId: selected.id },
    { id: "2", role: "assistant", content: "recent answer", timestamp: "", sessionId: selected.id },
  ];

  assert.equal(buildAssistantSessionMemory(selected), "User: old detail\n\nAssistant: recent answer");
  assert.equal(buildAssistantSessionMemory(undefined), "");
  assert.equal(buildAssistantSessionMemory(selected, 25), "Assistant: recent answer");
});

test("routes a delayed reply to its originating session", () => {
  const reply = {
    id: "reply",
    role: "assistant" as const,
    content: "done",
    timestamp: "now",
    sessionId: "first",
  };
  const result = appendAssistantMessage([session("first"), session("active")], reply);
  assert.deepEqual(result[0].messages, [reply]);
  assert.deepEqual(result[1].messages, []);
});
