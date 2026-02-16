import "dotenv/config";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { config } from "@percolator/shared";
import { MarketDiscovery } from "./services/MarketDiscovery.js";
import { StatsCollector } from "./services/StatsCollector.js";
import { TradeIndexerPolling } from "./services/TradeIndexer.js";
import { InsuranceLPService } from "./services/InsuranceLPService.js";
import { HeliusWebhookManager } from "./services/HeliusWebhookManager.js";
import { webhookRoutes } from "./routes/webhook.js";

console.log("📊 Indexer service starting...");

const discovery = new MarketDiscovery();
const statsCollector = new StatsCollector(discovery);
const tradeIndexer = new TradeIndexerPolling();
const insuranceService = new InsuranceLPService(discovery);
const webhookManager = new HeliusWebhookManager();

const app = new Hono();
app.get("/health", (c) => c.json({ status: "ok", service: "indexer" }));
app.route("/", webhookRoutes());

const port = Number(process.env.INDEXER_PORT ?? 3002);

async function start() {
  await discovery.discover();
  discovery.start();
  statsCollector.start();
  tradeIndexer.start();
  insuranceService.start();
  await webhookManager.start();
  
  serve({ fetch: app.fetch, port }, (info) => {
    console.log(`📊 Indexer running on http://localhost:${info.port}`);
  });
}

start().catch((err) => {
  console.error("Failed to start indexer:", err);
  process.exit(1);
});

async function shutdown(signal: string): Promise<void> {
  console.log(`[Indexer] ${signal} received, shutting down gracefully...`);
  
  try {
    // Stop all services (clears timers and intervals)
    console.log("[Indexer] Stopping market discovery...");
    discovery.stop();
    
    console.log("[Indexer] Stopping stats collector...");
    statsCollector.stop();
    
    console.log("[Indexer] Stopping trade indexer...");
    tradeIndexer.stop();
    
    console.log("[Indexer] Stopping insurance LP service...");
    insuranceService.stop();
    
    console.log("[Indexer] Stopping webhook manager...");
    webhookManager.stop();
    
    // Note: Solana connection and Supabase client don't need explicit cleanup
    
    console.log("[Indexer] Shutdown complete");
    process.exit(0);
  } catch (err) {
    console.error("[Indexer] Error during shutdown:", err);
    process.exit(1);
  }
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
