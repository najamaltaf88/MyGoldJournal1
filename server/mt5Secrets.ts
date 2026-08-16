import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { ENV } from "./_core/env";

const PREFIX = "v1";
const ALGORITHM = "aes-256-gcm";

function keyBytes() {
  const secret = ENV.mt5EncryptionKey || (!ENV.isProduction ? "local-development-only-mt5-key" : "");
  if (!secret) throw new Error("MT5_ENCRYPTION_KEY is required to create or resolve MT5 connections.");
  return createHash("sha256").update(secret, "utf8").digest();
}

export function hasMt5EncryptionKey() {
  return Boolean(ENV.mt5EncryptionKey);
}

export function encryptMt5ApiKey(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, keyBytes(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}:${iv.toString("base64url")}:${tag.toString("base64url")}:${ciphertext.toString("base64url")}`;
}

export function decryptMt5ApiKey(value: string) {
  if (!value.startsWith(`${PREFIX}:`)) return value;
  const [, ivText, tagText, ciphertextText] = value.split(":");
  if (!ivText || !tagText || !ciphertextText) throw new Error("Invalid encrypted MT5 API key format.");
  try {
    const decipher = createDecipheriv(ALGORITHM, keyBytes(), Buffer.from(ivText, "base64url"));
    decipher.setAuthTag(Buffer.from(tagText, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(ciphertextText, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("MT5 API key could not be decrypted.");
  }
}

export function hashMt5ApiKey(value: string) {
  return createHmac("sha256", keyBytes()).update(value, "utf8").digest("hex");
}

export function maskMt5ApiKey(value: string) {
  if (value.length < 10) return "••••••••";
  return `${value.slice(0, 4)}••••••••${value.slice(-3)}`;
}

export function safeApiKeyEquals(left: string, right: string) {
  const leftBytes = Buffer.from(left, "utf8");
  const rightBytes = Buffer.from(right, "utf8");
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}
