const STORAGE_PREFIX = "crewmate-task-email:";

export function saveTaskEmailContext(taskId: string, email: string): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + taskId, email);
  } catch {
    /* quota exceeded — best effort */
  }
}

export function getTaskEmailContext(taskId: string): string | undefined {
  try {
    return localStorage.getItem(STORAGE_PREFIX + taskId) ?? undefined;
  } catch {
    return undefined;
  }
}

export function deleteTaskEmailContext(taskId: string): void {
  try {
    localStorage.removeItem(STORAGE_PREFIX + taskId);
  } catch {
    /* ignore */
  }
}
