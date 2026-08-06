import { lazy } from "react";
import { Mail, Pencil, Search } from "lucide-react";
import type { FeaturePlugin, GmailThread } from "@crewmate/types";
import { DEFAULT_GMAIL_SETTINGS, type GmailPluginSettings } from "./settings";

function buildAssistantContext(data: unknown): string | null {
  const threads = (data as GmailThread[] | undefined) ?? [];
  if (threads.length === 0) return null;
  const lines: string[] = [`\n--- Emails (${threads.length}) ---`];
  for (const t of threads.slice(0, 15)) {
    const unread = t.unread ? " [UNREAD]" : "";
    lines.push(
      `• From: ${t.from} | Subject: ${t.subject}${unread} | ${t.date}`,
    );
    if (t.snippet) lines.push(`  ${t.snippet.slice(0, 150)}`);
  }
  if (threads.length > 15) lines.push(`  …and ${threads.length - 15} more`);
  return lines.join("\n");
}

export const mailPlugin: FeaturePlugin<GmailPluginSettings> = {
  id: "mail",
  packageName: "@crewmate/mail",
  label: "Mail",
  description:
    "Browse your Gmail inbox, reply, archive, and get AI-suggested actions.",
  icon: Mail,
  color: "#f87171",
  keybinding: "1",
  enabledByDefault: true,
  Page: lazy(() => import("./GmailPage")),
  defaultSettings: DEFAULT_GMAIL_SETTINGS,
  SettingsSection: lazy(() => import("./GmailSettingsSection")),
  buildAssistantContext,
  assistantActions: [
    {
      type: "compose_email",
      icon: Pencil,
      promptHint:
        '{"type":"compose_email","label":"Compose email","payload":{"to":"...","subject":"...","body":"..."}}',
      buildPrefill: (payload) => ({
        to: payload?.to,
        subject: payload?.subject,
        body: payload?.body,
      }),
    },
    {
      type: "search_mail",
      icon: Search,
      promptHint:
        '{"type":"search_mail","label":"Search mail","payload":{"query":"from:person@example.com"}}',
      buildPrefill: (payload) => ({ query: payload?.query }),
    },
  ],
};
