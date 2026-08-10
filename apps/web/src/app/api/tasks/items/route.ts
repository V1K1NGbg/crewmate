import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { getTasksClient } from "@crewmate/lib/server";
import { googleErrorResponse } from "@/lib/google-error-response";

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allItems: any[] = [];
    let pageToken: string | undefined;
    do {
      const res = await tasks.tasks.list({
        tasklist: listId,
        maxResults: 100,
        showCompleted: true,
        showHidden: true,
        ...(pageToken ? { pageToken } : {}),
      });
      allItems.push(...(res.data.items ?? []));
      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);
    return NextResponse.json({ items: allItems });
  } catch (err: unknown) {
    return googleErrorResponse(err, "tasks/items GET");
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

  const payload = await req.json().catch(() => null);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return NextResponse.json({ error: "Malformed JSON body" }, { status: 400 });
  }
  const { listId, title, notes, due, parent } = payload as {
    listId: string;
    title: string;
    notes?: string;
    due?: string;
    parent?: string;
  };

  if (typeof listId !== "string" || typeof title !== "string" || !listId.trim() || !title.trim() || title.length > 1024 || (notes !== undefined && typeof notes !== "string") || (parent !== undefined && typeof parent !== "string") || (due !== undefined && (typeof due !== "string" || Number.isNaN(Date.parse(due)))))
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
    return googleErrorResponse(err, "tasks/items POST");
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

  const payload = await req.json().catch(() => null);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return NextResponse.json({ error: "Malformed JSON body" }, { status: 400 });
  }
  const { listId, taskId, ...fields } = payload as {
    listId: string;
    taskId: string;
    title?: string;
    notes?: string;
    status?: string;
    due?: string;
  };

  if (typeof listId !== "string" || typeof taskId !== "string" || !listId.trim() || !taskId.trim() || (fields.status !== undefined && fields.status !== "needsAction" && fields.status !== "completed") || (fields.due !== undefined && fields.due !== "" && (typeof fields.due !== "string" || Number.isNaN(Date.parse(fields.due)))) || (fields.title !== undefined && (typeof fields.title !== "string" || fields.title.length > 1024)) || (fields.notes !== undefined && typeof fields.notes !== "string"))
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
    return googleErrorResponse(err, "tasks/items PATCH");
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
    return googleErrorResponse(err, "tasks/items DELETE");
  }
}
