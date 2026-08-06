/**
 * Parse a JSON array from an AI response.
 *
 * Models occasionally wrap JSON in prose/fences or omit the final array
 * bracket. This extracts the first balanced array and, for a truncated
 * response, keeps only complete top-level entries.
 */
export function parseJsonArray<T>(response: string): T[] {
  for (let start = response.indexOf("["); start >= 0; start = response.indexOf("[", start + 1)) {
    let arrayDepth = 0;
    let objectDepth = 0;
    let inString = false;
    let escaped = false;
    let end = -1;
    let lastCompleteEntryEnd = -1;

    for (let i = start; i < response.length; i += 1) {
      const char = response[i];

      if (inString) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') inString = false;
        continue;
      }

      if (char === '"') {
        inString = true;
        continue;
      }
      if (char === "[") arrayDepth += 1;
      else if (char === "]") {
        arrayDepth -= 1;
        if (arrayDepth === 0) {
          end = i;
          break;
        }
      } else if (char === "{") objectDepth += 1;
      else if (char === "}") {
        objectDepth -= 1;
        if (arrayDepth === 1 && objectDepth === 0) lastCompleteEntryEnd = i;
      }
    }

    const candidate =
      end >= 0
        ? response.slice(start, end + 1)
        : lastCompleteEntryEnd >= 0
          ? `${response.slice(start, lastCompleteEntryEnd + 1)}]`
          : "";

    if (!candidate) continue;

    try {
      const parsed: unknown = JSON.parse(candidate.replace(/,\s*]$/, "]"));
      if (Array.isArray(parsed)) return parsed as T[];
    } catch {
      // A reasoning preamble may itself contain brackets. Keep looking for
      // the first bracket that actually begins valid JSON.
    }
  }

  // Also accept newline-delimited action objects. Some smaller models follow
  // the requested object shape but omit the surrounding array entirely.
  const objects: T[] = [];
  for (let start = response.indexOf("{"); start >= 0; start = response.indexOf("{", start + 1)) {
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < response.length; i += 1) {
      const char = response[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') inString = true;
      else if (char === "{") depth += 1;
      else if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          try {
            const parsed: unknown = JSON.parse(response.slice(start, i + 1));
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
              objects.push(parsed as T);
            }
          } catch {
            // This object was malformed; a later one may still be usable.
          }
          break;
        }
      }
    }
  }
  if (objects.length > 0) return objects;

  throw new Error("The AI returned invalid suggestions. Try again.");
}
