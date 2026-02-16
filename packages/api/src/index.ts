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

// CORS Configuration
const allowedOrigins = process.env.CORS_ORIGINS 
  ? process.env.CORS_ORIGINS.split(",").map(s => s.trim()).filter(Boolean)
  : ["http://localhost:3000", "http://localhost:3001"];

// In production, CORS_ORIGINS must be explicitly set
if (process.env.NODE_ENV === "production" && !process.env.CORS_ORIGINS) {
  logger.error("CORS_ORIGINS environment variable is required in production");
  process.exit(1);
}

logger.info("CORS allowed origins", { origins: allowedOrigins });

app.use("*", cors({
  origin: (origin) => {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return null;
    
    // Check if origin is in allowed list
    if (allowedOrigins.includes(origin)) {
      return origin;
    }
    
    // Reject disallowed origins
    logger.warn("CORS rejected origin", { origin });
    return null;
  },
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "x-api-key"],
}));

// Security Headers Middleware
app.use("*", async (c, next) => {
  await next();
  
  // Set security headers
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("X-XSS-Protection", "1; mode=block");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  
  // Only add HSTS if using HTTPS
  const proto = c.req.header("x-forwarded-proto") || "http";
  if (proto === "https") {
    c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
});

// Rate Limiting Middleware
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

// Global error handler
app.onError((err, c) => {
  logger.error("Unhandled error", { 
    error: err.message, 
    stack: err.stack,
    endpoint: c.req.path,
    method: c.req.method
  });
  return c.json({ error: "Internal server error" }, 500);
});

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
