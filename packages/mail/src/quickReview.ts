import type { GmailPluginSettings } from "./settings";

export type QuickReviewCommand =
  | "next-action"
  | "previous-action"
  | "apply"
  | "skip"
  | "apply-only";

export function quickReviewCommandForKey(
  key: string,
  settings: GmailPluginSettings,
): QuickReviewCommand | null {
  const pressed = key.toLowerCase();
  if (pressed === (settings.reviewNextActionKey ?? "j")) return "next-action";
  if (pressed === (settings.reviewPreviousActionKey ?? "k")) return "previous-action";
  if (pressed === (settings.reviewApplyKey ?? "e")) return "apply";
  if (pressed === (settings.reviewSkipKey ?? "x")) return "skip";
  if (pressed === (settings.reviewApplyOnlyKey ?? "a")) return "apply-only";
  return null;
}

export function waitsForReviewDestination(actionType: string): boolean {
  return (
    actionType === "create_event" ||
    actionType === "create_task" ||
    actionType === "add_to_notes" ||
    actionType === "reply_draft"
  );
}
