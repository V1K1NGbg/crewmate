import assert from "node:assert/strict";
import test from "node:test";
import { readOperation, submitOperation } from "./data.ts";

const operationId = "12345678-1234-4123-8123-123456789abc";
const mutation = { operationId, id: "stable-vm-id", action: "destroy" as const, confirm: true };

test("a confirmed mutation is sent once with its stable identifier", async () => {
  let count = 0;
  const fetchMock: typeof fetch = async (input, init) => {
    count++;
    assert.equal(input, "/api/home/vms");
    assert.equal(init?.method, "POST");
    assert.deepEqual(JSON.parse(String(init?.body)), mutation);
    return Response.json({ operationId, status: "pending", message: "Accepted" });
  };
  const result = await submitOperation("/api/home/vms", mutation, new AbortController().signal, fetchMock);
  assert.equal(result.status, "pending");
  assert.equal(count, 1);
});

test("lost, non-OK and invalid responses are uncertain, never automatically retried", async () => {
  for (const failure of ["network", "http", "identity", "json"]) {
    let count = 0;
    const fetchMock: typeof fetch = async () => {
      count++;
      if (failure === "network") throw new Error("Connection lost");
      if (failure === "http") return Response.json({ error: "Upstream timeout" }, { status: 504 });
      if (failure === "json") return new Response("not-json");
      return Response.json({ operationId: "wrong-id", status: "completed", message: "Wrong operation" });
    };
    const result = await submitOperation("/api/home/vms", mutation, new AbortController().signal, fetchMock);
    assert.equal(result.status, "uncertain");
    assert.equal(result.operationId, operationId);
    assert.equal(count, 1);
  }
});

test("refresh queries only the ledger and drops any configuration from history", async () => {
  const fetchMock: typeof fetch = async (input, init) => {
    assert.equal(input, `/api/home/operations?id=${operationId}`);
    assert.notEqual(init?.method, "POST");
    assert.equal(init?.cache, "no-store");
    return Response.json({ operationId, status: "completed", message: "Peer created", configuration: "must-not-survive-history" });
  };
  assert.deepEqual(await readOperation(operationId, new AbortController().signal, fetchMock), { operationId, status: "completed", message: "Peer created" });
});

test("missing ledger entries remain uncertain instead of allowing a destructive reattempt", async () => {
  const result = await readOperation(operationId, new AbortController().signal, async () => Response.json({ error: "Not found" }, { status: 404 }));
  assert.equal(result.status, "uncertain");
  assert.equal(result.operationId, operationId);
});

test("new peer configuration is returned only with the original mutation response", async () => {
  const result = await submitOperation("/api/home/vpn", { operationId, action: "add", name: "phone" }, new AbortController().signal,
    async () => Response.json({ operationId, status: "completed", message: "Peer created", configuration: "one-time-secret" }));
  assert.equal(result.configuration, "one-time-secret");
});

test("explicit validation and authorization rejection is a failure, not an unknown write", async () => {
  for (const status of [400, 401, 403, 409]) {
    let calls = 0;
    const result = await submitOperation("/api/home/vms", mutation, new AbortController().signal, async () => {
      calls++;
      return Response.json({ error: "Rejected before mutation" }, { status });
    });
    assert.equal(result.status, "failed");
    assert.equal(result.message, "Rejected before mutation");
    assert.equal(calls, 1);
  }
});
