import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { getCalendarClient } from "@crewmate/lib/server";
import { googleErrorResponse } from "@/lib/google-error-response";
import { normalizeGoogleEventPatchBody } from "@crewmate/calendar/shared";

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.accessToken)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const calendarId = new URL(req.url).searchParams.get("calendarId")?.trim();
  if (!id || !calendarId) {
    return NextResponse.json(
      { error: "A calendarId is required" },
      { status: 400 },
    );
  }
  const calendar = getCalendarClient(session.accessToken);

  try {
    await calendar.events.delete({ calendarId, eventId: id });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return googleErrorResponse(err, "calendar/event DELETE");
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.accessToken)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.calendarId !== "string" || !body.calendarId.trim()) {
    return NextResponse.json({ error: "calendarId is required" }, { status: 400 });
  }
  const calendarId = body.calendarId.trim();
  const patch: Record<string, unknown> = {};
  if (typeof body.summary === "string" && body.summary.trim()) patch.summary = body.summary.slice(0, 1024);
  if (typeof body.description === "string") patch.description = body.description.slice(0, 20_000);
  if (typeof body.location === "string") patch.location = body.location.slice(0, 1024);
  if (body.start && typeof body.start === "object") patch.start = body.start;
  if (body.end && typeof body.end === "object") patch.end = body.end;
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "No valid event fields supplied" }, { status: 400 });
  const calendar = getCalendarClient(session.accessToken);

  try {
    const res = await calendar.events.patch({
      calendarId,
      eventId: id,
      requestBody: normalizeGoogleEventPatchBody(patch),
    });
    return NextResponse.json({ ...res.data, calendarId });
  } catch (err: unknown) {
    return googleErrorResponse(err, "calendar/event PATCH");
  }
}
