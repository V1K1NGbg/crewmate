import assert from "node:assert/strict";
import test from "node:test";
import {
  decryptEnvironmentFile,
  encryptEnvironmentFile,
  generateEnvironmentPassword,
  validateEnvironmentCredentials,
} from "./environmentVault.ts";

test("encrypts and decrypts an environment file with password and PIN", async () => {
  const encrypted = await encryptEnvironmentFile(
    "API_TOKEN=secret\n",
    "correct horse",
    "1234",
  );
  assert.notEqual(encrypted.ciphertext, "API_TOKEN=secret\n");
  assert.equal(
    await decryptEnvironmentFile(encrypted, "correct horse", "1234"),
    "API_TOKEN=secret\n",
  );
  await assert.rejects(
    decryptEnvironmentFile(encrypted, "correct horse", "9999"),
    /incorrect/,
  );
});

test("generates a high-entropy URL-safe environment password", () => {
  const first = generateEnvironmentPassword();
  const second = generateEnvironmentPassword();
  assert.match(first, /^[A-Za-z0-9_-]{32}$/);
  assert.notEqual(first, second);
});

test("requires a strong-enough password and exactly four PIN digits", () => {
  assert.throws(() => validateEnvironmentCredentials("short", "1234"), /8 characters/);
  assert.throws(() => validateEnvironmentCredentials("long enough", "12ab"), /4 digit/);
});
