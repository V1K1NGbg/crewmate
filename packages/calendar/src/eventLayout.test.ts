import assert from "node:assert/strict";
import test from "node:test";
import { computeOverlapLayout, computeSpanningLayout } from "./eventLayout.ts";

interface Ev {
  id: string;
  start: string;
  end: string;
  timed: boolean;
}
const time = {
  start: (e: Ev) => new Date(e.start),
  end: (e: Ev) => new Date(e.end),
  isTimed: (e: Ev) => e.timed,
};
const timed = (id: string, start: string, end: string): Ev => ({ id, start: `2026-07-29T${start}:00`, end: `2026-07-29T${end}:00`, timed: true });

test("non-overlapping events share one full-width column", () => {
  const layout = computeOverlapLayout([timed("a", "09:00", "10:00"), timed("b", "10:00", "11:00")], time);
  assert.deepEqual(layout.get("a"), { col: 0, totalCols: 1 });
  assert.deepEqual(layout.get("b"), { col: 0, totalCols: 1 });
});

test("overlapping events get separate columns; unrelated events stay wide", () => {
  const layout = computeOverlapLayout(
    [timed("long", "09:00", "12:00"), timed("short", "09:30", "10:00"), timed("late", "13:00", "14:00")],
    time,
  );
  assert.deepEqual(layout.get("long"), { col: 0, totalCols: 2 });
  assert.deepEqual(layout.get("short"), { col: 1, totalCols: 2 });
  assert.equal(layout.get("late")?.col, 0);
});

const week = Array.from({ length: 7 }, (_, i) => new Date(2026, 6, 26 + i));
const allDay = (id: string, start: string, endExclusive: string): Ev => ({
  id,
  start: `${start}T00:00:00`,
  end: `${endExclusive}T00:00:00`,
  timed: false,
});

test("multi-day events stack into rows without overlapping", () => {
  const placements = computeSpanningLayout(
    week,
    [allDay("trip", "2026-07-27", "2026-07-30"), allDay("conf", "2026-07-28", "2026-07-29"), allDay("later", "2026-07-30", "2026-07-31")],
    time,
  );
  const byId = new Map(placements.map((p) => [p.ev.id, p]));
  assert.deepEqual([byId.get("trip")?.startCol, byId.get("trip")?.endCol, byId.get("trip")?.row], [1, 4, 0]);
  assert.equal(byId.get("conf")?.row, 1);
  assert.equal(byId.get("later")?.row, 0);
});

test("events clipped to the visible week and outside events skipped", () => {
  const placements = computeSpanningLayout(
    week,
    [allDay("spans-in", "2026-07-20", "2026-07-28"), allDay("outside", "2026-08-10", "2026-08-12")],
    time,
  );
  assert.deepEqual(placements.map((p) => [p.ev.id, p.startCol, p.endCol]), [["spans-in", 0, 2]]);
});

test("timed multi-day events include their final day", () => {
  const [placement] = computeSpanningLayout(
    week,
    [{ id: "overnight", start: "2026-07-27T22:00:00", end: "2026-07-28T02:00:00", timed: true }],
    time,
  );
  assert.deepEqual([placement.startCol, placement.endCol], [1, 3]);
});
