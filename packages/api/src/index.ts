import "dotenv/config";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { healthRoutes } from "./routes/health.js";
import { marketRoutes } from "./routes/markets.js";
import { tradeRoutes } from "./routes/trades.js";
import { priceRoutes } from "./routes/prices.js";
import { fundingRoutes } from "./routes/funding.js";
import { crankStatusRoutes } from "./routes/crank.js";
import { oracleRouterRoutes } from "./routes/oracle-router.js";
import { setupWebSocket } from "./routes/ws.js";
import { readRateLimit, writeRateLimit } from "./middleware/rate-limit.js";

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

app.get("/", (c) => c.json({ name: "@percolator/api", version: "0.1.0" }));

const port = Number(process.env.API_PORT ?? 3001);
const server = serve({ fetch: app.fetch, port }, (info) => {
  console.log(`🚀 Percolator API running on http://localhost:${info.port}`);
});

setupWebSocket(server as unknown as import("node:http").Server);

process.on("SIGTERM", () => { process.exit(0); });
process.on("SIGINT", () => { process.exit(0); });

export { app };
