/** Minimal structural view of a Google Docs body element (see docs_v1.Schema$StructuralElement). */
export interface DocStructuralElement {
  sectionBreak?: unknown;
  paragraph?: { elements?: Array<{ textRun?: { content?: string | null } | null }> | null } | null;
  table?: unknown;
  tableOfContents?: unknown;
}

export interface ExtractedDocText {
  text: string;
  /**
   * True when the document contains content Crewmate's plain-text editor does
   * not represent (tables, images, extra section breaks, ...). Saving from
   * Crewmate replaces the whole body, so that content would be flattened.
   */
  unsupportedStructure: boolean;
}

/** Extracts plain text from a Google Docs body and flags content it cannot round-trip. */
export function extractDocumentText(content: DocStructuralElement[] | null | undefined): ExtractedDocText {
  let text = "";
  let unsupportedStructure = false;
  for (const [index, element] of (content ?? []).entries()) {
    if (element.sectionBreak) {
      // Every document starts with one section break; any other is real structure.
      if (index > 0) unsupportedStructure = true;
      continue;
    }
    if (element.table || element.tableOfContents) {
      unsupportedStructure = true;
      continue;
    }
    for (const part of element.paragraph?.elements ?? []) {
      if (typeof part.textRun?.content === "string") {
        text += part.textRun.content;
      } else if (Object.keys(part).some((key) => key !== "startIndex" && key !== "endIndex" && key !== "textRun")) {
        // inlineObjectElement, pageBreak, horizontalRule, footnoteReference, ...
        unsupportedStructure = true;
      }
    }
  }
  return { text, unsupportedStructure };
}
