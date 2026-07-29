import assert from "node:assert/strict";
import test from "node:test";
import {
  aiChat,
  detectAIServer,
  fetchAIModels,
  normalizeAIServerUrl,
} from "./ai.ts";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

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

