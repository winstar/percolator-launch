#!/usr/bin/env npx tsx
/**
 * PERC-370: Oracle Price Pusher Daemon
 * 
 * Continuously pushes live oracle prices to Hyperp-mode markets on devnet.
 * Uses admin keypair (oracle authority) and fetches prices from Binance/CoinGecko.
 *
 * Usage:
 *   npx tsx scripts/oracle-pusher.ts
 *
 * Reads deployment info from /tmp/percolator-devnet-deployment.json
 */

import {
  Connection, Keypair, PublicKey, Transaction,
  ComputeBudgetProgram, sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  encodePushOraclePrice, encodeKeeperCrank,
  ACCOUNTS_PUSH_ORACLE_PRICE, ACCOUNTS_KEEPER_CRANK,
  buildAccountMetas, buildIx, WELL_KNOWN,
} from "../packages/core/src/index.js";
import * as fs from "fs";

const PUSH_INTERVAL_MS = 5000; // Push every 5 seconds
const ADMIN_KP_PATH = process.env.ADMIN_KEYPAIR_PATH ??
  `${process.env.HOME}/.config/solana/percolator-upgrade-authority.json`;
const RPC_URL = process.env.RPC_URL ?? "https://api.devnet.solana.com";

const conn = new Connection(RPC_URL, "confirmed");
const admin = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(fs.readFileSync(ADMIN_KP_PATH, "utf8")))
);

interface MarketInfo {
  symbol: string;
  label: string;
  slab: string;
  priceE6: string;
}

const BINANCE_MAP: Record<string, string> = {
  SOL: "SOLUSDT", BTC: "BTCUSDT", ETH: "ETHUSDT",
};

async function fetchBinancePrice(symbol: string): Promise<number | null> {
  const pair = BINANCE_MAP[symbol];
  if (!pair) return null;
  try {
    const resp = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${pair}`, {
      signal: AbortSignal.timeout(4000),
    });
    const json = (await resp.json()) as { price?: string };
    return json.price ? parseFloat(json.price) : null;
  } catch { return null; }
}

async function fetchCoinGeckoPrice(symbol: string): Promise<number | null> {
  const ids: Record<string, string> = { SOL: "solana", BTC: "bitcoin", ETH: "ethereum" };
  const id = ids[symbol];
  if (!id) return null;
  try {
    const resp = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`, {
      signal: AbortSignal.timeout(5000),
    });
    const json = (await resp.json()) as Record<string, { usd?: number }>;
    return json[id]?.usd ?? null;
  } catch { return null; }
}

async function getPrice(symbol: string): Promise<number | null> {
  return (await fetchBinancePrice(symbol)) ?? (await fetchCoinGeckoPrice(symbol));
}

function log(msg: string) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] [oracle] ${msg}`);
}

async function pushAndCrank(market: MarketInfo, programId: PublicKey): Promise<void> {
  const price = await getPrice(market.symbol);
  if (!price) {
    log(`⚠️ ${market.label}: no price available`);
    return;
  }

  const priceE6 = BigInt(Math.round(price * 1_000_000));
  const timestamp = BigInt(Math.floor(Date.now() / 1000));
  const slab = new PublicKey(market.slab);

  const pushData = encodePushOraclePrice({ priceE6: priceE6.toString(), timestamp: timestamp.toString() });
  const pushKeys = buildAccountMetas(ACCOUNTS_PUSH_ORACLE_PRICE, [admin.publicKey, slab]);

  const crankData = encodeKeeperCrank({ callerIdx: 65535, allowPanic: false });
  const crankKeys = buildAccountMetas(ACCOUNTS_KEEPER_CRANK, [
    admin.publicKey, slab, WELL_KNOWN.clock, slab,
  ]);

  const tx = new Transaction().add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 500_000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }),
    buildIx({ programId, keys: pushKeys, data: pushData }),
    buildIx({ programId, keys: crankKeys, data: crankData }),
  );
  tx.feePayer = admin.publicKey;
  const { blockhash } = await conn.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;

  const sig = await sendAndConfirmTransaction(conn, tx, [admin], {
    commitment: "confirmed",
    skipPreflight: true,
  });
  log(`✅ ${market.label}: $${price.toFixed(2)} → ${sig.slice(0, 12)}...`);
}

async function main() {
  log(`Oracle Pusher starting — admin: ${admin.publicKey.toBase58().slice(0, 12)}...`);

  const deployPath = "/tmp/percolator-devnet-deployment.json";
  if (!fs.existsSync(deployPath)) {
    console.error("❌ Deployment info not found. Run deploy-devnet-mm.ts first.");
    process.exit(1);
  }

  const deploy = JSON.parse(fs.readFileSync(deployPath, "utf8"));
  const programId = new PublicKey(deploy.programId);
  const markets = deploy.markets as MarketInfo[];

  log(`Program: ${programId.toBase58().slice(0, 12)}...`);
  log(`Markets: ${markets.map(m => m.label).join(", ")}`);
  log(`Push interval: ${PUSH_INTERVAL_MS}ms`);

  let running = true;
  process.on("SIGINT", () => { running = false; });
  process.on("SIGTERM", () => { running = false; });

  while (running) {
    for (const market of markets) {
      if (!running) break;
      try {
        await pushAndCrank(market, programId);
      } catch (e: any) {
        log(`❌ ${market.label}: ${e.message?.slice(0, 80)}`);
      }
    }
    await new Promise(r => setTimeout(r, PUSH_INTERVAL_MS));
  }
  log("Oracle Pusher stopped.");
}

main().catch(e => { console.error("Fatal:", e.message); process.exit(1); });
