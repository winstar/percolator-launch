import "dotenv/config";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { config, createLogger, initSentry, captureException } from "@percolator/shared";
import { MarketDiscovery } from "./services/MarketDiscovery.js";
import { StatsCollector } from "./services/StatsCollector.js";
import { TradeIndexerPolling } from "./services/TradeIndexer.js";
import { InsuranceLPService } from "./services/InsuranceLPService.js";
import { HeliusWebhookManager } from "./services/HeliusWebhookManager.js";
import { webhookRoutes } from "./routes/webhook.js";

// Initialize Sentry first
initSentry("indexer");

const logger = createLogger("indexer");

logger.info("Indexer service starting");

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
    logger.info("Indexer service started", { port: info.port });
  });
}

start().catch((err) => {
  logger.error("Failed to start indexer", { error: err });
  captureException(err, { tags: { context: "indexer-startup" } });
  process.exit(1);
});

async function shutdown(signal: string): Promise<void> {
  logger.info("Shutdown initiated", { signal });
  
  try {
    // Stop all services (clears timers and intervals)
    logger.info("Stopping market discovery");
    discovery.stop();
    
    logger.info("Stopping stats collector");
    statsCollector.stop();
    
    logger.info("Stopping trade indexer");
    tradeIndexer.stop();
    
    logger.info("Stopping insurance LP service");
    insuranceService.stop();
    
    logger.info("Stopping webhook manager");
    webhookManager.stop();
    
    // Note: Solana connection and Supabase client don't need explicit cleanup
    
    logger.info("Shutdown complete");
    process.exit(0);
  } catch (err) {
    logger.error("Error during shutdown", { error: err });
    captureException(err, { tags: { context: "indexer-shutdown" } });
    process.exit(1);
  }
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
