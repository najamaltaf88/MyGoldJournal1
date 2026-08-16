import { ENV } from "./_core/env";
import { goldRouter } from "./goldRouter";
import { publicProcedure, router } from "./_core/trpc";
import { systemRouter } from "./_core/systemRouter";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    status: publicProcedure.query(() => ({ available: Boolean(ENV.supabaseUrl && ENV.supabaseServiceRoleKey) })),
    logout: publicProcedure.mutation(() => ({ success: true as const })),
  }),
  ...goldRouter._def.record,
});

export type AppRouter = typeof appRouter;
