#!/usr/bin/env npx tsx
/**
 * Auto-Crank Service — standalone Node.js script
 *
 * Continuously discovers and cranks all Percolator markets.
 * Deploy to Railway, run locally, or use as a systemd service.
 *
 * Env vars:
 *   NETWORK          — devnet | testnet | mainnet (REQUIRED)
 *   SOLANA_RPC_URL   — RPC endpoint (validated for network)
 *   CRANK_KEYPAIR    — Base58-encoded or JSON-array private key
 *   CRANK_INTERVAL_MS — Interval between crank cycles (default: 30000)
 *   PROGRAM_ID       — Percolator program ID (REQUIRED)
 */

import {
  Connection,
  PublicKey,
  Transaction,
  ComputeBudgetProgram,
  SYSVAR_CLOCK_PUBKEY,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  encodeKeeperCrank,
  encodePushOraclePrice,
  buildAccountMetas,
  ACCOUNTS_KEEPER_CRANK,
  ACCOUNTS_PUSH_ORACLE_PRICE,
  buildIx,
  discoverMarkets,
  derivePythPushOraclePDA,
  type DiscoveredMarket,
} from "../packages/core/src/index.js";
import { getSealedSigner, getCrankPublicKey } from "../packages/shared/src/signer.js";
import { ensureNetworkConfigValid, validateNetworkConfig } from "../packages/shared/src/networkValidation.js";

// ---------------------------------------------------------------------------
// Validation & Config
// ---------------------------------------------------------------------------

// Validate network configuration (prevents mainnet accidents)
ensureNetworkConfigValid(process.env);
const networkConfig = validateNetworkConfig(process.env);

const RPC_URL = networkConfig.rpcUrl;
const CRANK_INTERVAL_MS = Number(process.env.CRANK_INTERVAL_MS) || 30_000;
const DISCOVERY_INTERVAL_MS = 60_000;
const PRIORITY_FEE = 50_000;
const ALL_ZEROS = new PublicKey("11111111111111111111111111111111");

const PROGRAM_ID = new PublicKey(networkConfig.programIds[0]);

const connection = new Connection(RPC_URL, "confirmed");

// Load sealed signer (private key never exposed)
const signer = getSealedSigner();
const crankPublicKey = getCrankPublicKey();

console.log(`
✅ Crank Service Initialized
   Network: ${process.env.NETWORK}
   RPC: ${RPC_URL}
   Program: ${PROGRAM_ID.toBase58()}
   Crank: ${crankPublicKey}
   Interval: ${CRANK_INTERVAL_MS}ms
`);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isAdminOracle(feedId: PublicKey): boolean {
  return feedId.equals(ALL_ZEROS) || feedId.equals(PublicKey.default);
}

async function fetchDexScreenerPrice(mint: string): Promise<number> {
  const resp = await fetch(
    `https://api.dexscreener.com/latest/dex/tokens/${mint}`,
    { headers: { "User-Agent": "percolator-autocrank/1.0" }, signal: AbortSignal.timeout(5000) },
  );
  const json = (await resp.json()) as Record<string, unknown>;
  const pairs = (json.pairs || []) as Array<{ priceUsd: string; liquidity?: { usd: number } }>;
  if (!pairs.length) throw new Error(`No pairs for ${mint.slice(0, 8)}…`);
  pairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));
  return parseFloat(pairs[0].priceUsd);
}

async function crankMarket(market: DiscoveredMarket): Promise<string> {
  const slabPk = market.slabAddress;
  const tx = new Transaction();
  tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: PRIORITY_FEE }));
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 500_000 }));

  let oracleAccount: PublicKey;

  if (isAdminOracle(market.config.indexFeedId)) {
    const price = await fetchDexScreenerPrice(market.config.collateralMint.toBase58());
    const priceE6 = Math.max(Math.round(price * 1_000_000), 1);
    const ts = Math.floor(Date.now() / 1000);

    const pushData = encodePushOraclePrice({
      priceE6: priceE6.toString(),
      timestamp: ts.toString(),
    });
    const pushKeys = buildAccountMetas(ACCOUNTS_PUSH_ORACLE_PRICE, [payer.publicKey, slabPk]);
    tx.add(buildIx({ programId: PROGRAM_ID, keys: pushKeys, data: pushData }));

    oracleAccount = slabPk;
  } else {
    const feedIdHex = Buffer.from(market.config.indexFeedId.toBytes()).toString("hex");
    const [pythPDA] = derivePythPushOraclePDA(feedIdHex);
    oracleAccount = pythPDA;
  }

  const crankData = encodeKeeperCrank({ callerIdx: 65535, allowPanic: false });
  const crankKeys = buildAccountMetas(ACCOUNTS_KEEPER_CRANK, [
    payer.publicKey,
    slabPk,
    SYSVAR_CLOCK_PUBKEY,
    oracleAccount,
  ]);
  tx.add(buildIx({ programId: PROGRAM_ID, keys: crankKeys, data: crankData }));

  return sendAndConfirmTransaction(connection, tx, [payer], {
    commitment: "confirmed",
    skipPreflight: true,
  });
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

async function main() {
  console.log("🔄 Percolator Auto-Crank Service");
  console.log(`   Program:  ${PROGRAM_ID.toBase58()}`);
  console.log(`   Payer:    ${payer.publicKey.toBase58()}`);
  console.log(`   RPC:      ${RPC_URL.slice(0, 50)}…`);
  console.log(`   Interval: ${CRANK_INTERVAL_MS / 1000}s\n`);

  const balance = await connection.getBalance(payer.publicKey);
  console.log(`   Balance:  ${(balance / 1e9).toFixed(4)} SOL\n`);

  let markets: DiscoveredMarket[] = [];
  let lastDiscovery = 0;
  let totalCranks = 0;

  while (true) {
    const now = Date.now();

    // Re-discover periodically
    if (now - lastDiscovery >= DISCOVERY_INTERVAL_MS || markets.length === 0) {
      try {
        markets = await discoverMarkets(connection, PROGRAM_ID);
        lastDiscovery = now;
        console.log(`[${ts()}] Discovered ${markets.length} market(s)`);
      } catch (err) {
        console.error(`[${ts()}] Discovery error: ${errMsg(err)}`);
        if (markets.length === 0) {
          await sleep(CRANK_INTERVAL_MS);
          continue;
        }
      }
    }

    // Crank each market
    for (const market of markets) {
      const label = market.slabAddress.toBase58().slice(0, 12);
      const start = Date.now();
      try {
        const sig = await crankMarket(market);
        totalCranks++;
        const elapsed = Date.now() - start;
        console.log(
          `[${ts()}] ✅ #${totalCranks} ${label}… sig=${sig.slice(0, 16)}… (${elapsed}ms)`,
        );
      } catch (err) {
        const elapsed = Date.now() - start;
        console.error(
          `[${ts()}] ❌ ${label}… (${elapsed}ms): ${errMsg(err)}`,
        );
      }
    }

    await sleep(CRANK_INTERVAL_MS);
  }
}

function ts(): string {
  return new Date().toISOString();
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
