import "dotenv/config";
import { config, eventBus } from "@percolator/shared";
import { OracleService } from "./services/oracle.js";
import { CrankService } from "./services/crank.js";
import { LiquidationService } from "./services/liquidation.js";

if (!config.crankKeypair) {
  throw new Error("CRANK_KEYPAIR must be set for keeper service");
}

console.log("🔑 Keeper service starting...");

const oracleService = new OracleService();
const crankService = new CrankService(oracleService);
const liquidationService = new LiquidationService(oracleService);

async function start() {
  const markets = await crankService.discover();
  console.log(`⚡ Found ${markets.length} markets`);
  crankService.start();
  console.log("⚡ Crank service started");
  liquidationService.start(() => crankService.getMarkets());
  console.log("🔍 Liquidation scanner started");
}

start().catch((err) => {
  console.error("Failed to start keeper:", err);
  process.exit(1);
});

async function shutdown(signal: string): Promise<void> {
  console.log(`[Keeper] ${signal} received, shutting down gracefully...`);
  
  try {
    // Stop crank service (clears timers, stops processing)
    console.log("[Keeper] Stopping crank service...");
    crankService.stop();
    
    // Stop liquidation service (clears timers)
    console.log("[Keeper] Stopping liquidation service...");
    liquidationService.stop();
    
    // Note: Solana connection doesn't need explicit cleanup
    // Oracle service has no persistent state to clean up
    
    console.log("[Keeper] Shutdown complete");
    process.exit(0);
  } catch (err) {
    console.error("[Keeper] Error during shutdown:", err);
    process.exit(1);
  }
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
