import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createContext(user: TrpcContext["user"] = null): TrpcContext {
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("Supabase authentication contract", () => {
  it("reports Supabase Auth availability without exposing secrets", async () => {
    const caller = appRouter.createCaller(createContext());
    const status = await caller.auth.status();
    expect(status).toEqual({ available: expect.any(Boolean) });
    expect(status).not.toHaveProperty("serviceRoleKey");
  });

  it("returns the authenticated local user when the context contains one", async () => {
    const user: AuthenticatedUser = {
      id: 1,
      openId: "supabase-user-1",
      name: "Supabase Trader",
      email: "trader@example.com",
      loginMethod: "supabase",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    };
    const caller = appRouter.createCaller(createContext(user));
    await expect(caller.auth.me()).resolves.toEqual(user);
  });

  it("keeps logout stateless because Supabase clears the browser session", async () => {
    const caller = appRouter.createCaller(createContext());
    await expect(caller.auth.logout()).resolves.toEqual({ success: true });
  });
});
