import assert from "node:assert/strict";
import test from "node:test";
import {
  LOCAL_TRANSLATION_MODEL,
  LOCAL_TRANSLATION_MODEL_REVISION,
  localTranslationChunks,
} from "./localTranslationProtocol.ts";

test("pins the disabled local translation model", () => {
  assert.equal(LOCAL_TRANSLATION_MODEL, "Xenova/m2m100_418M");
  assert.equal(LOCAL_TRANSLATION_MODEL_REVISION, "9c374f0");
});

test("bounds text chunks for the future local translation worker", () => {
  const text = `${"a".repeat(800)}\n\n${"b".repeat(500)}`;
  const chunks = localTranslationChunks(text);
  assert.ok(chunks.length >= 3);
  assert.ok(chunks.every((chunk) => chunk.length <= 600));
  assert.equal(chunks.join(""), text);
});
