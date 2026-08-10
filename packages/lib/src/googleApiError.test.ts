import assert from "node:assert/strict";
import test from "node:test";
import { isAuthError, mapGoogleApiError } from "./googleApiError.ts";

test("does not classify all permission failures as expired authentication", () => {
  assert.equal(isAuthError({ status: 403, message: "quota exceeded" }), false);
  assert.equal(mapGoogleApiError({ status: 403, message: "read only" }).code, "READ_ONLY_RESOURCE");
});

test("maps credentials and rate limits to stable public errors", () => {
  assert.equal(mapGoogleApiError({ status: 401 }).code, "AUTH_EXPIRED");
  assert.equal(mapGoogleApiError({ status: 429 }).retryable, true);
});
