const TASK_MARKER = /^(\s*(?:[-+*]|\d+[.)])\s+\[)[ xX](\])/;

/** Update the task marker on a one-based Markdown source line. */
export function setMarkdownTaskChecked(
  markdown: string,
  lineNumber: number,
  checked: boolean,
): string {
  if (!Number.isInteger(lineNumber) || lineNumber < 1) return markdown;

  const lines = markdown.split("\n");
  const lineIndex = lineNumber - 1;
  const line = lines[lineIndex];
  if (line === undefined || !TASK_MARKER.test(line)) return markdown;

  lines[lineIndex] = line.replace(
    TASK_MARKER,
    `$1${checked ? "x" : " "}$2`,
  );
  return lines.join("\n");
}
