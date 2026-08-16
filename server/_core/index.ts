import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../routers";
import { registerMt5Ingest } from "../mt5Ingest";
import { getActiveMt5Connection, recordMt5HistoryFailure } from "../mt5Db";
import { createContext } from "./context";
import { assertProductionConfiguration, ENV } from "./env";
import { serveStatic, setupVite } from "./vite";
import { storageGetSignedUrl } from "../storage";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

export async function createApp(options: { serveFrontend?: boolean } = {}) {
  const { serveFrontend = true } = options;
  assertProductionConfiguration();
  const app = express();
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    if (ENV.isProduction) res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    next();
  });
  // Keep JSON requests bounded; MT5 history batches are separately limited to 50 positions.
  app.use(express.json({ limit: "2mb", strict: true }));
  app.use(express.urlencoded({ limit: "256kb", extended: true, parameterLimit: 100 }));
  registerMt5Ingest(app);
  app.get("/api/mt5/ea", async (_req, res) => {
    try {
      res.redirect(302, await storageGetSignedUrl(ENV.supabaseEaAssetKey));
    } catch {
      res.status(404).json({ ok: false, message: "MT5 EA asset is not available." });
    }
  });
  app.use(async (error: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.path === "/api/mt5" && error instanceof SyntaxError && "body" in error) {
      const detail = error.message || "Malformed JSON request body.";
      console.warn("[MT5] malformed JSON payload", detail);
      const raw = typeof (error as { body?: unknown }).body === "string" ? (error as { body: string }).body : "";
      const apiKey = raw.match(/"api_key"\s*:\s*"([^"\\]{24,96})"/)?.[1];
      if (apiKey) {
        try {
          const connection = await getActiveMt5Connection(apiKey);
          if (connection) await recordMt5HistoryFailure(connection.id, `Malformed JSON — ${detail}`);
        } catch {
          // Preserve an actionable parser response even if diagnostics cannot persist.
        }
      }
      res.status(400).json({ ok: false, code: "INVALID_JSON", details: [detail] });
      return;
    }
    next(error);
  });
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  if (serveFrontend) {
    if (process.env.NODE_ENV === "development") {
      const server = createServer(app);
      await setupVite(app, server);
    } else {
      serveStatic(app);
    }
  }
  return app;
}

export async function startServer() {
  const app = await createApp({ serveFrontend: false });
  const server = createServer(app);
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }
  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

if (process.env.NETLIFY !== "true") {
  startServer().catch(console.error);
}
