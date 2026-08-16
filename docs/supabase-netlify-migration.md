# Supabase-Only PostgreSQL, Auth, Storage, and Netlify Runbook

## Scope and outcome

MyGoldJournal1 now uses Supabase as its only external application platform: **Supabase PostgreSQL** for the database, **Supabase Auth** for email/password sessions, and **Supabase Storage** for journal screenshots and the MT5 Expert Advisor asset. Manus OAuth, Manus Forge/S3 storage, Manus runtime modules, Manus environment variables, and the old session-cookie flow have been removed from the live application.

The application remains a React 19 + Vite frontend with an Express/tRPC API, Drizzle ORM, PostgreSQL `pg` driver, MT5 ingest integration, account isolation, and the existing PKT UTC+5 behavior. The legacy MySQL driver remains only as a development dependency for the one-time export utility; it is not part of the deployed runtime.

> **Important:** Supabase `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `VITE_SUPABASE_ANON_KEY` do not replace the PostgreSQL connection string used by Drizzle. The deployed server also requires `DATABASE_URL` for direct PostgreSQL queries and `MT5_ENCRYPTION_KEY` for encrypted MT5 API keys.

## Target architecture

| Layer | Production implementation | Important constraint |
|---|---|---|
| Frontend | Vite build published from `dist/public` on Netlify | Only the Supabase URL and anon/publishable key may be exposed through `VITE_*`. |
| Authentication | Supabase Auth email/password sessions in the browser | The browser sends the Supabase access token as `Authorization: Bearer ...`; no Manus cookie is used. |
| API | Existing Express middleware and routes wrapped by `netlify/functions/api.ts` | `/api/*` is rewritten to the function before the SPA fallback. |
| RPC | Existing tRPC procedures under `/api/trpc` | The server verifies the Supabase bearer token and upserts the identity into the local `users` table. |
| MT5 ingest | Existing `/api/mt5` flow with authentication, validation, ordering, idempotency, and atomic writes | The established PKT UTC+5 interpretation is unchanged. |
| Database | Supabase PostgreSQL through Drizzle and `pg` | Use transaction pooler port `6543` for Netlify Functions and session pooler port `5432` for migrations/imports. |
| Storage | Private Supabase Storage bucket | Screenshots and the EA are served through server-generated signed URLs. |
| Security boundary | All database and private-storage access remains server-side | Never expose `DATABASE_URL`, service-role key, or MT5 encryption key through `VITE_*`. RLS is not required because all access is through Express. |

## Supabase setup

Create a Supabase project and enable **Authentication → Email**. Decide whether email confirmation is required. If confirmation is enabled, configure the Supabase Site URL and redirect URLs to include the Netlify domain; otherwise new users can sign in immediately after registration.

Create a private Storage bucket named `journal-assets`, or choose another private bucket name and set `SUPABASE_STORAGE_BUCKET` accordingly. Upload the MT5 EA file to the object key configured in `SUPABASE_EA_ASSET_KEY`, whose default is `mt5/GoldJournal_EA.mq5`. The application’s **Download EA v1.13** link calls `/api/mt5/ea`; the server returns a one-hour signed Supabase Storage URL.

Apply the generated schema migration from `drizzle/migrations/0000_high_zaran.sql` in Supabase SQL Editor, or use `pnpm db:migrate` with the session pooler connection. Apply it only once to a fresh/empty project. Do not paste `drizzle/schema.ts` into SQL Editor; the migration SQL is the executable schema.

## Legacy data migration

The PostgreSQL schema preserves the twelve existing tables and names while converting MySQL constructs to PostgreSQL equivalents: `pgTable`, `pgEnum`, `serial`, `integer`, `jsonb`, and timezone-aware timestamps. MySQL duplicate-key operations use PostgreSQL `onConflictDoUpdate` targets, and insert mutations use PostgreSQL `returning` clauses.

The migration utilities are non-destructive. `scripts/export-mysql-data.ts` reads the legacy database without changing it and writes row counts plus safe serialization for bigint, date, buffer, and JSON values. `scripts/import-postgres-data.ts` imports in dependency-safe table order inside a transaction, uses `ON CONFLICT DO NOTHING` for safe reruns, and repairs serial sequences. `scripts/verify-supabase-migration.ts` compares row counts and checks MT5/account-isolation invariants.

Use the session pooler for migration operations:

```bash
pnpm install

MYSQL_DATABASE_URL='mysql://USER:PASSWORD@HOST:3306/DATABASE' \
pnpm db:export:mysql ./migration/mysql-export.json

DATABASE_URL='postgresql://postgres.PROJECT_REF:PASSWORD@SESSION_POOLER_HOST:5432/postgres?sslmode=require' \
pnpm db:import:postgres ./migration/mysql-export.json

DATABASE_URL='postgresql://postgres.PROJECT_REF:PASSWORD@SESSION_POOLER_HOST:5432/postgres?sslmode=require' \
pnpm db:verify ./migration/mysql-export.json
```

The verifier must report matching row counts and zero failures for duplicate MT5 live account/ticket values, duplicate MT5 journal account/ticket values, orphan MT5 records, and cross-user MT5 connections. If verification fails, do not cut over the application.

## Netlify environment variables

In Netlify, open **Site configuration → Environment variables → Add a variable**. Add the following values to the Production scope. Add them to Deploy Preview scope only if preview deployments should connect to a separate test Supabase project.

| Variable | Value and purpose | Exposure rule |
|---|---|---|
| `SUPABASE_URL` | `https://<project-ref>.supabase.co` | Server-only copy; do not expose this name to browser code unless also set as `VITE_SUPABASE_URL`. |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role key | **Server-only. Never use `VITE_`.** |
| `VITE_SUPABASE_URL` | Same Supabase project URL | Browser-safe. |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/publishable key | Browser-safe; this key is expected in the frontend bundle. |
| `DATABASE_URL` | Supabase transaction pooler URL on port `6543` with `?sslmode=require` | Server-only. |
| `MT5_ENCRYPTION_KEY` | Existing 32+ character encryption key | Server-only. Preserve the old value when migrating existing MT5 connections. |
| `SUPABASE_STORAGE_BUCKET` | `journal-assets` or the selected private bucket | Server-side configuration. |
| `SUPABASE_EA_ASSET_KEY` | `mt5/GoldJournal_EA.mq5` or the uploaded EA object key | Server-side configuration. |
| `VITE_ANALYTICS_ENDPOINT` | Optional analytics endpoint | Leave blank to disable. |
| `VITE_ANALYTICS_WEBSITE_ID` | Optional analytics site ID | Leave blank to disable. |

Do not add these legacy variables to Netlify: `MYSQL_DATABASE_URL`, `MYSQL_EXPORT_FILE`, `JWT_SECRET`, `VITE_APP_ID`, `OAUTH_SERVER_URL`, `VITE_OAUTH_PORTAL_URL`, `OWNER_OPEN_ID`, `OWNER_NAME`, `BUILT_IN_FORGE_API_URL`, `BUILT_IN_FORGE_API_KEY`, `VITE_FRONTEND_FORGE_API_URL`, or `VITE_FRONTEND_FORGE_API_KEY`.

## Netlify deployment

The committed `netlify.toml` defines the required settings:

| Setting | Value |
|---|---|
| Build command | `pnpm build` |
| Publish directory | `dist/public` |
| Functions directory | `netlify/functions` |
| Function bundler | esbuild |
| API rewrite | `/api/*` → `/.netlify/functions/api/api/:splat` |
| SPA rewrite | `/*` → `/index.html` |

Connect the GitHub repository, select the `main` branch, add the environment variables, and deploy. After deployment, set the Supabase **Authentication → URL Configuration → Site URL** to the Netlify domain and add the Netlify domain to the allowed redirect URLs. Test registration, login, refresh, logout, screenshot upload, EA download, and MT5 OPEN/CLOSE events.

## Known Netlify limitation

The MT5 rate limiter remains an in-memory bounded map. Its state is bounded inside each warm function instance, and invalid keys cannot grow that instance’s limiter state without limit, but serverless instances do not share memory and state resets on cold starts. This is a documented limitation of the Netlify deployment mode. If cross-instance abuse protection is required, move the API to an always-on service or replace the limiter store with a shared Redis/Supabase-backed mechanism. Keep MT5 history batches within the existing limits so requests complete within the platform timeout.

## MT5 and timezone preservation

No broker timezone auto-detection, UTC conversion, DST conversion, or timezone redesign was introduced. The existing `Asia/Karachi`/UTC+5 session-classification contract and established interpretation of MT5 timestamps remain in place. PostgreSQL stores migrated instant fields as timezone-aware timestamps, while application session classification continues through the existing PKT logic.

The existing safeguards remain intact: account ownership is checked before access, API keys are encrypted and hashed, raw keys are not returned after setup, account/ticket conflict keys make repeated OPEN/CLOSE/history events idempotent, stale events cannot replace newer valid state, and MT5 state writes remain atomic.

## Rollback procedure

If production smoke tests fail, pause MT5 EA polling and prevent new writes while preserving the Supabase database for investigation. In Netlify, restore the previous successful deployment or deploy the last known-good commit. Do not point a pre-Supabase application build at PostgreSQL unless that build explicitly supports the PostgreSQL schema and Supabase Auth contract.

Do not delete or truncate Supabase data during an initial rollback. Preserve the export file, Supabase snapshot, and post-cutover audit window. Any writes accepted after cutover must be reconciled before another cutover. The import utility’s `ON CONFLICT DO NOTHING` behavior is safe for reruns but does not overwrite divergent destination rows.

After fixing the root cause, repeat schema verification, Supabase Auth login/refresh tests, private-storage signed-URL tests, and MT5 OPEN/CLOSE/idempotency smoke tests before deploying again.

## Validation completed in this repository

| Check | Result |
|---|---:|
| TypeScript check (`pnpm check`) | Passed |
| Vitest files | 36 passed |
| Vitest tests | 99 passed |
| Production build (`pnpm build`) | Passed |
| Netlify Function bundle | Passed |
| MySQL export utility bundle | Passed |
| PostgreSQL import utility bundle | Passed |
| Supabase verification utility bundle | Passed |
