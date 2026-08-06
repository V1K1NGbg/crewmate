import type { AssistantMessage, AssistantSession } from "@crewmate/types";

export interface AssistantSessionState {
  assistantSessions: AssistantSession[];
  activeSessionId: string;
}

export function createEmptyAssistantSession(): AssistantSession {
  return {
    id: `session-${crypto.randomUUID()}`,
    title: "New conversation",
    createdAt: new Date().toISOString(),
    messages: [],
  };
}

function sanitizeMessage(value: unknown, sessionId: string): AssistantMessage | null {
  if (!value || typeof value !== "object") return null;
  const message = value as Partial<AssistantMessage>;
  if (
    typeof message.id !== "string" ||
    (message.role !== "user" && message.role !== "assistant") ||
    typeof message.content !== "string" ||
    typeof message.timestamp !== "string"
  ) return null;
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    timestamp: message.timestamp,
    sessionId,
    ...(Array.isArray(message.actions) ? { actions: message.actions } : {}),
  };
}

function sanitizeAssistantSession(value: unknown): AssistantSession | null {
  if (!value || typeof value !== "object") return null;

  const session = value as Partial<AssistantSession>;
  if (!(
    typeof session.id === "string" &&
    session.id.length > 0 &&
    typeof session.title === "string" &&
    typeof session.createdAt === "string" &&
    Array.isArray(session.messages)
  )) return null;
  return {
    id: session.id,
    title: session.title,
    createdAt: session.createdAt,
    messages: session.messages
      .map((message) => sanitizeMessage(message, session.id as string))
      .filter((message): message is AssistantMessage => message !== null),
  };
}

export function initializeAssistantSessions(
  persistedSessions: unknown,
  persistedActiveSessionId: unknown,
  createSession: () => AssistantSession = createEmptyAssistantSession,
): AssistantSessionState {
  const assistantSessions = Array.isArray(persistedSessions)
    ? persistedSessions
        .map(sanitizeAssistantSession)
        .filter((session): session is AssistantSession => session !== null)
    : [];

  if (assistantSessions.length === 0) {
    const session = createSession();
    return {
      assistantSessions: [session],
      activeSessionId: session.id,
    };
  }

  const activeSessionId =
    typeof persistedActiveSessionId === "string" &&
    assistantSessions.some(
      (session) => session.id === persistedActiveSessionId,
    )
      ? persistedActiveSessionId
      : assistantSessions[0].id;

  return { assistantSessions, activeSessionId };
}

export function removeAssistantSession(
  assistantSessions: AssistantSession[],
  activeSessionId: string | null,
  sessionId: string,
  createSession: () => AssistantSession = createEmptyAssistantSession,
): AssistantSessionState {
  const remainingSessions = assistantSessions.filter(
    (session) => session.id !== sessionId,
  );

  if (remainingSessions.length === 0) {
    const session = createSession();
    return {
      assistantSessions: [session],
      activeSessionId: session.id,
    };
  }

  const nextActiveSessionId = remainingSessions.some(
    (session) => session.id === activeSessionId,
  )
    ? (activeSessionId as string)
    : remainingSessions[0].id;

  return {
    assistantSessions: remainingSessions,
    activeSessionId: nextActiveSessionId,
  };
}

/** Build bounded conversational memory without leaking messages from other sessions. */
export function buildAssistantSessionMemory(
  session: AssistantSession | undefined,
  maxCharacters = 12000,
): string {
  if (!session || session.messages.length === 0) return "";

  const lines: string[] = [];
  let used = 0;
  for (const message of [...session.messages].reverse()) {
    const line = `${message.role === "user" ? "User" : "Assistant"}: ${message.content}`;
    if (lines.length > 0 && used + line.length > maxCharacters) break;
    lines.push(line.slice(0, Math.max(0, maxCharacters - used)));
    used += line.length;
    if (used >= maxCharacters) break;
  }
  return lines.reverse().join("\n\n");
}

export function appendAssistantMessage(
  sessions: AssistantSession[],
  message: AssistantMessage,
): AssistantSession[] {
  if (!sessions.some((session) => session.id === message.sessionId)) return sessions;
  return sessions.map((session) =>
    session.id === message.sessionId
      ? { ...session, messages: [...session.messages, message] }
      : session,
  );
}
