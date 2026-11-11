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

const MESSAGE_ID = /^<[^\s<>]+>$/;
const MAX_REFERENCES = 20;

/**
 * Builds an RFC 5322 `References` value for a reply: the Message-IDs of the
 * thread up to and including the message being replied to, oldest first.
 * Invalid IDs are dropped and the chain is capped to the most recent entries.
 */
export function buildReferences(threadMessageIds: Array<string | undefined>, replyToMessageId: string): string {
  const ids = threadMessageIds.map((id) => id?.trim() ?? "");
  const end = ids.indexOf(replyToMessageId.trim());
  const chain = (end === -1 ? [...ids, replyToMessageId.trim()] : ids.slice(0, end + 1))
    .filter((id) => MESSAGE_ID.test(id));
  return [...new Set(chain)].slice(-MAX_REFERENCES).join(" ");
}

function safeReferences(value: string): string {
  const ids = safeHeader(value, "References").split(/\s+/);
  if (ids.length > MAX_REFERENCES || !ids.every((id) => MESSAGE_ID.test(id))) {
    throw new Error("References contains an invalid message ID");
  }
  return ids.join(" ");
}

export function buildRawEmail(params: {
  from: string;
  to: string;
  subject: string;
  body: string;
  inReplyTo?: string;
  references?: string;
}): string {
  const from = safeHeader(params.from, "From");
  const recipients = params.to.split(",").map((part) => safeHeader(part, "To"));
  if (!recipients.every((recipient) => EMAIL.test(recipient.replace(/^.*<([^>]+)>$/, "$1")))) {
    throw new Error("To contains an invalid email address");
  }
  if (params.body.length > 1_000_000) throw new Error("Message body is too large");
  const inReplyTo = params.inReplyTo ? safeHeader(params.inReplyTo, "In-Reply-To") : undefined;
  const references = inReplyTo
    ? params.references?.trim() ? safeReferences(params.references) : inReplyTo
    : undefined;
  const headers = [
    `From: ${from}`,
    `To: ${recipients.join(", ")}`,
    `Subject: ${encodeSubject(params.subject)}`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=utf-8",
    inReplyTo ? `In-Reply-To: ${inReplyTo}` : "",
    references ? `References: ${references}` : "",
  ].filter(Boolean).join("\r\n");
  return Buffer.from(`${headers}\r\n\r\n${params.body}`).toString("base64url");
}
