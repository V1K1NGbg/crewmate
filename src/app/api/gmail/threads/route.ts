import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { isAuthError } from "@/lib/googleApiError";
import {
  getGmailClient,
  decodeGmailBody,
  getGmailHeader,
} from "@/lib/google";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.accessToken)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const pageToken = searchParams.get("pageToken") ?? undefined;
  const q = searchParams.get("q") ?? "in:inbox";

  const gmail = getGmailClient(session.accessToken);

  try {
    const listRes = await gmail.users.threads.list({
      userId: "me",
      maxResults: 25,
      pageToken,
      q,
    });

    const threadItems = listRes.data.threads ?? [];

    const threads = await Promise.all(
      threadItems.map(async (t) => {
        const thread = await gmail.users.threads.get({
          userId: "me",
          id: t.id!,
          format: "metadata",
          metadataHeaders: ["Subject", "From", "To", "Date"],
        });
        const lastMsg = thread.data.messages?.at(-1);
        const headers = lastMsg?.payload?.headers as
          | Array<{ name: string; value: string }>
          | undefined;
        return {
          id: t.id,
          snippet: thread.data.snippet ?? "",
          subject: getGmailHeader(headers, "Subject") || "(no subject)",
          from: getGmailHeader(headers, "From"),
          date: getGmailHeader(headers, "Date"),
          messageCount: thread.data.messages?.length ?? 1,
          labelIds: lastMsg?.labelIds ?? [],
          unread: lastMsg?.labelIds?.includes("UNREAD") ?? false,
        };
      }),
    );

    return NextResponse.json({
      threads,
      nextPageToken: listRes.data.nextPageToken ?? null,
    });
  } catch (err: unknown) {
    if (isAuthError(err))
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const msg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
