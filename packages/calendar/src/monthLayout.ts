const BASE_WEEK_HEIGHT = 120;
const WEEK_VERTICAL_INSET = 40;
const EVENT_ROW_HEIGHT = 20;

export function calculateMonthWeekMinHeight(
  spanningEventRows: number,
  timedEventCounts: readonly number[],
): number {
  const maxTimedEvents = Math.max(0, ...timedEventCounts);
  const contentHeight =
    WEEK_VERTICAL_INSET +
    spanningEventRows * EVENT_ROW_HEIGHT +
    maxTimedEvents * EVENT_ROW_HEIGHT;

  return Math.max(BASE_WEEK_HEIGHT, contentHeight);
}

export function isMonthSegmentOutside(
  weekDays: readonly Date[],
  startColumn: number,
  endColumn: number,
  activeMonth: Date,
): boolean {
  const segmentDays = weekDays.slice(startColumn, endColumn);
  return (
    segmentDays.length > 0 &&
    segmentDays.every(
      (day) =>
        day.getFullYear() !== activeMonth.getFullYear() ||
        day.getMonth() !== activeMonth.getMonth(),
    )
  );
}
