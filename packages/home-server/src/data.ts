import type { HomeMutation, HomeOperation, HomeServices, HostOverview, VirtualMachine, VPNStatus } from "@crewmate/types";

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function list(value: unknown, valid: (item: Record<string, unknown>) => boolean): boolean {
  return Array.isArray(value) && value.every((item: unknown) => record(item) && valid(item));
}

function invalid(): never {
  throw new Error("The server returned an invalid response. Refresh to check again.");
}

export function parseOverview(value: unknown): HostOverview {
  if (!record(value) || typeof value.hostname !== "string" || !finite(value.uptimeSeconds)
    || !record(value.cpu) || !finite(value.cpu.count) || !finite(value.cpu.load1)
    || !(value.cpu.usagePercent === null || finite(value.cpu.usagePercent))
    || !record(value.memory) || !finite(value.memory.totalBytes) || !finite(value.memory.availableBytes)
    || !list(value.storage, (item) => typeof item.label === "string" && finite(item.totalBytes) && finite(item.freeBytes))
    || !list(value.temperatures, (item) => typeof item.label === "string" && typeof item.celsius === "number" && Number.isFinite(item.celsius))
    || !list(value.gpu, (item) => typeof item.name === "string" && finite(item.memoryTotalMiB) && finite(item.memoryUsedMiB)
      && finite(item.temperatureCelsius) && finite(item.utilizationPercent))
    || !list(value.services, (item) => typeof item.id === "string" && ["ready", "unavailable", "unknown"].includes(String(item.status)) && typeof item.detail === "string")
    || !list(value.recentFailures, (item) => typeof item.at === "string" && typeof item.operation === "string" && typeof item.message === "string")) return invalid();
  return value as unknown as HostOverview;
}

/** Only server-supplied HTTPS locations can become links or frame sources. */
export function approvedUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

export function parseServices(value: unknown): HomeServices {
  if (!record(value) || typeof value.googleDeferred !== "boolean") return invalid();
  for (const key of ["photosUrl", "containersUrl", "identityUrl"]) {
    if (!(value[key] === null || approvedUrl(value[key]))) return invalid();
  }
  return value as unknown as HomeServices;
}

export function parseVMs(value: unknown): { vms: VirtualMachine[] } {
  if (!record(value) || !list(value.vms, (item) => typeof item.id === "string" && typeof item.name === "string"
    && typeof item.state === "string" && finite(item.cpus) && finite(item.memoryMiB)
    && (item.diskBytes === undefined || finite(item.diskBytes)))) return invalid();
  return value as unknown as { vms: VirtualMachine[] };
}

export function parseVPN(value: unknown): VPNStatus {
  if (!record(value) || typeof value.interface !== "string"
    || !list(value.peers, (item) => typeof item.publicKey === "string" && typeof item.name === "string"
      && typeof item.address === "string" && finite(item.lastHandshake) && finite(item.receivedBytes) && finite(item.sentBytes))) return invalid();
  return value as unknown as VPNStatus;
}

export function parseOperation(value: unknown, operationId: string): HomeOperation {
  if (!record(value) || value.operationId !== operationId
    || !["completed", "pending", "failed", "uncertain"].includes(String(value.status))
    || typeof value.message !== "string" || (value.configuration !== undefined && typeof value.configuration !== "string")
    || (value.forceStopVM !== undefined && (value.status !== "pending" || typeof value.forceStopVM !== "string" || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value.forceStopVM)))) return invalid();
  return value as unknown as HomeOperation;
}

export function operationIsUnresolved(operation: HomeOperation | null): boolean {
  return operation?.status === "pending" || operation?.status === "uncertain";
}

export function operationWithoutSecret(operation: HomeOperation): HomeOperation {
  return { operationId: operation.operationId, status: operation.status, message: operation.message,
    ...(operation.forceStopVM ? { forceStopVM: operation.forceStopVM } : {}) };
}

export function canForceStop(operation: HomeOperation | null, id: string): boolean {
  return operation?.status === "pending" && operation.forceStopVM === id;
}

export function isOperationId(value: string | null): value is string {
  return value !== null && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function validPeerName(value: string): boolean {
  return /^[\p{L}\p{N} _.-]{1,64}$/u.test(value.trim());
}

export async function responseData(response: Response): Promise<unknown> {
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(record(body) && typeof body.error === "string"
      ? body.error : `Request failed (${response.status}).`);
  }
  return body;
}

export type MutationInput = HomeMutation extends infer Mutation
  ? Mutation extends HomeMutation ? Omit<Mutation, "operationId"> : never : never;

export async function submitOperation(url: string, mutation: HomeMutation, signal: AbortSignal, fetchImpl: typeof fetch = fetch): Promise<HomeOperation> {
  try {
    const response = await fetchImpl(url, {
      method: "POST", signal, cache: "no-store",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(mutation),
    });
    if (!response.ok && [400, 401, 403, 409, 413, 415, 422, 429].includes(response.status)) {
      const body: unknown = await response.json().catch(() => null);
      if (record(body) && body.operationId === mutation.operationId) return parseOperation(body, mutation.operationId);
      return {
        operationId: mutation.operationId, status: "failed",
        message: record(body) && typeof body.error === "string" ? body.error : `The action was rejected (${response.status}).`,
      };
    }
    return parseOperation(await responseData(response), mutation.operationId);
  } catch (error) {
    // A failed response does not prove that the host did not perform the action.
    return {
      operationId: mutation.operationId, status: "uncertain",
      message: error instanceof Error ? error.message : "The response was lost. Check the recorded operation.",
    };
  }
}

export async function readOperation(operationId: string, signal: AbortSignal, fetchImpl: typeof fetch = fetch): Promise<HomeOperation> {
  try {
    const response = await fetchImpl(`/api/home/operations?id=${encodeURIComponent(operationId)}`, { signal, cache: "no-store" });
    return operationWithoutSecret(parseOperation(await responseData(response), operationId));
  } catch (error) {
    return { operationId, status: "uncertain", message: error instanceof Error ? error.message : "Unable to read the operation ledger." };
  }
}

export function formatBytes(value: number | undefined): string {
  if (value === undefined || !finite(value)) return "Unknown";
  if (value === 0) return "0 B";
  const index = Math.max(0, Math.min(Math.floor(Math.log(value) / Math.log(1024)), 4));
  return `${(value / 1024 ** index).toLocaleString(undefined, { maximumFractionDigits: 1 })} ${["B", "KiB", "MiB", "GiB", "TiB"][index]}`;
}

export function usedPercent(total: number, free: number): number | null {
  return finite(total) && total > 0 && finite(free) && free <= total ? (total - free) / total * 100 : null;
}

export function formatTimestamp(value: string | number): string {
  if (typeof value === "number" && value <= 0) return "Never reported";
  const date = new Date(typeof value === "number" ? value * 1000 : value);
  return Number.isNaN(date.getTime()) ? "Unknown" : date.toLocaleString();
}

export function formatUptime(seconds: number): string {
  if (!finite(seconds)) return "Unknown";
  const hours = Math.floor(seconds / 3600);
  return `${Math.floor(hours / 24)}d ${hours % 24}h ${Math.floor(seconds / 60) % 60}m`;
}
