import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { isAuthError, getCalendarClient } from "@crewmate/lib/server";
import { normalizeGoogleEventPatchBody } from "@crewmate/calendar/shared";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.accessToken)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const calendar = getCalendarClient(session.accessToken);

  try {
    await calendar.events.delete({ calendarId: "primary", eventId: id });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    if (isAuthError(err))
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const msg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
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
  const body = await req.json();
  const { calendarId = "primary", ...patch } = body;
  const calendar = getCalendarClient(session.accessToken);

  try {
    const res = await calendar.events.patch({
      calendarId,
      eventId: id,
      requestBody: normalizeGoogleEventPatchBody(patch),
    });
    return NextResponse.json({ ...res.data, calendarId });
  } catch (err: unknown) {
    if (isAuthError(err))
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const msg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
