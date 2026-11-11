import { auth } from "@/auth";
import { NextResponse } from "next/server";
import {
  getGmailClient,
  decodeGmailBody,
  getGmailHeader,
} from "@crewmate/lib/server";
import { googleErrorResponse } from "@/lib/google-error-response";
import { isResourceId, readJsonObject, readOptionalJsonObject } from "@/lib/requestValidation";

const invalidId = () => NextResponse.json({ error: "Invalid thread id" }, { status: 400 });

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.accessToken)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!isResourceId(id, 128)) return invalidId();
  const gmail = getGmailClient(session.accessToken);

  try {
    const thread = await gmail.users.threads.get({
      userId: "me",
      id,
      format: "full",
    });

    const messages = (thread.data.messages ?? []).map((msg) => {
      const headers = msg.payload?.headers as
        | Array<{ name: string; value: string }>
        | undefined;
      return {
        id: msg.id,
        threadId: msg.threadId,
        subject: getGmailHeader(headers, "Subject") || "(no subject)",
        from: getGmailHeader(headers, "From"),
        to: getGmailHeader(headers, "To"),
        date: getGmailHeader(headers, "Date"),
        messageId: getGmailHeader(headers, "Message-ID"),
        snippet: msg.snippet ?? "",
        body: decodeGmailBody(
          msg.payload as Parameters<typeof decodeGmailBody>[0],
        ),
        labelIds: msg.labelIds ?? [],
      };
    });

    await gmail.users.threads.modify({
      userId: "me",
      id,
      requestBody: { removeLabelIds: ["UNREAD"] },
    });

    return NextResponse.json({ messages });
  } catch (err: unknown) {
    return googleErrorResponse(err, "gmail/thread GET");
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
  if (!isResourceId(id, 128)) return invalidId();
  const gmail = getGmailClient(session.accessToken);
  // An empty body means "archive" for backwards compatibility.
  const body = await readOptionalJsonObject(req, 1024);
  if (!body || (body.archive !== undefined && typeof body.archive !== "boolean")) {
    return NextResponse.json({ error: "archive must be a boolean" }, { status: 400 });
  }
  const archive = body.archive !== false;

  try {
    await gmail.users.threads.modify({
      userId: "me",
      id,
      requestBody: archive
        ? { removeLabelIds: ["INBOX"] }
        : { addLabelIds: ["INBOX"] },
    });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return googleErrorResponse(err, "gmail/thread PATCH");
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.accessToken)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!isResourceId(id, 128)) return invalidId();
  const gmail = getGmailClient(session.accessToken);
  const body = await readJsonObject(req, 1024);
  if (!body || typeof body.star !== "boolean") {
    return NextResponse.json({ error: "star must be a boolean" }, { status: 400 });
  }
  const star = body.star;

  try {
    await gmail.users.threads.modify({
      userId: "me",
      id,
      requestBody: star
        ? { addLabelIds: ["STARRED"] }
        : { removeLabelIds: ["STARRED"] },
    });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return googleErrorResponse(err, "gmail/thread PUT");
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.accessToken)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!isResourceId(id, 128)) return invalidId();
  const gmail = getGmailClient(session.accessToken);

  try {
    await gmail.users.threads.trash({ userId: "me", id });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return googleErrorResponse(err, "gmail/thread DELETE");
  }
}
