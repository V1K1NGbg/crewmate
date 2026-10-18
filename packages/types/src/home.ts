/** Local management API contracts. Credentials are never part of fetched state. */
export interface HostOverview {
  hostname: string;
  uptimeSeconds: number;
  cpu: { count: number; load1: number; usagePercent: number | null };
  memory: { totalBytes: number; availableBytes: number };
  storage: { label: string; totalBytes: number; freeBytes: number }[];
  temperatures: { label: string; celsius: number }[];
  gpu: { name: string; memoryTotalMiB: number; memoryUsedMiB: number; temperatureCelsius: number; utilizationPercent: number }[];
  services: { id: string; status: "ready" | "unavailable" | "unknown"; detail: string }[];
  recentFailures: { at: string; operation: string; message: string }[];
}

export interface VirtualMachine {
  id: string;
  name: string;
  state: string;
  cpus: number;
  memoryMiB: number;
  diskBytes?: number;
}

export interface VPNPeer {
  publicKey: string;
  name: string;
  address: string;
  lastHandshake: number;
  receivedBytes: number;
  sentBytes: number;
}

export interface VPNStatus {
  interface: string;
  peers: VPNPeer[];
}

export interface HomeServices {
  photosUrl: string | null;
  containersUrl: string | null;
  identityUrl: string | null;
  googleDeferred: boolean;
}

export type VMAction = "start" | "shutdown" | "destroy";
export type HomeMutation =
  | { operationId: string; id: string; action: VMAction; confirm?: boolean }
  | { operationId: string; action: "add"; name: string }
  | { operationId: string; action: "revoke"; publicKey: string; confirm?: boolean };

export interface HomeOperation {
  operationId: string;
  status: "completed" | "pending" | "failed" | "uncertain";
  message: string;
  /** Only an acknowledged graceful shutdown may offer this deliberate follow-up. */
  forceStopVM?: string;
  /** Returned once for new peers; never included in operation history. */
  configuration?: string;
}
