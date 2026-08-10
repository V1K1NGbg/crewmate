import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGoogleEventTimes,
  instantToWallClock,
  isValidTimeZone,
  wallClockToInstant,
} from "./googleCalendarEventTime.ts";

test("interprets a wall-clock value in the configured timezone", () => {
  assert.equal(
    wallClockToInstant("2026-07-29T09:00", "America/New_York"),
    "2026-07-29T13:00:00.000Z",
  );
  assert.equal(
    instantToWallClock("2026-07-29T13:00:00.000Z", "America/New_York"),
    "2026-07-29T09:00",
  );
});

test("uses the correct offset on both sides of daylight-saving changes", () => {
  assert.equal(
    wallClockToInstant("2026-03-07T09:00", "America/New_York"),
    "2026-03-07T14:00:00.000Z",
  );
  assert.equal(
    wallClockToInstant("2026-03-09T09:00", "America/New_York"),
    "2026-03-09T13:00:00.000Z",
  );
});

test("keeps all-day events as date-only values", () => {
  assert.deepEqual(
    buildGoogleEventTimes({
      allDay: true,
      startDate: "2026-07-29",
      endDate: "2026-07-29",
      startDateTime: "",
      endDateTime: "",
      timeZone: "Pacific/Auckland",
    }),
    {
      start: { date: "2026-07-29", dateTime: null, timeZone: null },
      end: { date: "2026-07-30", dateTime: null, timeZone: null },
    },
  );
});

test("rejects invalid timezone names", () => {
  assert.equal(isValidTimeZone("Europe/Amsterdam"), true);
  assert.equal(isValidTimeZone("Mars/Olympus"), false);
});
