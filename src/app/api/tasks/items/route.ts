import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { isAuthError } from "@/lib/googleApiError";
import { getTasksClient } from "@/lib/google";

/**
 * GET /api/tasks/items?listId=<taskListId>
 * Returns all tasks in the given list.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.accessToken)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const listId = searchParams.get("listId");
  if (!listId)
    return NextResponse.json(
      { error: "Missing listId parameter" },
      { status: 400 },
    );

  const tasks = getTasksClient(session.accessToken);

  try {
    const res = await tasks.tasks.list({
      tasklist: listId,
      maxResults: 100,
      showCompleted: true,
      showHidden: true,
    });
    return NextResponse.json({ items: res.data.items ?? [] });
  } catch (err: unknown) {
    if (isAuthError(err))
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const msg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * POST /api/tasks/items
 * Body: { listId, title, notes?, due? }
 * Creates a new task.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.accessToken)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { listId, title, notes, due, parent } = (await req.json()) as {
    listId: string;
    title: string;
    notes?: string;
    due?: string;
    parent?: string;
  };

  if (!listId || !title)
    return NextResponse.json(
      { error: "Missing listId or title" },
      { status: 400 },
    );

  const tasks = getTasksClient(session.accessToken);

  try {
    const res = await tasks.tasks.insert({
      tasklist: listId,
      parent: parent || undefined,
      requestBody: {
        title,
        notes: notes || undefined,
        due: due ? new Date(due).toISOString() : undefined,
      },
    });
    return NextResponse.json({ task: res.data });
  } catch (err: unknown) {
    if (isAuthError(err))
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const msg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * PATCH /api/tasks/items
 * Body: { listId, taskId, ...fields }
 * Updates a task (status, title, notes, due).
 */
export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.accessToken)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { listId, taskId, ...fields } = (await req.json()) as {
    listId: string;
    taskId: string;
    title?: string;
    notes?: string;
    status?: string;
    due?: string;
  };

  if (!listId || !taskId)
    return NextResponse.json(
      { error: "Missing listId or taskId" },
      { status: 400 },
    );

  const tasks = getTasksClient(session.accessToken);

  try {
    const body: Record<string, string | undefined> = {};
    if (fields.title !== undefined) body.title = fields.title;
    if (fields.notes !== undefined) body.notes = fields.notes;
    if (fields.status !== undefined) body.status = fields.status;
    if (fields.due !== undefined)
      body.due = fields.due ? new Date(fields.due).toISOString() : undefined;

    const res = await tasks.tasks.patch({
      tasklist: listId,
      task: taskId,
      requestBody: body,
    });
    return NextResponse.json({ task: res.data });
  } catch (err: unknown) {
    if (isAuthError(err))
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const msg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * DELETE /api/tasks/items?listId=<listId>&taskId=<taskId>
 */
export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.accessToken)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const listId = searchParams.get("listId");
  const taskId = searchParams.get("taskId");

  if (!listId || !taskId)
    return NextResponse.json(
      { error: "Missing listId or taskId" },
      { status: 400 },
    );

  const tasks = getTasksClient(session.accessToken);

  try {
    await tasks.tasks.delete({ tasklist: listId, task: taskId });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    if (isAuthError(err))
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const msg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
