const required = (name: string, value: string) => {
  if (!value && process.env.NODE_ENV === "production") throw new Error(`${name} is required in production.`);
  return value;
};

const asBoolean = (value: string | undefined, fallback: boolean) => {
  if (value === undefined) return fallback;
  return value === "1" || value.toLowerCase() === "true";
};

export const ENV = {
  databaseUrl: required("DATABASE_URL", process.env.DATABASE_URL ?? ""),
  databaseSsl: asBoolean(process.env.DATABASE_SSL, /supabase\.(co|com)/i.test(process.env.DATABASE_URL ?? "")),
  supabaseUrl: required("SUPABASE_URL", process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ""),
  supabaseServiceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""),
  mt5EncryptionKey: required("MT5_ENCRYPTION_KEY", process.env.MT5_ENCRYPTION_KEY ?? ""),
  supabaseStorageBucket: process.env.SUPABASE_STORAGE_BUCKET ?? "journal-assets",
  supabaseEaAssetKey: process.env.SUPABASE_EA_ASSET_KEY ?? "mt5/GoldJournal_EA.mq5",
  isProduction: process.env.NODE_ENV === "production",
};

export function assertProductionConfiguration() {
  if (!ENV.isProduction) return;
  if (ENV.supabaseServiceRoleKey.length < 32) throw new Error("SUPABASE_SERVICE_ROLE_KEY is invalid in production.");
  if (ENV.mt5EncryptionKey.length < 32) throw new Error("MT5_ENCRYPTION_KEY must be at least 32 characters in production.");
  if (!/^postgres(?:ql)?:\/\//i.test(ENV.databaseUrl)) {
    throw new Error("DATABASE_URL must be a PostgreSQL/Supabase connection string in production.");
  }
  if (!/^https:\/\//i.test(ENV.supabaseUrl)) {
    throw new Error("SUPABASE_URL must be an HTTPS Supabase project URL in production.");
  }
}
