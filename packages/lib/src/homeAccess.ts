export const OPERATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VM_ID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const PUBLIC_KEY = /^[A-Za-z0-9+/]{43}=$/;

export function isLocalOwner(provider: unknown, subject: unknown, owner: string | undefined): boolean {
  return provider === "local" && typeof subject === "string" && Boolean(owner) && subject === owner;
}

/** Only operator-configured HTTPS origins are exposed as embedded application URLs. */
export function privateServiceOrigin(value: string | undefined): string | null {
  if (!value) return null;
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error("Service addresses must be HTTPS origins without paths or credentials");
  }
  return url.origin;
}

export function isSameOriginMutation(request: Request, applicationUrl: string | undefined): boolean {
  try {
    // Do not trust Host or forwarded headers to choose the CSRF origin.
    return Boolean(applicationUrl) && request.headers.get("origin") === new URL(applicationUrl!).origin &&
      request.headers.get("sec-fetch-site") !== "cross-site" &&
      request.headers.get("content-type")?.split(";")[0].trim() === "application/json";
  } catch {
    return false;
  }
}

export function validateHomeMutation(resource: string, input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Expected a JSON object");
  const value = input as Record<string, unknown>;
  if (typeof value.operationId !== "string" || !OPERATION_ID.test(value.operationId)) throw new Error("Invalid operation ID");
  const operationId = value.operationId;
  if (resource === "vms" && typeof value.id === "string" && VM_ID.test(value.id) &&
      ["start", "shutdown", "destroy"].includes(String(value.action))) {
    if (value.action === "destroy" && value.confirm !== true) throw new Error("Force stop requires confirmation");
    return { operationId, id: value.id, action: value.action, confirm: value.confirm === true };
  }
  if (resource === "vpn" && value.action === "add" && typeof value.name === "string" && /^[\p{L}\p{N} _.-]{1,64}$/u.test(value.name.trim())) {
    return { operationId, action: "add", name: value.name.trim() };
  }
  if (resource === "vpn" && value.action === "revoke" && typeof value.publicKey === "string" && PUBLIC_KEY.test(value.publicKey)) {
    if (value.confirm !== true) throw new Error("Peer revocation requires confirmation");
    return { operationId, action: "revoke", publicKey: value.publicKey, confirm: true };
  }
  throw new Error("Invalid management action or identifier");
}

export async function readBoundedJson(request: Request, maximum = 16_384): Promise<unknown> {
  if (!request.body) throw new Error("Expected a JSON body");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) {
        await reader.cancel();
        throw new Error("Request body is too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}
