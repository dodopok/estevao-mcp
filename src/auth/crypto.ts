import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

const IV_BYTES = 12;
const KEY_BYTES = 32;
const CIPHER = "aes-256-gcm";
const VERSION = "v1";

/** Opaque token, URL-safe. The prefix makes leaked tokens greppable/identifiable. */
export function randomToken(prefix: string): string {
  return `${prefix}_${randomBytes(32).toString("base64url")}`;
}

export function randomId(): string {
  return randomBytes(16).toString("hex");
}

/** Tokens are never stored in the clear — only this digest is. */
export function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/**
 * Accepts the encryption key as 64 hex chars or base64/base64url of 32 bytes.
 * Generate one with: openssl rand -hex 32
 */
export function parseEncryptionKey(raw: string): Buffer {
  const trimmed = raw.trim();
  const key = /^[0-9a-fA-F]{64}$/.test(trimmed)
    ? Buffer.from(trimmed, "hex")
    : Buffer.from(trimmed, "base64");
  if (key.length !== KEY_BYTES) {
    throw new Error(
      "MCP_ENCRYPTION_KEY must decode to 32 bytes (e.g. `openssl rand -hex 32`).",
    );
  }
  return key;
}

/** AES-256-GCM. Output: v1.<iv>.<authTag>.<ciphertext>, all base64url. */
export function encryptSecret(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(CIPHER, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [
    VERSION,
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptSecret(payload: string, key: Buffer): string {
  const [version, iv, tag, ciphertext] = payload.split(".");
  if (version !== VERSION || !iv || !tag || !ciphertext) {
    throw new Error("Malformed encrypted secret.");
  }
  const decipher = createDecipheriv(CIPHER, key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
