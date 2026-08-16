import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { InsertUser, users } from "../drizzle/schema";
import { ENV } from './_core/env';
import * as schema from "../drizzle/schema";

export type AppDb = ReturnType<typeof drizzle<typeof schema>>;

let _pool: Pool | null = null;
let _db: AppDb | null = null;

function createPool() {
  if (!ENV.databaseUrl) return null;
  return new Pool({
    connectionString: ENV.databaseUrl,
    max: Number(process.env.DATABASE_POOL_MAX ?? (ENV.isProduction ? 5 : 3)),
    idleTimeoutMillis: Number(process.env.DATABASE_IDLE_TIMEOUT_MS ?? 30_000),
    connectionTimeoutMillis: Number(process.env.DATABASE_CONNECTION_TIMEOUT_MS ?? 10_000),
    maxUses: Number(process.env.DATABASE_MAX_USES ?? 7_500),
    ssl: ENV.databaseSsl ? { rejectUnauthorized: false } : undefined,
  });
}

// Lazily create the Drizzle instance so local tooling can run without a DB.
export async function getDb(): Promise<AppDb | null> {
  if (!_db && ENV.databaseUrl) {
    try {
      _pool = createPool();
      if (!_pool) return null;
      _db = drizzle(_pool, { schema });
    } catch (error) {
      console.warn("[Database] Failed to initialize PostgreSQL:", error instanceof Error ? error.message : "unknown error");
      _db = null;
      _pool = null;
    }
  }
  return _db;
}

export async function closeDbForTests() {
  if (_pool) await _pool.end();
  _pool = null;
  _db = null;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};
    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    }
    if (!values.lastSignedIn) values.lastSignedIn = new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

    await db.insert(users).values(values).onConflictDoUpdate({
      target: users.openId,
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error instanceof Error ? error.message : "unknown error");
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}
