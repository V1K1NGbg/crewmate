import assert from "node:assert/strict";
import test from "node:test";
import { approvedUrl, canForceStop, formatBytes, formatTimestamp, formatUptime, isOperationId, operationIsUnresolved, operationWithoutSecret, parseOperation, parseOverview, parseServices, parseVMs, parseVPN, usedPercent, validPeerName } from "./data.ts";

const operationId = "12345678-1234-4123-8123-123456789abc";

test("unknown and empty metrics remain distinct from healthy or zero", () => {
  const overview = {
    hostname: "host", uptimeSeconds: 61, cpu: { count: 4, load1: 0, usagePercent: null },
    memory: { totalBytes: 1024, availableBytes: 512 }, storage: [], temperatures: [], gpu: [],
    services: [{ id: "pcloud-sync", status: "unknown", detail: "No supported health signal" }], recentFailures: [],
  };
  assert.equal(parseOverview(overview).cpu.usagePercent, null);
  assert.equal(parseOverview(overview).services[0].status, "unknown");
  assert.throws(() => parseOverview({ ...overview, storage: null }));
  assert.throws(() => parseOverview({ ...overview, cpu: { ...overview.cpu, usagePercent: "0" } }));
  assert.throws(() => parseOverview({ ...overview, services: [{ id: "sync", status: "online", detail: "" }] }));
  assert.equal(usedPercent(100, 10), 90);
  assert.equal(usedPercent(0, 0), null);
  assert.equal(usedPercent(100, 200), null);
  assert.equal(usedPercent(100, Number.NaN), null);
});

test("server links must be absolute credential-free HTTPS URLs", () => {
  assert.equal(approvedUrl("https://photos.internal/library"), "https://photos.internal/library");
  for (const value of [null, undefined, "//host/path", "/relative", "http://host", "javascript:alert(1)", "https://user:password@host"]) assert.equal(approvedUrl(value), null);
  assert.deepEqual(parseServices({ photosUrl: null, containersUrl: null, identityUrl: null, googleDeferred: true }), { photosUrl: null, containersUrl: null, identityUrl: null, googleDeferred: true });
  assert.throws(() => parseServices({ photosUrl: "http://host", containersUrl: null, identityUrl: null, googleDeferred: true }));
  assert.throws(() => parseServices({ googleDeferred: true }));
});

test("VM and VPN boundaries reject malformed resources without treating failure as empty", () => {
  assert.deepEqual(parseVMs({ vms: [] }), { vms: [] });
  assert.deepEqual(parseVPN({ interface: "wg0", peers: [] }), { interface: "wg0", peers: [] });
  assert.throws(() => parseVMs({}));
  assert.throws(() => parseVMs({ vms: [{ id: "vm", name: "vm", state: "running", cpus: "4", memoryMiB: 1024 }] }));
  assert.throws(() => parseVPN({ interface: "wg0", peers: [{ name: "phone", publicKey: "key", address: "ip", lastHandshake: null, receivedBytes: 0, sentBytes: 0 }] }));
});

test("operation identity and unresolved outcomes prevent blind mutation retries", () => {
  for (const status of ["pending", "uncertain"] as const) assert.equal(operationIsUnresolved({ operationId, status, message: "" }), true);
  for (const status of ["completed", "failed"] as const) assert.equal(operationIsUnresolved({ operationId, status, message: "" }), false);
  assert.equal(operationIsUnresolved(null), false);
  assert.equal(isOperationId(operationId), true);
  assert.equal(isOperationId("not-an-id"), false);
  assert.equal(isOperationId(null), false);
  assert.throws(() => parseOperation({ operationId: "another-id", status: "completed", message: "" }, operationId));
  assert.throws(() => parseOperation({ operationId, status: "ok", message: "" }, operationId));
  assert.deepEqual(operationWithoutSecret({ operationId, status: "completed", message: "Created", configuration: "private-key" }), { operationId, status: "completed", message: "Created" });
});

test("byte counts, unknown allocations, uptime and handshake timestamps are honest", () => {
  assert.equal(formatBytes(undefined), "Unknown");
  assert.equal(formatBytes(-1), "Unknown");
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(1024), "1 KiB");
  assert.match(formatBytes(0.5), / B$/);
  assert.equal(formatUptime(90061), "1d 1h 1m");
  assert.equal(formatTimestamp(0), "Never reported");
  assert.equal(formatTimestamp("invalid-date"), "Unknown");
  assert.equal(formatTimestamp(1000), new Date(1_000_000).toLocaleString());
});

test("peer names match the server's allowed characters and length", () => {
  for (const name of ["Personal phone", "Телефон", "phone_1.local", " laptop-2 "]) assert.equal(validPeerName(name), true);
  for (const name of ["", "   ", "x".repeat(65), "phone;command", "<phone>"]) assert.equal(validPeerName(name), false);
});

test("only the acknowledged shutdown's VM can be deliberately force-stopped", () => {
  const id = "a01754d0-5fde-4070-a9f1-137b212f12dd";
  const operation = parseOperation({ operationId, status: "pending", message: "Shutdown requested", forceStopVM: id }, operationId);
  assert.equal(canForceStop(operation, id), true);
  assert.equal(canForceStop(operation, "another-vm"), false);
  assert.equal(canForceStop({ ...operation, status: "uncertain" }, id), false);
  assert.equal(canForceStop({ operationId, status: "pending", message: "Starting" }, id), false);
  assert.equal(operationWithoutSecret(operation).forceStopVM, id);
  assert.throws(() => parseOperation({ ...operation, status: "uncertain" }, operationId));
});
