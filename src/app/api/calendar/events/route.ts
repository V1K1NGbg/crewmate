import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { isAuthError } from "@/lib/googleApiError";
import { getCalendarClient } from "@/lib/google";

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
        const res = await calendar.events.list({
          calendarId,
          timeMin,
          timeMax,
          singleEvents: true,
          orderBy: "startTime",
          maxResults: 250,
        });
        return (res.data.items ?? []).map((ev) => ({
          ...ev,
          calendarId,
        }));
      }),
    );

    const events = allEvents
      .flat()
      .sort((a, b) => {
        const aStart = (a.start?.dateTime ?? a.start?.date) || "";
        const bStart = (b.start?.dateTime ?? b.start?.date) || "";
        return aStart.localeCompare(bStart);
      });

    return NextResponse.json({ events });
  } catch (err: unknown) {
    if (isAuthError(err))
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const msg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.accessToken)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { calendarId = "primary", ...body } = await req.json();
  const calendar = getCalendarClient(session.accessToken);

  try {
    const res = await calendar.events.insert({
      calendarId,
      requestBody: body,
    });
    return NextResponse.json({ ...res.data, calendarId });
  } catch (err: unknown) {
    if (isAuthError(err))
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const msg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
