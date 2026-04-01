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

  const calendar = getCalendarClient(session.accessToken);

  try {
    const res = await calendar.events.list({
      calendarId: "primary",
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 250,
    });
    return NextResponse.json({ events: res.data.items ?? [] });
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

  const body = await req.json();
  const calendar = getCalendarClient(session.accessToken);

  try {
    const res = await calendar.events.insert({
      calendarId: "primary",
      requestBody: body,
    });
    return NextResponse.json(res.data);
  } catch (err: unknown) {
    if (isAuthError(err))
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const msg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
