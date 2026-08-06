import assert from "node:assert/strict";
import test from "node:test";
import {
  aiChat,
  detectAIServer,
  fetchAIModels,
  normalizeAIServerUrl,
} from "./ai.ts";
import { parseJsonArray } from "./json.ts";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("parses a fenced AI JSON array with nested arrays", () => {
  assert.deepEqual(
    parseJsonArray<{ label: string; payload: { attendees: string[] } }>(
      'Here you go:\n```json\n[{"label":"Meet","payload":{"attendees":["a","b"]}}]\n```',
    ),
    [{ label: "Meet", payload: { attendees: ["a", "b"] } }],
  );
});

test("skips bracketed reasoning text before the suggestions array", () => {
  assert.deepEqual(
    parseJsonArray<{ type: string }>(
      '[analysis: checking email]\n[{"type":"archive"}]',
    ),
    [{ type: "archive" }],
  );
});

test("recovers complete suggestions when the AI omits the closing bracket", () => {
  assert.deepEqual(
    parseJsonArray<{ type: string }>(
      '[{"type":"archive"},{"type":"create_task"}',
    ),
    [{ type: "archive" }, { type: "create_task" }],
  );
});

test("drops an incomplete final suggestion from a truncated AI response", () => {
  assert.deepEqual(
    parseJsonArray<{ type: string }>(
      '[{"type":"archive"},{"type":"create_task","label":"Do',
    ),
    [{ type: "archive" }],
  );
});

test("parses newline-delimited suggestions without an outer array", () => {
  assert.deepEqual(
    parseJsonArray<{ type?: string; payload?: object }>(
      '{"type":"archive"}\n{"type":"create_task","payload":{"title":"Review"}}',
    ).filter((item) => item.type),
    [
      { type: "archive" },
      { type: "create_task", payload: { title: "Review" } },
    ],
  );
});

test("normalizes a server origin to an OpenAI-compatible v1 base URL", () => {
  assert.equal(
    normalizeAIServerUrl(" http://127.0.0.1:8080/ "),
    "http://127.0.0.1:8080/v1",
  );
  assert.equal(
    normalizeAIServerUrl("http://localhost:1234/api/v1/"),
    "http://localhost:1234/api/v1",
  );
});

test("discovers models through the standard models endpoint", async () => {
  const fetchMock = (async (input: string | URL | Request) => {
    assert.equal(String(input), "http://127.0.0.1:8080/v1/models");
    return jsonResponse({
      data: [{ id: "local-model" }, { id: "second", name: "Second model" }],
    });
  }) as typeof fetch;

  assert.deepEqual(await fetchAIModels("http://127.0.0.1:8080", fetchMock), [
    { id: "local-model", label: "local-model" },
    { id: "second", label: "Second model" },
  ]);
  assert.equal(
    await detectAIServer("http://127.0.0.1:8080", fetchMock),
    true,
  );
});

test("sends chat completions using the selected model", async () => {
  const fetchMock = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    assert.equal(
      String(input),
      "http://127.0.0.1:8080/v1/chat/completions",
    );
    assert.equal(init?.method, "POST");
    assert.deepEqual(JSON.parse(String(init?.body)), {
      model: "local-model",
      messages: [{ role: "user", content: "Hello" }],
      stream: false,
    });
    return jsonResponse({
      choices: [{ message: { content: " Local response " } }],
    });
  }) as typeof fetch;

  assert.equal(
    await aiChat(
      "http://127.0.0.1:8080/v1",
      "Hello",
      "local-model",
      fetchMock,
    ),
    "Local response",
  );
});

test("recovers chat content from a response missing its closing envelope", async () => {
  const fetchMock = (async () =>
    new Response(
      '{"choices":[{"message":{"content":"[{\\"type\\":\\"archive\\"}]"}}',
      { status: 200, headers: { "Content-Type": "application/json" } },
    )) as typeof fetch;

  assert.equal(
    await aiChat("http://127.0.0.1:8080/v1", "Suggest", "local-model", fetchMock),
    '[{"type":"archive"}]',
  );
});

test("uses the first discovered model when no model is configured", async () => {
  const requestedUrls: string[] = [];
  const fetchMock = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    requestedUrls.push(String(input));
    if (!init?.method) {
      return jsonResponse({ data: [{ id: "discovered-model" }] });
    }
    assert.equal(
      (JSON.parse(String(init.body)) as { model: string }).model,
      "discovered-model",
    );
    return jsonResponse({
      choices: [{ message: { content: "Response" } }],
    });
  }) as typeof fetch;

  assert.equal(
    await aiChat("http://127.0.0.1:8080/v1", "Hello", undefined, fetchMock),
    "Response",
  );
  assert.deepEqual(requestedUrls, [
    "http://127.0.0.1:8080/v1/models",
    "http://127.0.0.1:8080/v1/chat/completions",
  ]);
});

test("cancels an in-flight chat request with the caller signal", async () => {
  const controller = new AbortController();
  const fetchMock = (async (
    _input: string | URL | Request,
    init?: RequestInit,
  ) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener(
        "abort",
        () => reject(new DOMException("Aborted", "AbortError")),
        { once: true },
      );
    })) as typeof fetch;

  const request = aiChat(
    "http://127.0.0.1:8080/v1",
    "Hello",
    "local-model",
    fetchMock,
    controller.signal,
  );
  controller.abort();

  await assert.rejects(request, { name: "AbortError" });
});
