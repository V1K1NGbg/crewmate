import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { getCalendarClient } from "@crewmate/lib/server";
import { googleErrorResponse } from "@/lib/google-error-response";

export async function GET() {
  const session = await auth();
  if (!session?.accessToken)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const calendar = getCalendarClient(session.accessToken);

  try {
    // Use no minAccessRole to get all calendars the user has access to (reader, writer, owner)
    const res = await calendar.calendarList.list({});
    const items = (res.data.items ?? []).map((item) => ({
      id: item.id ?? "",
      summary: item.summary ?? item.id ?? "",
      backgroundColor: item.backgroundColor,
      foregroundColor: item.foregroundColor,
      primary: item.primary ?? false,
      accessRole: item.accessRole,
      writable: item.accessRole === "writer" || item.accessRole === "owner",
    }));
    return NextResponse.json({ calendars: items });
  } catch (err: unknown) {
    return googleErrorResponse(err, "calendar/lists GET");
  }
}
