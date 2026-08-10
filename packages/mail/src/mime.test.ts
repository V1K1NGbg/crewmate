import assert from "node:assert/strict";
import test from "node:test";
import { buildRawEmail } from "./mime.ts";

test("rejects MIME header injection", () => {
  assert.throws(() => buildRawEmail({ from: "me@example.com", to: "you@example.com\r\nBcc: bad@example.com", subject: "Hello", body: "Hi" }));
});

test("encodes non-ASCII subjects", () => {
  const raw = buildRawEmail({ from: "me@example.com", to: "you@example.com", subject: "Hé hallo", body: "Hi" });
  assert.match(Buffer.from(raw, "base64url").toString(), /Subject: =\?UTF-8\?B\?/);
});
