import { format } from "date-fns";
import type { GmailMessage } from "./useGmail";

/** Pure formatting helpers for Gmail data; no React, so they are unit tested. */

export function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return format(d, "h:mm a");
    if (d.getFullYear() === now.getFullYear()) return format(d, "MMM d");
    return format(d, "MMM d, yyyy");
  } catch {
    return dateStr;
  }
}

export function extractName(from: string): string {
  const match = from.match(/^"?([^"<]+)"?\s*</);
  return match ? match[1].trim() : from.replace(/<.*>/, "").trim();
}

export function extractEmail(from: string): string {
  const match = from.match(/<([^>]+)>/);
  return match ? match[1] : from;
}

export function stripHtml(html: string, maxLength?: number): string {
  const text = html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return maxLength !== undefined ? text.slice(0, maxLength) : text;
}

export function messageBodyText(msg: GmailMessage): string {
  return msg.body.includes("<") ? stripHtml(msg.body) : msg.body;
}

export function buildThreadEmailContext(msgs: GmailMessage[]): string {
  if (msgs.length === 0) return "";
  if (msgs.length === 1) return messageBodyText(msgs[0]);
  return msgs
    .map((msg, i) => {
      const body = messageBodyText(msg);
      return `--- Message ${i + 1} of ${msgs.length} ---\nFrom: ${msg.from}\nDate: ${msg.date}\nSubject: ${msg.subject}\n\n${body}`;
    })
    .join("\n\n");
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2)
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}
