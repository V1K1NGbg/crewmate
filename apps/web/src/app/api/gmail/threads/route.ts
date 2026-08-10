import { auth } from "@/auth";
import { NextResponse } from "next/server";
import {
  getGmailClient,
  getGmailHeader,
} from "@crewmate/lib/server";
import { googleErrorResponse } from "@/lib/google-error-response";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.accessToken)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const pageToken = searchParams.get("pageToken") ?? undefined;
  const q = searchParams.get("q") ?? "in:inbox";
  const requestedLimit = Number(searchParams.get("limit") ?? 20);
  if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 50) {
    return NextResponse.json({ error: "limit must be an integer from 1 to 50" }, { status: 400 });
  }

  const gmail = getGmailClient(session.accessToken);

  try {
    const listRes = await gmail.users.threads.list({
      userId: "me",
      maxResults: requestedLimit,
      pageToken,
      q,
    });

    const threadItems = listRes.data.threads ?? [];

    const threads: Array<Record<string, unknown>> = [];
    let partialFailures = 0;
    for (let index = 0; index < threadItems.length; index += 5) {
      const batch = threadItems.slice(index, index + 5);
      const results = await Promise.allSettled(batch.map(async (t) => {
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
          starred: lastMsg?.labelIds?.includes("STARRED") ?? false,
        };
      }));
      for (const result of results) {
        if (result.status === "fulfilled") threads.push(result.value);
        else partialFailures += 1;
      }
    }

    return NextResponse.json({
      threads,
      nextPageToken: listRes.data.nextPageToken ?? null,
      partialFailures,
    });
  } catch (err: unknown) {
    return googleErrorResponse(err, "gmail/threads GET");
  }
}
