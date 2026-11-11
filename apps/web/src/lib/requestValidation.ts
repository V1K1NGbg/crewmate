/**
 * Pure request-validation helpers shared by the API route handlers.
 * Kept free of Next.js and path-alias imports so `node --test` can run them.
 */

export type JsonObject = Record<string, unknown>;

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Reads a JSON object body. Returns `null` for malformed JSON, non-object
 * payloads, or bodies larger than `maxBytes`, so callers can answer 400.
 */
export async function readJsonObject(req: Request, maxBytes = 2_500_000): Promise<JsonObject | null> {
  let text: string;
  try {
    text = await req.text();
  } catch {
    return null;
  }
  if (text.length > maxBytes) return null;
  try {
    const value: unknown = JSON.parse(text);
    return isJsonObject(value) ? value : null;
  } catch {
    return null;
  }
}

/** Like {@link readJsonObject}, but an empty body is treated as `{}`. */
export async function readOptionalJsonObject(req: Request, maxBytes = 2_500_000): Promise<JsonObject | null> {
  let text: string;
  try {
    text = await req.text();
  } catch {
    return null;
  }
  if (!text.trim()) return {};
  return readJsonObject(new Request("http://local/", { method: "POST", body: text }), maxBytes);
}

/** Gmail thread/message IDs and Google Tasks IDs are short URL-safe tokens. */
export function isResourceId(value: unknown, maxLength = 256): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength && /^[A-Za-z0-9_.@=-]+$/.test(value);
}

/** Returns a normalized ISO instant, or null when the value is not a valid date-time. */
export function parseIsoInstant(value: string | null): string | null {
  if (!value || value.length > 64) return null;
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value)) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

export const MAX_CALENDAR_IDS = 50;

/** Parses the comma-separated `calendarIds` query parameter. */
export function parseCalendarIds(param: string | null): string[] | null {
  if (param === null || param.trim() === "") return ["primary"];
  const ids = [...new Set(param.split(",").map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return ["primary"];
  if (ids.length > MAX_CALENDAR_IDS) return null;
  return ids.every((id) => id.length <= 256 && !/[\s<>]/.test(id)) ? ids : null;
}

export type EventDateTimeInput =
  | { date: string }
  | { dateTime: string; timeZone?: string };

/**
 * Allowlists a Google Calendar start/end object: either an all-day `date`
 * or a `dateTime` with an optional IANA `timeZone`. Extra keys are dropped.
 */
export function parseEventDateTime(value: unknown): EventDateTimeInput | null {
  if (!isJsonObject(value)) return null;
  if (typeof value.date === "string") {
    return /^\d{4}-\d{2}-\d{2}$/.test(value.date) && !Number.isNaN(Date.parse(value.date))
      ? { date: value.date }
      : null;
  }
  if (typeof value.dateTime !== "string" || value.dateTime.length > 64 || Number.isNaN(Date.parse(value.dateTime))) {
    return null;
  }
  if (value.timeZone === undefined) return { dateTime: value.dateTime };
  if (typeof value.timeZone !== "string" || !isValidTimeZone(value.timeZone)) return null;
  return { dateTime: value.dateTime, timeZone: value.timeZone };
}

function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone || timeZone.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

export const MAX_GMAIL_QUERY_LENGTH = 1024;
