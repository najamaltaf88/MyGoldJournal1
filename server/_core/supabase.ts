import { createClient } from "@supabase/supabase-js";
import type { Request } from "express";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { ENV } from "./env";

const supabaseUrl = ENV.supabaseUrl || "http://127.0.0.1:54321";
const supabaseServiceRoleKey = ENV.supabaseServiceRoleKey || "local-development-service-role-key";

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
});

function getBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token || null;
}

function displayName(user: { user_metadata?: Record<string, unknown>; email?: string | null }) {
  const metadata = user.user_metadata ?? {};
  const candidate = metadata.full_name ?? metadata.name ?? metadata.user_name;
  if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  return user.email?.split("@")[0] ?? "Supabase user";
}

export async function authenticateSupabaseRequest(req: Request): Promise<User | null> {
  const token = getBearerToken(req);
  if (!token) return null;

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;

  await db.upsertUser({
    openId: data.user.id,
    name: displayName(data.user),
    email: data.user.email ?? null,
    loginMethod: "supabase",
    lastSignedIn: new Date(),
  });
  return (await db.getUserByOpenId(data.user.id)) ?? null;
}

export async function getSupabaseUserFromRequest(req: Request) {
  const token = getBearerToken(req);
  if (!token) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  return error ? null : data.user;
}
