import assert from "node:assert/strict";
import test from "node:test";
import { proxyAI, validateAIRequest } from "./aiProxy.ts";

const body = validateAIRequest({ model: "local", messages: [{ role: "user", content: "hello" }] });
const signal = () => new AbortController().signal;
test("AI input accepts bounded text and excludes arbitrary tool/backend parameters", () => {
  assert.deepEqual(validateAIRequest({ ...body, tools: [{ name: "shell" }], url: "http://attacker" }), body);
  for (const input of [{ ...body, model: "" }, { ...body, messages: [{ role: "tool", content: "x" }] }, { ...body, max_tokens: 90000 }, { ...body, messages: [{ role: "user", content: "x".repeat(524289) }] }, { ...body, temperature: null }]) assert.throws(() => validateAIRequest(input));
});
test("AI proxy uses the configured backend and keeps credentials server-side", async () => {
  const response = await proxyAI({ endpoint: "http://llama:8080/v1", key: "server-secret", path: "chat/completions", body, signal: signal(), fetchImpl: (async (url, init) => {
    assert.equal(url, "http://llama:8080/v1/chat/completions");
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer server-secret");
    assert.equal(init?.redirect, "error");
    return new Response('{"choices":[]}', { headers: { "Set-Cookie": "secret", Authorization: "secret" } });
  }) as typeof fetch });
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(response.headers.get("Authorization"), null);
  assert.equal(await response.text(), '{"choices":[]}');
});
test("one generation remains busy until stream completion; cancellation frees it", async () => {
  const options = { endpoint: "http://llama/v1", path: "chat/completions" as const, body: { ...body, stream: true }, signal: signal(), fetchImpl: (async () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode("data: hi\n\n")); } }))) as typeof fetch };
  const first = await proxyAI(options);
  assert.equal(first.headers.get("Content-Type"), "text/event-stream");
  assert.equal((await proxyAI(options)).status, 429);
  await first.body?.cancel();
  const next = await proxyAI({ ...options, fetchImpl: (async () => new Response("data: [DONE]\n\n")) as typeof fetch });
  assert.equal(next.status, 200);
  assert.equal(await next.text(), "data: [DONE]\n\n");
});
test("backend failures hide response secrets and do not retain the generation slot", async () => {
  const options = { endpoint: "http://llama/v1", path: "chat/completions" as const, body, signal: signal() };
  const failed = await proxyAI({ ...options, fetchImpl: (async () => new Response("secret-token", { status: 500 })) as typeof fetch });
  assert.equal(failed.status, 502);
  assert.doesNotMatch(await failed.text(), /secret-token/);
  const recovered = await proxyAI({ ...options, fetchImpl: (async () => new Response("{}")) as typeof fetch });
  assert.equal(recovered.status, 200);
  await recovered.text();
  assert.equal((await proxyAI({ ...options, endpoint: undefined })).status, 503);
});
