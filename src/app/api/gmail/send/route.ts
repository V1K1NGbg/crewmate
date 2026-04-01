import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { getGmailClient } from "@/lib/google";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.accessToken)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { to, subject, body, threadId, inReplyTo } = await req.json();
  if (!to || !subject || !body) {
    return NextResponse.json(
      { error: "Missing required fields: to, subject, body" },
      { status: 400 },
    );
  }

  const gmail = getGmailClient(session.accessToken);

  const profile = await gmail.users.getProfile({ userId: "me" });
  const from = profile.data.emailAddress ?? "";

  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/html; charset=utf-8`,
    inReplyTo ? `In-Reply-To: ${inReplyTo}` : "",
    inReplyTo ? `References: ${inReplyTo}` : "",
  ]
    .filter(Boolean)
    .join("\r\n");

  const raw = Buffer.from(`${headers}\r\n\r\n${body}`).toString("base64url");

  try {
    const res = await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw, threadId },
    });
    return NextResponse.json({ id: res.data.id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Send failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
