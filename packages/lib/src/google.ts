import { google } from "googleapis";

/**
 * Shared helpers for creating authenticated Google API clients.
 * Used across all API routes to avoid duplicating OAuth2 setup.
 */

function createOAuth2Client(accessToken: string) {
  const oauth2 = new google.auth.OAuth2();
  oauth2.setCredentials({ access_token: accessToken });
  return oauth2;
}

export function getGmailClient(accessToken: string) {
  return google.gmail({ version: "v1", auth: createOAuth2Client(accessToken) });
}

export function getCalendarClient(accessToken: string) {
  return google.calendar({
    version: "v3",
    auth: createOAuth2Client(accessToken),
  });
}

export function getDocsClient(accessToken: string) {
  return google.docs({ version: "v1", auth: createOAuth2Client(accessToken) });
}

export function getDriveClient(accessToken: string) {
  return google.drive({ version: "v3", auth: createOAuth2Client(accessToken) });
}

export function getTasksClient(accessToken: string) {
  return google.tasks({
    version: "v1",
    auth: createOAuth2Client(accessToken),
  });
}

// ─── Gmail payload decoding ──────────────────────────────────────────────────

interface GmailPayloadPart {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailPayloadPart[];
}

/**
 * Recursively decode a Gmail message payload, preferring HTML over plain text.
 */
export function decodeGmailBody(payload: GmailPayloadPart | undefined): string {
  if (!payload) return "";

  if (payload.body?.data) {
    return Buffer.from(payload.body.data, "base64url").toString("utf-8");
  }

  if (payload.parts) {
    const html = payload.parts.find((p) => p.mimeType === "text/html");
    if (html?.body?.data)
      return Buffer.from(html.body.data, "base64url").toString("utf-8");

    const plain = payload.parts.find((p) => p.mimeType === "text/plain");
    if (plain?.body?.data)
      return Buffer.from(plain.body.data, "base64url").toString("utf-8");

    for (const part of payload.parts) {
      const decoded = decodeGmailBody(part);
      if (decoded) return decoded;
    }
  }

  return "";
}

interface GmailHeader {
  name: string;
  value: string;
}

/** Extract a header value from a Gmail message's headers array. */
export function getGmailHeader(
  headers: GmailHeader[] | undefined,
  name: string,
): string {
  if (!headers) return "";
  return (
    headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ??
    ""
  );
}
