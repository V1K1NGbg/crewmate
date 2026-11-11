/**
 * Pure model for AI-suggested email actions: validation of untrusted model
 * output, de-duplication and ordering. Kept free of React so it can be tested.
 */

export type AIActionType =
  | "archive"
  | "unarchive"
  | "create_event"
  | "create_task"
  | "add_to_notes"
  | "reply_draft"
  | "star_email";

export interface AIActionPayload {
  title?: string;
  description?: string;
  dateHint?: string;
  startHint?: string;
  endHint?: string;
  replyDraft?: string;
}

export interface AIAction {
  type: AIActionType;
  label: string;
  description?: string;
  payload?: AIActionPayload;
}

export const ACTION_ORDER: Record<AIActionType, number> = {
  create_event: 0,
  create_task: 1,
  reply_draft: 2,
  add_to_notes: 3,
  star_email: 4,
  archive: 5,
  unarchive: 5,
};

export const MAX_SUGGESTED_ACTIONS = 10;

const PAYLOAD_LIMITS: Record<keyof AIActionPayload, number> = {
  title: 300,
  description: 5_000,
  dateHint: 64,
  startHint: 64,
  endHint: 64,
  replyDraft: 20_000,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isActionType(value: unknown): value is AIActionType {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(ACTION_ORDER, value);
}

function sanitizePayload(value: unknown): AIActionPayload | undefined {
  if (!isRecord(value)) return undefined;
  const payload: AIActionPayload = {};
  for (const [key, limit] of Object.entries(PAYLOAD_LIMITS) as Array<[keyof AIActionPayload, number]>) {
    const field = value[key];
    if (typeof field === "string" && field.trim()) payload[key] = field.slice(0, limit);
  }
  return Object.keys(payload).length > 0 ? payload : undefined;
}

export interface EnabledActionTargets {
  calendar: boolean;
  tasks: boolean;
  notes: boolean;
}

/**
 * Validates model output into well-formed actions: known type, a short label,
 * string-only payload fields with length caps, and a target feature that is
 * enabled. Anything else is dropped.
 */
export function sanitizeSuggestedActions(values: unknown[], enabled: EnabledActionTargets): AIAction[] {
  const actions: AIAction[] = [];
  for (const value of values) {
    if (!isRecord(value) || !isActionType(value.type)) continue;
    if (typeof value.label !== "string" || !value.label.trim()) continue;
    if (value.type === "create_event" && !enabled.calendar) continue;
    if (value.type === "create_task" && !enabled.tasks) continue;
    if (value.type === "add_to_notes" && !enabled.notes) continue;
    const payload = sanitizePayload(value.payload);
    actions.push({
      type: value.type,
      label: value.label.trim().slice(0, 80),
      ...(typeof value.description === "string" && value.description.trim()
        ? { description: value.description.slice(0, 300) }
        : {}),
      ...(payload ? { payload } : {}),
    });
  }
  return actions;
}

/** Removes mailbox actions and duplicates, then orders by usefulness. */
export function orderSuggestedActions(actions: AIAction[]): AIAction[] {
  const seen = new Set<string>();
  const distinct = actions.filter((action) => {
    if (action.type === "archive" || action.type === "unarchive") return false;
    const key = JSON.stringify([action.type, action.label.trim().toLowerCase(), action.payload ?? null]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return distinct
    .sort((a, b) => ACTION_ORDER[a.type] - ACTION_ORDER[b.type])
    .slice(0, MAX_SUGGESTED_ACTIONS);
}
