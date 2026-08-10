const HEADER_BREAK = /[\r\n]/;
const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

function safeHeader(value: string, name: string): string {
  const trimmed = value.trim();
  if (!trimmed || HEADER_BREAK.test(trimmed)) throw new Error(`${name} contains invalid characters`);
  return trimmed;
}

function encodeSubject(subject: string): string {
  const safe = safeHeader(subject, "Subject");
  return /^[\x20-\x7e]*$/.test(safe)
    ? safe
    : `=?UTF-8?B?${Buffer.from(safe, "utf8").toString("base64")}?=`;
}

export function buildRawEmail(params: {
  from: string;
  to: string;
  subject: string;
  body: string;
  inReplyTo?: string;
}): string {
  const from = safeHeader(params.from, "From");
  const recipients = params.to.split(",").map((part) => safeHeader(part, "To"));
  if (!recipients.every((recipient) => EMAIL.test(recipient.replace(/^.*<([^>]+)>$/, "$1")))) {
    throw new Error("To contains an invalid email address");
  }
  if (params.body.length > 1_000_000) throw new Error("Message body is too large");
  const inReplyTo = params.inReplyTo ? safeHeader(params.inReplyTo, "In-Reply-To") : undefined;
  const headers = [
    `From: ${from}`,
    `To: ${recipients.join(", ")}`,
    `Subject: ${encodeSubject(params.subject)}`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=utf-8",
    inReplyTo ? `In-Reply-To: ${inReplyTo}` : "",
    inReplyTo ? `References: ${inReplyTo}` : "",
  ].filter(Boolean).join("\r\n");
  return Buffer.from(`${headers}\r\n\r\n${params.body}`).toString("base64url");
}
