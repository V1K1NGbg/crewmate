import assert from "node:assert/strict";
import test from "node:test";
import {
  isResourceId,
  parseCalendarIds,
  parseEventDateTime,
  parseIsoInstant,
  readJsonObject,
  readOptionalJsonObject,
} from "./requestValidation.ts";

function jsonRequest(body: string) {
  return new Request("http://localhost/api/x", { method: "POST", body });
}

test("readJsonObject rejects malformed, null, array and oversized bodies", async () => {
  assert.equal(await readJsonObject(jsonRequest("{not json")), null);
  assert.equal(await readJsonObject(jsonRequest("null")), null);
  assert.equal(await readJsonObject(jsonRequest("[1]")), null);
  assert.equal(await readJsonObject(jsonRequest(JSON.stringify({ a: "x".repeat(50) })), 10), null);
  assert.deepEqual(await readJsonObject(jsonRequest('{"star":false}')), { star: false });
});

test("resource IDs reject path and header characters", () => {
  assert.equal(isResourceId("18c2f0a9b3d4e5f6"), true);
  assert.equal(isResourceId("abc/../def"), false);
  assert.equal(isResourceId("abc\r\n"), false);
  assert.equal(isResourceId(""), false);
  assert.equal(isResourceId(42), false);
});

test("ISO instants must be real date-times", () => {
  assert.equal(parseIsoInstant("2026-03-29T01:00:00Z"), "2026-03-29T01:00:00.000Z");
  assert.equal(parseIsoInstant("2026-03-29T03:00:00+02:00"), "2026-03-29T01:00:00.000Z");
  assert.equal(parseIsoInstant("yesterday"), null);
  assert.equal(parseIsoInstant("2026-13-45T00:00:00Z"), null);
  assert.equal(parseIsoInstant(null), null);
});

test("calendar ID lists are bounded, trimmed and deduplicated", () => {
  assert.deepEqual(parseCalendarIds(null), ["primary"]);
  assert.deepEqual(parseCalendarIds(" a@group.calendar.google.com , a@group.calendar.google.com,primary"), [
    "a@group.calendar.google.com",
    "primary",
  ]);
  assert.equal(parseCalendarIds(Array.from({ length: 60 }, (_, i) => `c${i}`).join(",")), null);
  assert.equal(parseCalendarIds("bad id"), null);
});

test("event date-times are allowlisted", () => {
  assert.deepEqual(parseEventDateTime({ date: "2026-07-29", extra: "x" }), { date: "2026-07-29" });
  assert.deepEqual(
    parseEventDateTime({ dateTime: "2026-07-29T09:00:00-04:00", timeZone: "America/New_York", recurrence: ["x"] }),
    { dateTime: "2026-07-29T09:00:00-04:00", timeZone: "America/New_York" },
  );
  assert.equal(parseEventDateTime({ dateTime: "2026-07-29T09:00:00Z", timeZone: "Mars/Olympus" }), null);
  assert.equal(parseEventDateTime({ date: "29/07/2026" }), null);
  assert.equal(parseEventDateTime({ dateTime: "soon" }), null);
  assert.equal(parseEventDateTime(null), null);
});

test("readOptionalJsonObject treats an empty body as an empty object", async () => {
  assert.deepEqual(await readOptionalJsonObject(new Request("http://localhost/", { method: "PATCH" })), {});
  assert.deepEqual(await readOptionalJsonObject(jsonRequest('{"archive":false}')), { archive: false });
  assert.equal(await readOptionalJsonObject(jsonRequest("null")), null);
});
