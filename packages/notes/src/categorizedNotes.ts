export function appendCategorizedNote(
  document: string,
  category: string,
  title: string,
  content: string,
  timestamp: string,
): string {
  const sectionHeading = `## ${category.trim()}`;
  const entry = `### ${title.trim()}\n\n> Added on ${timestamp}\n\n${content.trim()}\n`;
  const headingIndex = document.indexOf(sectionHeading);

  if (headingIndex === -1) {
    const prefix = document.trimEnd();
    return `${prefix}${prefix ? "\n\n" : ""}${sectionHeading}\n\n${entry}`;
  }

  const insertionPoint = headingIndex + sectionHeading.length;
  return `${document.slice(0, insertionPoint)}\n\n${entry}${document.slice(insertionPoint).replace(/^\s*/, "\n")}`;
}
