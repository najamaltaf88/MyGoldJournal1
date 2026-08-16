import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "./_core/supabase";
import { ENV } from "./_core/env";

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

function appendHashSuffix(relKey: string): string {
  const hash = randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

async function signedUrl(key: string) {
  const { data, error } = await supabaseAdmin.storage
    .from(ENV.supabaseStorageBucket)
    .createSignedUrl(key, 60 * 60);
  if (error || !data?.signedUrl) throw new Error(`Supabase Storage signed URL failed: ${error?.message ?? "empty URL"}`);
  return data.signedUrl;
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  const key = appendHashSuffix(normalizeKey(relKey));
  const { error } = await supabaseAdmin.storage.from(ENV.supabaseStorageBucket).upload(key, data, {
    contentType,
    cacheControl: "3600",
    upsert: false,
  });
  if (error) throw new Error(`Supabase Storage upload failed: ${error.message}`);
  return { key, url: await signedUrl(key) };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  return { key, url: await signedUrl(key) };
}

export async function storageGetSignedUrl(relKey: string): Promise<string> {
  return signedUrl(normalizeKey(relKey));
}
