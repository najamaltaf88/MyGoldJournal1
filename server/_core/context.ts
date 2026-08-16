import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { authenticateSupabaseRequest } from "./supabase";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions,
): Promise<TrpcContext> {
  let user: User | null = null;
  try {
    user = await authenticateSupabaseRequest(opts.req);
  } catch (error) {
    console.warn("[Supabase Auth] Request verification failed:", error instanceof Error ? error.message : "unknown error");
  }
  return { req: opts.req, res: opts.res, user };
}
