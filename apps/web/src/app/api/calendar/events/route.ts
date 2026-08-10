import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { getCalendarClient } from "@crewmate/lib/server";
import { googleErrorResponse } from "@/lib/google-error-response";
import type { calendar_v3 } from "googleapis";

function eventBody(value: unknown): { calendarId: string; requestBody: calendar_v3.Schema$Event } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  const calendarId = typeof body.calendarId === "string" ? body.calendarId.trim() : "primary";
  if (!calendarId || typeof body.summary !== "string" || !body.summary.trim() || body.summary.length > 1024) return null;
  const validTime = (time: unknown) => {
    if (!time || typeof time !== "object" || Array.isArray(time)) return false;
    const candidate = time as Record<string, unknown>;
    if (typeof candidate.date === "string") return /^\d{4}-\d{2}-\d{2}$/.test(candidate.date);
    return typeof candidate.dateTime === "string" && !Number.isNaN(Date.parse(candidate.dateTime));
  };
  if (!validTime(body.start) || !validTime(body.end)) return null;
  return {
    calendarId,
    requestBody: {
      summary: body.summary.trim(),
      description: typeof body.description === "string" ? body.description.slice(0, 20_000) : undefined,
      location: typeof body.location === "string" ? body.location.slice(0, 1024) : undefined,
      start: body.start as calendar_v3.Schema$EventDateTime,
      end: body.end as calendar_v3.Schema$EventDateTime,
    },
  };
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.accessToken)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const timeMin =
    searchParams.get("timeMin") ??
    new Date(Date.now() - 7 * 86400000).toISOString();
  const timeMax =
    searchParams.get("timeMax") ??
    new Date(Date.now() + 60 * 86400000).toISOString();

  // calendarIds is a comma-separated list; defaults to "primary"
  const calendarIdsParam = searchParams.get("calendarIds");
  const calendarIds = calendarIdsParam
    ? calendarIdsParam.split(",").filter(Boolean)
    : ["primary"];

  const calendar = getCalendarClient(session.accessToken);

  try {
    const allEvents = await Promise.all(
      calendarIds.map(async (calendarId) => {
        const items: calendar_v3.Schema$Event[] = [];
        let pageToken: string | undefined;
        let truncated = false;
        do {
          const responseData: calendar_v3.Schema$Events = (await calendar.events.list({
            calendarId,
            timeMin,
            timeMax,
            singleEvents: true,
            orderBy: "startTime",
            maxResults: Math.min(250, 1000 - items.length),
            pageToken,
          })).data;
          items.push(...(responseData.items ?? []));
          pageToken = responseData.nextPageToken ?? undefined;
          if (items.length >= 1000 && pageToken) {
            truncated = true;
            break;
          }
        } while (pageToken);
        return { events: items.map((ev) => ({
          ...ev,
          calendarId,
        })), truncated };
      }),
    );

    const events = allEvents
      .flatMap((result) => result.events)
      .sort((a, b) => {
        const aStart = (a.start?.dateTime ?? a.start?.date) || "";
        const bStart = (b.start?.dateTime ?? b.start?.date) || "";
        return aStart.localeCompare(bStart);
      });

    return NextResponse.json({
      events,
      truncated: allEvents.some((result) => result.truncated),
    });
  } catch (err: unknown) {
    return googleErrorResponse(err, "calendar/events GET");
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.accessToken)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = eventBody(await req.json().catch(() => null));
  if (!parsed) return NextResponse.json({ error: "Invalid calendar event" }, { status: 400 });
  const { calendarId, requestBody } = parsed;
  const calendar = getCalendarClient(session.accessToken);

  try {
    const res = await calendar.events.insert({
      calendarId,
      requestBody,
    });
    return NextResponse.json({ ...res.data, calendarId });
  } catch (err: unknown) {
    return googleErrorResponse(err, "calendar/events POST");
  }
}
