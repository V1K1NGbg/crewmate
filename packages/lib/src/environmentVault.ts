import type { EncryptedEnvironmentFile } from "@crewmate/types";

const ITERATIONS = 250_000;

export function generateEnvironmentPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return bytesToBase64(bytes)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function deriveKey(
  password: string,
  pin: string,
  salt: Uint8Array,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(`${password}\u0000${pin}`),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations: ITERATIONS },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export function validateEnvironmentCredentials(password: string, pin: string): void {
  if (password.length < 8) throw new Error("Use a password of at least 8 characters.");
  if (!/^\d{4}$/.test(pin)) throw new Error("Enter a 4 digit PIN.");
}

export async function encryptEnvironmentFile(
  plaintext: string,
  password: string,
  pin: string,
): Promise<EncryptedEnvironmentFile> {
  validateEnvironmentCredentials(password, pin);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, pin, salt);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    new TextEncoder().encode(plaintext),
  );
  return {
    version: 1,
    algorithm: "AES-GCM",
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(encrypted)),
    updatedAt: new Date().toISOString(),
  };
}

export async function decryptEnvironmentFile(
  file: EncryptedEnvironmentFile,
  password: string,
  pin: string,
): Promise<string> {
  validateEnvironmentCredentials(password, pin);
  try {
    const key = await deriveKey(password, pin, base64ToBytes(file.salt));
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64ToBytes(file.iv) as BufferSource },
      key,
      base64ToBytes(file.ciphertext) as BufferSource,
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    throw new Error("The password or PIN is incorrect, or the encrypted file is damaged.");
  }
}
