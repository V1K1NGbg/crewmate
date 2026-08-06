import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_GMAIL_SETTINGS } from "./settings.ts";
import {
  quickReviewCommandForKey,
  waitsForReviewDestination,
} from "./quickReview.ts";

test("maps configurable single-key quick review commands", () => {
  const settings = { ...DEFAULT_GMAIL_SETTINGS, reviewSkipKey: "q" };
  assert.equal(quickReviewCommandForKey("Q", settings), "skip");
  assert.equal(quickReviewCommandForKey("x", settings), null);
});

test("waits for cross-page and reply actions before advancing mail", () => {
  assert.equal(waitsForReviewDestination("create_event"), true);
  assert.equal(waitsForReviewDestination("reply_draft"), true);
  assert.equal(waitsForReviewDestination("star_email"), false);
});
