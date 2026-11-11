import assert from "node:assert/strict";
import test from "node:test";
import type { GmailMessage } from "./useGmail";
import { buildThreadEmailContext, extractEmail, extractName, getInitials, stripHtml } from "./mailFormat.ts";

const message = (body: string, extra: Partial<GmailMessage> = {}): GmailMessage => ({
  id: "m",
  threadId: "t",
  subject: "Hi",
  from: "Ada <ada@example.com>",
  to: "me@example.com",
  date: "Mon, 1 Jan 2026",
  messageId: "<m@x>",
  snippet: "",
  body,
  labelIds: [],
  ...extra,
});

test("parses display names and addresses from From headers", () => {
  assert.equal(extractName('"Ada Lovelace" <ada@example.com>'), "Ada Lovelace");
  assert.equal(extractName("ada@example.com"), "ada@example.com");
  assert.equal(extractEmail("Ada <ada@example.com>"), "ada@example.com");
  assert.equal(extractEmail("ada@example.com"), "ada@example.com");
});

test("initials use first and last name", () => {
  assert.equal(getInitials("Ada King Lovelace"), "AL");
  assert.equal(getInitials("ada"), "AD");
});

test("strips HTML to bounded plain text", () => {
  assert.equal(stripHtml("<p>Hello <b>world</b></p>\n\n<p>!</p>"), "Hello world !");
  assert.equal(stripHtml("<p>abcdef</p>", 3), "abc");
});

test("thread context is plain text and labels each message", () => {
  assert.equal(buildThreadEmailContext([]), "");
  assert.equal(buildThreadEmailContext([message("<p>Only</p>")]), "Only");
  const context = buildThreadEmailContext([message("first"), message("second", { from: "Bob <b@x.com>" })]);
  assert.match(context, /--- Message 1 of 2 ---\nFrom: Ada <ada@example.com>/);
  assert.match(context, /--- Message 2 of 2 ---[\s\S]*second$/);
});
