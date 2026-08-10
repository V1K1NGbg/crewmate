const STORAGE_PREFIX = "crewmate-task-email:";

function key(accountKey: string, taskId: string) {
  return `${STORAGE_PREFIX}${accountKey}:${taskId}`;
}

export function saveTaskEmailContext(accountKey: string, taskId: string, email: string): void {
  try {
    localStorage.setItem(key(accountKey, taskId), email);
  } catch {
    /* quota exceeded — best effort */
  }
}

export function getTaskEmailContext(accountKey: string, taskId: string): string | undefined {
  try {
    return localStorage.getItem(key(accountKey, taskId)) ?? undefined;
  } catch {
    return undefined;
  }
}

export function deleteTaskEmailContext(accountKey: string, taskId: string): void {
  try {
    localStorage.removeItem(key(accountKey, taskId));
  } catch {
    /* ignore */
  }
}
