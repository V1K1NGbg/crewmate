import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { requestHost } from "./hostClient.ts";

test("host transport uses the local socket and preserves errors and operation identifiers", async () => {
  const directory = await mkdtemp(join(tmpdir(), "crewmate-host-"));
  const socket = join(directory, "manager.sock");
  const server = createServer(async (request, response) => {
    assert.equal(request.method, "POST");
    assert.equal(request.url, "/vms");
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    response.writeHead(409, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ operationId: body.operationId, status: "uncertain" }));
  });
  try {
    await new Promise<void>((resolve) => server.listen(socket, resolve));
    assert.deepEqual(await requestHost(socket, "/vms", { operationId: "test-id" }), { status: 409, body: { operationId: "test-id", status: "uncertain" } });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await rm(directory, { recursive: true });
  }
});

test("host transport rejects missing sockets without silently retrying", async () => {
  assert.throws(() => requestHost("relative.sock", "/overview"), /absolute/);
  await assert.rejects(requestHost("/does-not-exist/crewmate.sock", "/overview"));
});
