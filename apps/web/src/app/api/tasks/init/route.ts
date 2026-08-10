import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { getTasksClient } from "@crewmate/lib/server";
import { googleErrorResponse } from "@/lib/google-error-response";

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
    return googleErrorResponse(err, "tasks/init POST");
  }
}
