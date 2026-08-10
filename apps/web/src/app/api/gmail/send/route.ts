import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { getGmailClient } from "@crewmate/lib/server";
import { buildRawEmail } from "@crewmate/mail/shared";
import { googleErrorResponse } from "@/lib/google-error-response";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.accessToken)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const payload = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!payload || typeof payload.to !== "string" || typeof payload.subject !== "string" || typeof payload.body !== "string") {
    return NextResponse.json(
      { error: "Missing required fields: to, subject, body" },
      { status: 400 },
    );
  }
  const { to, subject, body } = payload;
  const threadId = typeof payload.threadId === "string" ? payload.threadId : undefined;
  const inReplyTo = typeof payload.inReplyTo === "string" ? payload.inReplyTo : undefined;

  const gmail = getGmailClient(session.accessToken);

  const profile = await gmail.users.getProfile({ userId: "me" });
  const from = profile.data.emailAddress ?? "";

  let raw: string;
  try {
    raw = buildRawEmail({ from, to, subject, body, inReplyTo });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid email" },
      { status: 400 },
    );
  }

  try {
    const res = await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw, threadId },
    });
    return NextResponse.json({ id: res.data.id });
  } catch (err: unknown) {
    return googleErrorResponse(err, "gmail/send POST");
  }
}
