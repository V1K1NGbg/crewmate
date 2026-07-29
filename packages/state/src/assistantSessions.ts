import type { AssistantSession } from "@crewmate/types";

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

function isAssistantSession(value: unknown): value is AssistantSession {
  if (!value || typeof value !== "object") return false;

  const session = value as Partial<AssistantSession>;
  return (
    typeof session.id === "string" &&
    session.id.length > 0 &&
    typeof session.title === "string" &&
    typeof session.createdAt === "string" &&
    Array.isArray(session.messages)
  );
}

export function initializeAssistantSessions(
  persistedSessions: unknown,
  persistedActiveSessionId: unknown,
  createSession: () => AssistantSession = createEmptyAssistantSession,
): AssistantSessionState {
  const assistantSessions = Array.isArray(persistedSessions)
    ? persistedSessions.filter(isAssistantSession)
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
