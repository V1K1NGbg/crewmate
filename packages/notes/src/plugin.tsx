import { lazy } from "react";
import { FilePlus, FileText } from "lucide-react";
import type { FeaturePlugin, Note } from "@crewmate/types";
import { DEFAULT_NOTES_SETTINGS, type NotesPluginSettings } from "./settings";

function buildAssistantContext(data: unknown): string | null {
  const notes = (data as Note[] | undefined) ?? [];
  if (notes.length === 0) return null;
  const lines: string[] = [`\n--- Notes (${notes.length}) ---`];
  for (const n of notes.slice(0, 10)) {
    const snippet = n.content.replace(/\n/g, " ").slice(0, 200);
    lines.push(`• ${n.title}: ${snippet}${n.content.length > 200 ? "…" : ""}`);
  }
  if (notes.length > 10) lines.push(`  …and ${notes.length - 10} more`);
  return lines.join("\n");
}

export const notesPlugin: FeaturePlugin<NotesPluginSettings> = {
  id: "notes",
  packageName: "@crewmate/notes",
  label: "Notes",
  description: "A single Google Doc for freeform notes, with AI summarize and formatting.",
  icon: FileText,
  color: "#fbbf24",
  keybinding: "3",
  enabledByDefault: true,
  Page: lazy(() => import("./NotesPage")),
  defaultSettings: DEFAULT_NOTES_SETTINGS,
  SettingsSection: lazy(() => import("./NotesSettingsSection")),
  buildAssistantContext,
  assistantActions: [
    {
      type: "add_note",
      icon: FilePlus,
      promptHint:
        '{"type":"add_note","label":"Add to notes","payload":{"title":"...","content":"..."}}',
      buildPrefill: (payload) => ({
        title: payload?.title ?? "Assistant note",
        content: payload?.content ?? "",
        category: "Assistant notes",
        source: "assistant",
      }),
    },
  ],
};
