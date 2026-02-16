import "dotenv/config";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { createLogger } from "@percolator/shared";
import { healthRoutes } from "./routes/health.js";
import { marketRoutes } from "./routes/markets.js";
import { tradeRoutes } from "./routes/trades.js";
import { priceRoutes } from "./routes/prices.js";
import { fundingRoutes } from "./routes/funding.js";
import { crankStatusRoutes } from "./routes/crank.js";
import { oracleRouterRoutes } from "./routes/oracle-router.js";
import { insuranceRoutes } from "./routes/insurance.js";
import { openInterestRoutes } from "./routes/open-interest.js";
import { statsRoutes } from "./routes/stats.js";
import { setupWebSocket } from "./routes/ws.js";
import { readRateLimit, writeRateLimit } from "./middleware/rate-limit.js";

const logger = createLogger("api");

const app = new Hono();

const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "https://percolatorlaunch.com,http://localhost:3000").split(",").map(s => s.trim()).filter(Boolean);
app.use("*", cors({
  origin: allowedOrigins,
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "x-api-key"],
}));

app.use("*", async (c, next) => {
  if (c.req.method === "GET" || c.req.method === "HEAD" || c.req.method === "OPTIONS") {
    return readRateLimit()(c, next);
  }
  return writeRateLimit()(c, next);
});

app.route("/", healthRoutes());
app.route("/", marketRoutes());
app.route("/", tradeRoutes());
app.route("/", priceRoutes());
app.route("/", fundingRoutes());
app.route("/", crankStatusRoutes());
app.route("/", oracleRouterRoutes());
app.route("/", insuranceRoutes());
app.route("/", openInterestRoutes());
app.route("/", statsRoutes());

app.get("/", (c) => c.json({ name: "@percolator/api", version: "0.1.0" }));

const port = Number(process.env.API_PORT ?? 3001);
const server = serve({ fetch: app.fetch, port }, (info) => {
  logger.info("Percolator API started", { port: info.port });
});

const wss = setupWebSocket(server as unknown as import("node:http").Server);

async function shutdown(signal: string): Promise<void> {
  logger.info("Shutdown initiated", { signal });
  
  try {
    // Close WebSocket server (stops accepting new connections)
    logger.info("Closing WebSocket server");
    await new Promise<void>((resolve, reject) => {
      wss.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    logger.info("WebSocket server closed");
    
    // Close HTTP server (stops accepting new requests)
    logger.info("Closing HTTP server");
    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    logger.info("HTTP server closed");
    
    // Note: Supabase client doesn't need explicit cleanup (connection pooling handled automatically)
    
    logger.info("Shutdown complete");
    process.exit(0);
  } catch (err) {
    logger.error("Error during shutdown", { error: err });
    process.exit(1);
  }
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

export { app };
