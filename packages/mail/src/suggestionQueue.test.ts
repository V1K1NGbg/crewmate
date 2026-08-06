import assert from "node:assert/strict";
import test from "node:test";
import {
  countReadySuggestions,
  selectSuggestionPrecomputeCandidates,
  suggestionWindow,
  suggestionWindowCount,
} from "./suggestionQueue.ts";

const threads = ["a", "b", "c", "d"].map((id) => ({ id }));

test("fills only missing suggestions within the first N emails", () => {
  assert.deepEqual(
    selectSuggestionPrecomputeCandidates(
      threads,
      new Set(["a", "d"]),
      new Set(["b"]),
      3,
      2,
    ),
    ["c"],
  );
  assert.equal(countReadySuggestions(threads, new Set(["a", "d"]), 3), 1);
  assert.equal(countReadySuggestions(threads, new Set(["b", "c"]), 3), 0);
});

test("moves the precompute window forward when review skips to another email", () => {
  assert.deepEqual(
    suggestionWindow(threads, "c", 2).map(({ id }) => id),
    ["d"],
  );
  assert.deepEqual(
    selectSuggestionPrecomputeCandidates(
      threads,
      new Set(["b", "c"]),
      new Set(),
      2,
      2,
      "c",
    ),
    ["d"],
  );
});

test("does not wrap the precompute window back to earlier emails", () => {
  assert.deepEqual(
    suggestionWindow(threads, "d", 3).map(({ id }) => id),
    [],
  );
  assert.equal(suggestionWindowCount(threads, "d", 10), 0);
  assert.deepEqual(
    suggestionWindow(threads, "c", 3).map(({ id }) => id),
    ["d"],
  );
});

test("respects analysis concurrency slots", () => {
  assert.deepEqual(
    selectSuggestionPrecomputeCandidates(threads, new Set(), new Set(), 4, 2),
    ["a", "b"],
  );
});
