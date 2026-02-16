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

async function shutdown(signal: string) {
  console.log(`${signal} received, shutting down keeper...`);
  crankService.stop();
  liquidationService.stop();
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
