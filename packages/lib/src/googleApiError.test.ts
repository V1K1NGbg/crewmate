import assert from "node:assert/strict";
import test from "node:test";
import { isAuthError, isRevisionConflict, mapGoogleApiError } from "./googleApiError.ts";

test("does not classify all permission failures as expired authentication", () => {
  assert.equal(isAuthError({ status: 403, message: "quota exceeded" }), false);
  assert.equal(mapGoogleApiError({ status: 403, message: "read only" }).code, "READ_ONLY_RESOURCE");
});

test("maps credentials and rate limits to stable public errors", () => {
  assert.equal(mapGoogleApiError({ status: 401 }).code, "AUTH_EXPIRED");
  assert.equal(mapGoogleApiError({ status: 429 }).retryable, true);
});

test("insufficient permissions is a scope problem, not an expired session", () => {
  const err = { status: 403, message: "Request had insufficientPermissions" };
  assert.equal(isAuthError(err), false);
  assert.equal(mapGoogleApiError(err).code, "INSUFFICIENT_SCOPE");
});

test("detects Docs revision preconditions without matching unrelated errors", () => {
  assert.equal(isRevisionConflict({ status: 400, message: "The required revision ID does not match the latest revision." }), true);
  assert.equal(isRevisionConflict({ code: 409 }), true);
  assert.equal(isRevisionConflict({ status: 400, message: "Invalid requests[0].insertText" }), false);
  assert.equal(isRevisionConflict({ status: 500, message: "revision service unavailable" }), false);
  assert.equal(isRevisionConflict(null), false);
});
