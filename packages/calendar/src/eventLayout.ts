import { addDays, startOfDay } from "date-fns";

/** How to read times from an event; lets callers apply their display timezone. */
export interface EventTimeAccessors<E> {
  start: (event: E) => Date;
  end: (event: E) => Date;
  /** True for events with a time of day (as opposed to all-day dates). */
  isTimed: (event: E) => boolean;
}

export interface OverlapSlot {
  col: number;
  totalCols: number;
}

/**
 * Column layout for overlapping timed events on one day. Events are placed in
 * the first free column (earliest start first, longer events first on ties);
 * each event's `totalCols` counts only the columns it actually overlaps.
 */
export function computeOverlapLayout<E extends { id: string }>(
  events: E[],
  time: Pick<EventTimeAccessors<E>, "start" | "end">,
): Map<string, OverlapSlot> {
  const span = (event: E) => ({ start: time.start(event).getTime(), end: time.end(event).getTime() });
  const sorted = [...events].sort((a, b) => {
    const sa = span(a);
    const sb = span(b);
    return sa.start - sb.start || (sb.end - sb.start) - (sa.end - sa.start);
  });

  const columnEnds: number[] = [];
  const layout = new Map<string, OverlapSlot>();
  for (const event of sorted) {
    const { start, end } = span(event);
    let col = columnEnds.findIndex((columnEnd) => columnEnd <= start);
    if (col === -1) {
      col = columnEnds.length;
      columnEnds.push(0);
    }
    columnEnds[col] = end;
    layout.set(event.id, { col, totalCols: 0 });
  }

  const totalCols = columnEnds.length;
  for (const event of sorted) {
    const entry = layout.get(event.id)!;
    const { start, end } = span(event);
    let maxCol = entry.col;
    for (const other of sorted) {
      if (other.id === event.id) continue;
      const o = span(other);
      if (o.start < end && o.end > start) maxCol = Math.max(maxCol, layout.get(other.id)!.col);
    }
    entry.totalCols = Math.min(maxCol + 1, totalCols);
  }
  return layout;
}

export interface SpanningPlacement<E> {
  ev: E;
  startCol: number;
  /** Exclusive. */
  endCol: number;
  row: number;
}

/**
 * Row layout for all-day and multi-day events across a run of day columns
 * (a week). Longer events get the earliest rows; events that do not occupy
 * any of `days` are skipped. Timed events' end day is inclusive.
 */
export function computeSpanningLayout<E extends { id: string }>(
  days: Date[],
  events: E[],
  time: EventTimeAccessors<E>,
): SpanningPlacement<E>[] {
  const result: SpanningPlacement<E>[] = [];
  const seen = new Set<string>();
  const sorted = [...events].sort(
    (a, b) => time.start(a).getTime() - time.start(b).getTime() || time.end(b).getTime() - time.end(a).getTime(),
  );
  const dayStarts = days.map((day) => startOfDay(day).getTime());

  for (const ev of sorted) {
    if (seen.has(ev.id)) continue;
    seen.add(ev.id);
    const evStart = startOfDay(time.start(ev)).getTime();
    const evEnd = (time.isTimed(ev) ? addDays(startOfDay(time.end(ev)), 1) : startOfDay(time.end(ev))).getTime();

    // Events that start before the first day are clipped to column 0;
    // events that start after the last day are not visible at all.
    const startCol = dayStarts.findIndex((day) => day >= evStart);
    if (startCol === -1) continue;
    let endCol = dayStarts.findIndex((day) => day >= evEnd);
    if (endCol === -1) endCol = days.length;
    if (endCol <= startCol) continue;

    let row = 0;
    while (result.some((placed) => placed.row === row && placed.startCol < endCol && placed.endCol > startCol)) {
      row += 1;
    }
    result.push({ ev, startCol, endCol, row });
  }
  return result;
}
