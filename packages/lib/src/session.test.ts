import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeBrowserSession } from "./session.ts";

test("omits provider credentials from browser session serialization", () => {
  assert.deepEqual(
    sanitizeBrowserSession({ accessToken: "secret", refreshToken: "refresh", accountKey: "opaque", googleAuthStatus: "ready" }),
    { accountKey: "opaque", googleAuthStatus: "ready" },
  );
});
