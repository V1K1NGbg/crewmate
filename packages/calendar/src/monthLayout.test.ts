import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateMonthWeekMinHeight,
  isMonthSegmentOutside,
} from "./monthLayout.ts";

test("keeps quiet month weeks at the baseline height", () => {
  assert.equal(calculateMonthWeekMinHeight(0, []), 120);
  assert.equal(calculateMonthWeekMinHeight(1, [0, 1, 2, 0, 0, 0, 0]), 120);
});

test("grows a month week to fit the busiest day", () => {
  assert.equal(
    calculateMonthWeekMinHeight(0, [1, 2, 6, 3, 0, 1, 2]),
    160,
  );
  assert.equal(
    calculateMonthWeekMinHeight(3, [1, 5, 2, 0, 1, 4, 2]),
    200,
  );
});

test("dims only event segments wholly outside the active month", () => {
  const week = [
    new Date(2026, 7, 30),
    new Date(2026, 7, 31),
    new Date(2026, 8, 1),
    new Date(2026, 8, 2),
    new Date(2026, 8, 3),
    new Date(2026, 8, 4),
    new Date(2026, 8, 5),
  ];
  const august = new Date(2026, 7, 1);

  assert.equal(isMonthSegmentOutside(week, 2, 5, august), true);
  assert.equal(isMonthSegmentOutside(week, 0, 2, august), false);
  assert.equal(isMonthSegmentOutside(week, 1, 4, august), false);
});
