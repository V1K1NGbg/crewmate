import assert from "node:assert/strict";
import test from "node:test";
import { isLocalOwner, isSameOriginMutation, privateServiceOrigin, readBoundedJson, validateHomeMutation } from "./homeAccess.ts";

const operationId = "6cd76117-6743-4c2b-b999-c7b36a1918fd";
const id = "a01754d0-5fde-4070-a9f1-137b212f12dd";
test("owner authentication fails closed and cannot reuse a Google identity", () => {
  assert.equal(isLocalOwner("local", "owner", "owner"), true);
  for (const [provider, subject, owner] of [["google", "owner", "owner"], ["local", "other", "owner"], ["local", "", undefined], ["local", undefined, "owner"]] as const) assert.equal(isLocalOwner(provider, subject, owner), false);
});
test("only exact configured HTTPS origins can be embedded", () => {
  assert.equal(privateServiceOrigin(undefined), null);
  assert.equal(privateServiceOrigin("https://photos.example.test/"), "https://photos.example.test");
  for (const value of ["http://photos.test", "https://user:password@photos.test", "https://photos.test/path", "https://photos.test/?token=x", "javascript:alert(1)"]) assert.throws(() => privateServiceOrigin(value));
});
test("CSRF checks use the configured origin, not a forged Host header", () => {
  const request = (origin?: string, contentType = "application/json") => new Request("https://forged.test/api/home/vms", { method: "POST", headers: { ...(origin ? { Origin: origin } : {}), "Content-Type": contentType, Host: "forged.test" } });
  assert.equal(isSameOriginMutation(request("https://crew.test"), "https://crew.test"), true);
  for (const origin of [undefined, "null", "https://forged.test", "https://crew.test.attacker.test"]) assert.equal(isSameOriginMutation(request(origin), "https://crew.test"), false);
  assert.equal(isSameOriginMutation(request("https://crew.test", "text/plain"), "https://crew.test"), false);
  assert.equal(isSameOriginMutation(request("https://crew.test"), undefined), false);
});
test("management actions preserve stable identifiers and reject unconfirmed destructive operations", () => {
  assert.deepEqual(validateHomeMutation("vms", { operationId, id, action: "start", command: "rm" }), { operationId, id, action: "start", confirm: false });
  assert.throws(() => validateHomeMutation("vms", { operationId, id, action: "destroy" }));
  assert.throws(() => validateHomeMutation("vms", { operationId, id: "--help", action: "start" }));
  assert.throws(() => validateHomeMutation("vms", { operationId, id, action: "delete" }));
  assert.throws(() => validateHomeMutation("vpn", { operationId, action: "add", name: "new\n[Peer]" }));
  assert.throws(() => validateHomeMutation("vpn", { operationId, action: "revoke", publicKey: "A".repeat(43) + "=" }));
  assert.throws(() => validateHomeMutation("vms", { operationId: "bad", id, action: "start" }));
  assert.equal(validateHomeMutation("vpn", { operationId, action: "add", name: " Phone " }).name, "Phone");
});
test("JSON body limits apply to streamed bytes, regardless of Content-Length", async () => {
  const request = (body: string) => new Request("http://test", { method: "POST", body });
  assert.deepEqual(await readBoundedJson(request('{"ok":true}')), { ok: true });
  await assert.rejects(readBoundedJson(request('"' + "a".repeat(100) + '"'), 10), /too large/);
  await assert.rejects(readBoundedJson(request("{")));
});
