export interface SuggestionThread {
  id: string;
}

export function suggestionWindow(
  threads: SuggestionThread[],
  activeThreadId: string | null,
  targetCount: number,
): SuggestionThread[] {
  if (targetCount <= 0) return [];
  const activeIndex = activeThreadId
    ? threads.findIndex((thread) => thread.id === activeThreadId)
    : -1;
  const start = activeIndex >= 0 ? activeIndex + 1 : 0;
  return threads.slice(start, start + targetCount);
}

export function suggestionWindowCount(
  threads: SuggestionThread[],
  activeThreadId: string | null,
  targetCount: number,
): number {
  return suggestionWindow(threads, activeThreadId, targetCount).length;
}

export function selectSuggestionPrecomputeCandidates(
  threads: SuggestionThread[],
  cachedIds: ReadonlySet<string>,
  inFlightIds: ReadonlySet<string>,
  targetCount: number,
  availableSlots: number,
  activeThreadId: string | null = null,
): string[] {
  if (targetCount <= 0 || availableSlots <= 0) return [];
  return suggestionWindow(threads, activeThreadId, targetCount)
    .filter((thread) => !cachedIds.has(thread.id) && !inFlightIds.has(thread.id))
    .slice(0, availableSlots)
    .map((thread) => thread.id);
}

export function countReadySuggestions(
  threads: SuggestionThread[],
  cachedIds: ReadonlySet<string>,
  targetCount: number,
  activeThreadId: string | null = null,
): number {
  let readyCount = 0;
  for (const thread of suggestionWindow(threads, activeThreadId, targetCount)) {
    if (!cachedIds.has(thread.id)) break;
    readyCount += 1;
  }
  return readyCount;
}
