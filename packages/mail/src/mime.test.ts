import assert from "node:assert/strict";
import test from "node:test";
import { buildRawEmail, buildReferences } from "./mime.ts";

test("rejects MIME header injection", () => {
  assert.throws(() => buildRawEmail({ from: "me@example.com", to: "you@example.com\r\nBcc: bad@example.com", subject: "Hello", body: "Hi" }));
});

test("encodes non-ASCII subjects", () => {
  const raw = buildRawEmail({ from: "me@example.com", to: "you@example.com", subject: "Hé hallo", body: "Hi" });
  assert.match(Buffer.from(raw, "base64url").toString(), /Subject: =\?UTF-8\?B\?/);
});

test("builds a References chain up to the replied message", () => {
  assert.equal(buildReferences(["<a@x>", "<b@x>", "<c@x>"], "<b@x>"), "<a@x> <b@x>");
  assert.equal(buildReferences([undefined, "bad", "<a@x>"], "<z@x>"), "<a@x> <z@x>");
  const many = Array.from({ length: 30 }, (_, i) => `<${i}@x>`);
  assert.equal(buildReferences(many, "<29@x>").split(" ").length, 20);
});

test("writes References and rejects malformed reference IDs", () => {
  const raw = buildRawEmail({ from: "me@example.com", to: "you@example.com", subject: "Re", body: "Hi", inReplyTo: "<b@x>", references: "<a@x> <b@x>" });
  assert.match(Buffer.from(raw, "base64url").toString(), /References: <a@x> <b@x>/);
  assert.throws(() => buildRawEmail({ from: "me@example.com", to: "you@example.com", subject: "Re", body: "Hi", inReplyTo: "<b@x>", references: "a@x" }));
});
