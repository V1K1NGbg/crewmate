import assert from "node:assert/strict";
import test from "node:test";
import { ApiError, apiErrorFromBody, apiErrorMessage, apiFetch, isAbortError } from "./apiFetch.ts";

function withFetch(impl: typeof fetch, run: () => Promise<void>) {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  return run().finally(() => {
    globalThis.fetch = original;
  });
}

test("preserves safe error codes from API responses", () => {
  const err = apiErrorFromBody(401, { error: "Google authorization expired", code: "AUTH_EXPIRED" }, "x");
  assert.equal(err.status, 401);
  assert.equal(err.code, "AUTH_EXPIRED");
  assert.equal(err.isAuthExpired, true);
  assert.equal(err.message, "Google authorization expired");
});

test("falls back for malformed error bodies", () => {
  for (const body of [null, "oops", [], { error: 42 }, { error: "  " }]) {
    const err = apiErrorFromBody(500, body, "Fallback");
    assert.equal(err.message, "Fallback");
    assert.equal(err.code, undefined);
    assert.equal(err.isAuthExpired, false);
  }
});

test("a 403 permission problem is not an expired session", () => {
  assert.equal(apiErrorFromBody(403, { code: "INSUFFICIENT_SCOPE" }, "x").isAuthExpired, false);
});

test("apiFetch returns parsed JSON for OK responses", async () => {
  await withFetch(async () => new Response(JSON.stringify({ ok: 1 }), { status: 200 }), async () => {
    assert.deepEqual(await apiFetch("/api/x"), { ok: 1 });
  });
});

test("apiFetch throws ApiError for non-OK and non-JSON responses", async () => {
  await withFetch(async () => new Response("<html>bad gateway</html>", { status: 502 }), async () => {
    await assert.rejects(apiFetch("/api/x", { fallbackError: "Load failed" }), (err: unknown) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.status, 502);
      assert.equal(err.message, "Load failed");
      return true;
    });
  });
});

test("classifies abort errors and exposes safe messages", () => {
  assert.equal(isAbortError(new DOMException("aborted", "AbortError")), true);
  assert.equal(isAbortError(new Error("boom")), false);
  assert.equal(apiErrorMessage(new ApiError(400, "Bad date"), "x"), "Bad date");
  assert.equal(apiErrorMessage(new TypeError("internal detail"), "Safe"), "Safe");
});
