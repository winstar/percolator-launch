import "dotenv/config";
import { config, createLogger, initSentry, captureException } from "@percolator/shared";
import { OracleService } from "./services/oracle.js";
import { CrankService } from "./services/crank.js";
import { LiquidationService } from "./services/liquidation.js";

// Initialize Sentry first
initSentry("keeper");

const logger = createLogger("keeper");

if (!config.crankKeypair) {
  throw new Error("CRANK_KEYPAIR must be set for keeper service");
}

logger.info("Keeper service starting");

const oracleService = new OracleService();
const crankService = new CrankService(oracleService);
const liquidationService = new LiquidationService(oracleService);

async function start() {
  const markets = await crankService.discover();
  logger.info("Markets discovered", { count: markets.length });
  crankService.start();
  logger.info("Crank service started");
  liquidationService.start(() => crankService.getMarkets());
  logger.info("Liquidation scanner started");
}

start().catch((err) => {
  logger.error("Failed to start keeper", { error: err });
  process.exit(1);
});

async function shutdown(signal: string): Promise<void> {
  logger.info("Shutdown initiated", { signal });
  
  try {
    // Stop crank service (clears timers, stops processing)
    logger.info("Stopping crank service");
    crankService.stop();
    
    // Stop liquidation service (clears timers)
    logger.info("Stopping liquidation service");
    liquidationService.stop();
    
    // Note: Solana connection doesn't need explicit cleanup
    // Oracle service has no persistent state to clean up
    
    logger.info("Shutdown complete");
    process.exit(0);
  } catch (err) {
    logger.error("Error during shutdown", { error: err });
    process.exit(1);
  }
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
