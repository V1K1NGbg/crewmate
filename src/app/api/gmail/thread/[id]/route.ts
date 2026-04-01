import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { isAuthError } from "@/lib/googleApiError";
import {
  getGmailClient,
  decodeGmailBody,
  getGmailHeader,
} from "@/lib/google";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.accessToken)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
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
    if (isAuthError(err))
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const msg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.accessToken)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const gmail = getGmailClient(session.accessToken);

  try {
    await gmail.users.threads.modify({
      userId: "me",
      id,
      requestBody: { removeLabelIds: ["INBOX"] },
    });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    if (isAuthError(err))
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const msg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
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
  const gmail = getGmailClient(session.accessToken);

  try {
    await gmail.users.threads.trash({ userId: "me", id });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    if (isAuthError(err))
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const msg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
