import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { isAuthError } from "@/lib/googleApiError";
import { getTasksClient } from "@/lib/google";

const LIST_NAME = "Crewmate Tasks";

/**
 * POST /api/tasks/init
 * Finds or creates the "Crewmate Tasks" task list.
 * Returns { taskListId, title }.
 */
export async function POST() {
  const session = await auth();
  if (!session?.accessToken)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tasks = getTasksClient(session.accessToken);

  try {
    const listRes = await tasks.tasklists.list({ maxResults: 100 });
    const lists = listRes.data.items ?? [];
    const existing = lists.find((l) => l.title === LIST_NAME);

    if (existing) {
      return NextResponse.json({
        taskListId: existing.id,
        title: existing.title,
      });
    }

    const created = await tasks.tasklists.insert({
      requestBody: { title: LIST_NAME },
    });

    return NextResponse.json({
      taskListId: created.data.id,
      title: created.data.title,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[tasks/init]", err);
    if (isAuthError(err))
      return NextResponse.json({ error: msg || "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
