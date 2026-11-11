import assert from "node:assert/strict";
import test from "node:test";
import { extractDocumentText } from "./googleDocText.ts";

const para = (content: string) => ({ paragraph: { elements: [{ startIndex: 1, endIndex: 2, textRun: { content } }] } });

test("extracts paragraph text from a plain document", () => {
  const result = extractDocumentText([{ sectionBreak: {} }, para("# Notes\n"), para("- item\n")]);
  assert.deepEqual(result, { text: "# Notes\n- item\n", unsupportedStructure: false });
});

test("flags tables, images and extra section breaks", () => {
  assert.equal(extractDocumentText([{ sectionBreak: {} }, para("a\n"), { table: {} }]).unsupportedStructure, true);
  assert.equal(extractDocumentText([{ sectionBreak: {} }, para("a\n"), { sectionBreak: {} }]).unsupportedStructure, true);
  assert.equal(
    extractDocumentText([{ sectionBreak: {} }, { paragraph: { elements: [{ inlineObjectElement: { inlineObjectId: "x" } }] } }]).unsupportedStructure,
    true,
  );
});

test("tolerates empty and malformed bodies", () => {
  assert.deepEqual(extractDocumentText(undefined), { text: "", unsupportedStructure: false });
  assert.deepEqual(extractDocumentText([{ paragraph: null }]), { text: "", unsupportedStructure: false });
});
