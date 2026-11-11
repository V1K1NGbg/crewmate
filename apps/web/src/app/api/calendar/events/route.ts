import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { getCalendarClient } from "@crewmate/lib/server";
import { googleErrorResponse } from "@/lib/google-error-response";
import type { calendar_v3 } from "googleapis";
import { parseCalendarIds, parseEventDateTime, parseIsoInstant, readJsonObject } from "@/lib/requestValidation";

function eventBody(value: unknown): { calendarId: string; requestBody: calendar_v3.Schema$Event } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  const calendarId = typeof body.calendarId === "string" ? body.calendarId.trim() : "primary";
  if (!calendarId || typeof body.summary !== "string" || !body.summary.trim() || body.summary.length > 1024) return null;
  const start = parseEventDateTime(body.start);
  const end = parseEventDateTime(body.end);
  if (!start || !end || ("date" in start) !== ("date" in end)) return null;
  return {
    calendarId,
    requestBody: {
      summary: body.summary.trim(),
      description: typeof body.description === "string" ? body.description.slice(0, 20_000) : undefined,
      location: typeof body.location === "string" ? body.location.slice(0, 1024) : undefined,
      start,
      end,
    },
  };
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.accessToken)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const timeMinParam = searchParams.get("timeMin");
  const timeMaxParam = searchParams.get("timeMax");
  const timeMin = timeMinParam === null
    ? new Date(Date.now() - 7 * 86400000).toISOString()
    : parseIsoInstant(timeMinParam);
  const timeMax = timeMaxParam === null
    ? new Date(Date.now() + 60 * 86400000).toISOString()
    : parseIsoInstant(timeMaxParam);
  if (!timeMin || !timeMax || timeMin >= timeMax) {
    return NextResponse.json({ error: "timeMin and timeMax must be ISO date-times with timeMin before timeMax" }, { status: 400 });
  }

  // calendarIds is a comma-separated list; defaults to "primary"
  const calendarIds = parseCalendarIds(searchParams.get("calendarIds"));
  if (!calendarIds) {
    return NextResponse.json({ error: "Invalid calendarIds" }, { status: 400 });
  }

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

  const parsed = eventBody(await readJsonObject(req, 100_000));
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
