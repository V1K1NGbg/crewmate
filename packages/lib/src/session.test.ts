import assert from "node:assert/strict";
import test from "node:test";
import { browserAuthResponse, sanitizeBrowserSession } from "./session.ts";

test("omits provider credentials from browser session serialization", () => {
  assert.deepEqual(
    sanitizeBrowserSession({ accessToken: "secret", refreshToken: "refresh", accountKey: "opaque", googleAuthStatus: "ready" }),
    { accountKey: "opaque", googleAuthStatus: "ready" },
  );
});

test("GET and POST session responses hide credentials, preserve cookies and retain null sessions", async () => {
  for (const method of ["GET", "POST"]) {
    for (const session of [null, { accessToken: "secret", refreshToken: "refresh", accountKey: "opaque" }]) {
      const response = Response.json(session, { headers: { "Cache-Control": "no-store", "Content-Length": "123" } });
      response.headers.append("Set-Cookie", "authjs.session-token=renewed; HttpOnly");
      response.headers.append("Set-Cookie", "authjs.csrf-token=csrf; HttpOnly");
      const sanitized = await browserAuthResponse(new Request("https://app.test/api/auth/session", { method }), response);
      assert.deepEqual(await sanitized.json(), session === null ? null : { accountKey: "opaque" });
      assert.deepEqual(sanitized.headers.getSetCookie(), response.headers.getSetCookie());
      assert.equal(sanitized.headers.get("cache-control"), "no-store");
      assert.equal(sanitized.headers.get("content-length"), null);
    }
  }
});

const signout = new Request("https://app.test/api/auth/signout", { method: "POST" });
const identity = "https://identity.test";
const clearedCookie = "__Secure-authjs.session-token.0=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax";

test("successful Auth.js signout coordinates identity logout for JSON and redirect clients", async () => {
  for (const status of [200, 302]) {
    const headers = new Headers({ Location: "https://app.test/", "Content-Length": "99" });
    headers.append("Set-Cookie", clearedCookie);
    headers.append("Set-Cookie", clearedCookie.replace(".0=", ".1="));
    const response = status === 200 ? Response.json({ url: "https://app.test/" }, { headers }) : new Response(null, { status, headers });
    const result = await browserAuthResponse(signout, response, identity);
    assert.equal(result.status, status);
    assert.equal(result.headers.get("location"), `${identity}/logout`);
    assert.deepEqual(result.headers.getSetCookie(), headers.getSetCookie());
    assert.equal(result.headers.get("content-length"), null);
    if (status === 200) assert.deepEqual(await result.json(), { url: `${identity}/logout` });
  }
});

test("failed or unconfirmed signouts retain Auth.js errors and CSRF behavior", async () => {
  for (const response of [
    Response.json({ url: "https://app.test/api/auth/signout?error=MissingCSRF" }),
    new Response(null, { status: 302, headers: { Location: "https://app.test/api/auth/signout?error=MissingCSRF" } }),
    Response.json({ error: "failure" }, { status: 400, headers: { "Set-Cookie": clearedCookie } }),
    Response.json({ url: "https://app.test/" }, { headers: { "Set-Cookie": "authjs.csrf-token=; Max-Age=0" } }),
    Response.json({ url: "https://app.test/" }, { headers: { "Set-Cookie": "authjs.session-token=active; Max-Age=3600" } }),
  ]) {
    assert.equal(await browserAuthResponse(signout, response, identity), response);
  }
});

test("GET signout, legacy logout, unrelated routes and failed session updates are unchanged", async () => {
  const response = Response.json({ url: "https://app.test/" }, { headers: { "Set-Cookie": clearedCookie } });
  assert.equal(await browserAuthResponse(new Request(signout.url), response, identity), response);
  assert.equal(await browserAuthResponse(signout, response), response);
  assert.equal(await browserAuthResponse(new Request("https://app.test/api/auth/callback/local", { method: "POST" }), response, identity), response);
  const error = Response.json(null, { status: 400 });
  assert.equal(await browserAuthResponse(new Request("https://app.test/api/auth/session", { method: "POST" }), error, identity), error);
});

test("bad identity logout configuration reports failure without dropping cookie deletion", async () => {
  for (const origin of ["", "http://identity.test", "https://identity.test/unsafe/path"]) {
    const response = Response.json({ url: "https://app.test/" }, { headers: { "Set-Cookie": clearedCookie } });
    const result = await browserAuthResponse(signout, response, origin);
    assert.equal(result.status, 503);
    assert.equal(result.headers.get("location"), null);
    assert.deepEqual(result.headers.getSetCookie(), [clearedCookie]);
    assert.deepEqual(await result.json(), { error: "Identity logout address is not configured" });
  }
});
