import type { ReactNode } from "react";
import {
  Archive,
  ArchiveRestore,
  CalendarPlus,
  CheckSquare,
  FileText,
  Star,
  Wand2,
} from "lucide-react";
import type { AIActionType } from "./suggestedActions";

/** Icon and feature colour for each suggested action type. */
export const ACTION_STYLES: Record<
  AIActionType,
  { icon: ReactNode; color: string; bg: string; border: string }
> = {
  archive: {
    icon: <Archive size={14} />,
    color: "var(--color-mail)",
    bg: "color-mix(in srgb, var(--color-mail) 8%, transparent)",
    border: "color-mix(in srgb, var(--color-mail) 30%, transparent)",
  },
  unarchive: {
    icon: <ArchiveRestore size={14} />,
    color: "var(--color-mail)",
    bg: "color-mix(in srgb, var(--color-mail) 8%, transparent)",
    border: "color-mix(in srgb, var(--color-mail) 30%, transparent)",
  },
  create_event: {
    icon: <CalendarPlus size={14} />,
    color: "var(--color-calendar)",
    bg: "color-mix(in srgb, var(--color-calendar) 8%, transparent)",
    border: "color-mix(in srgb, var(--color-calendar) 30%, transparent)",
  },
  create_task: {
    icon: <CheckSquare size={14} />,
    color: "var(--color-tasks)",
    bg: "color-mix(in srgb, var(--color-tasks) 8%, transparent)",
    border: "color-mix(in srgb, var(--color-tasks) 30%, transparent)",
  },
  add_to_notes: {
    icon: <FileText size={14} />,
    color: "var(--color-notes)",
    bg: "color-mix(in srgb, var(--color-notes) 8%, transparent)",
    border: "color-mix(in srgb, var(--color-notes) 30%, transparent)",
  },
  reply_draft: {
    icon: <Wand2 size={14} />,
    color: "var(--color-mail)",
    bg: "color-mix(in srgb, var(--color-mail) 8%, transparent)",
    border: "color-mix(in srgb, var(--color-mail) 30%, transparent)",
  },
  star_email: {
    icon: <Star size={14} />,
    color: "var(--color-mail)",
    bg: "color-mix(in srgb, var(--color-mail) 8%, transparent)",
    border: "color-mix(in srgb, var(--color-mail) 30%, transparent)",
  },
};
