#!/usr/bin/env npx tsx
/**
 * PERC-370: Keeper Market-Making Bot (Simplified)
 *
 * Uses deployment config directly (no discovery needed).
 * Registers user accounts, deposits collateral, and places two-sided quotes.
 *
 * Usage:
 *   KEEPER_WALLET=/tmp/percolator-keepers/keeper-wide.json \
 *   npx tsx scripts/keeper-bot.ts
 */

import {
  Connection, Keypair, PublicKey, Transaction,
  ComputeBudgetProgram, sendAndConfirmTransaction,
  SYSVAR_CLOCK_PUBKEY, LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress, TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  encodeInitUser, encodeDepositCollateral, encodeTradeCpi,
  encodeKeeperCrank, encodePushOraclePrice,
  ACCOUNTS_INIT_USER, ACCOUNTS_DEPOSIT_COLLATERAL,
  ACCOUNTS_TRADE_CPI, ACCOUNTS_KEEPER_CRANK,
  buildAccountMetas, buildIx, WELL_KNOWN,
  deriveVaultAuthority, deriveLpPda,
  parseAllAccounts,
} from "../packages/core/src/index.js";
import * as fs from "fs";

// ═══════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════

const RPC_URL = process.env.RPC_URL ?? "https://api.devnet.solana.com";
const DEPLOY_PATH = process.env.DEPLOY_CONFIG ?? "/tmp/percolator-devnet-deployment.json";
const WALLET_PATH = process.env.KEEPER_WALLET ?? "/tmp/percolator-keepers/keeper-wide.json";
const SPREAD_BPS = Number(process.env.SPREAD_BPS ?? "50");
const QUOTE_SIZE_USDC = Number(process.env.QUOTE_SIZE_USDC ?? "100");
const INTERVAL_MS = Number(process.env.INTERVAL_MS ?? "10000");
const COLLATERAL_USDC = Number(process.env.COLLATERAL_USDC ?? "4000");

const conn = new Connection(RPC_URL, "confirmed");
const wallet = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(fs.readFileSync(WALLET_PATH, "utf8")))
);

const BINANCE: Record<string, string> = {
  SOL: "SOLUSDT", BTC: "BTCUSDT", ETH: "ETHUSDT",
};

interface MarketState {
  symbol: string;
  slab: PublicKey;
  programId: PublicKey;
  matcherProgramId: PublicKey;
  mint: PublicKey;
  userIdx: number;
  lpIdx: number;  // LP index for TradeCpi
  lpOwner: PublicKey; // LP owner for TradeCpi
  matcherCtx: PublicKey;
  position: bigint;
  collateral: bigint;
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

function log(tag: string, msg: string) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] [${tag}] ${msg}`);
}

async function sendTx(tx: Transaction, signers: Keypair[], label: string): Promise<string | null> {
  tx.feePayer = signers[0].publicKey;
  const { blockhash } = await conn.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  try {
    const sig = await sendAndConfirmTransaction(conn, tx, signers, {
      commitment: "confirmed",
      skipPreflight: true,
    });
    log("tx", `✅ ${label} → ${sig.slice(0, 16)}...`);
    return sig;
  } catch (e: any) {
    log("tx", `❌ ${label}: ${e.message?.slice(0, 100)}`);
    return null;
  }
}

async function getPrice(symbol: string): Promise<number | null> {
  const pair = BINANCE[symbol];
  if (!pair) return null;
  try {
    const resp = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${pair}`, {
      signal: AbortSignal.timeout(4000),
    });
    const json = (await resp.json()) as { price?: string };
    return json.price ? parseFloat(json.price) : null;
  } catch { return null; }
}

// ═══════════════════════════════════════════════════════════════
// Setup: Register user accounts on each market
// ═══════════════════════════════════════════════════════════════

async function setupMarket(
  slab: PublicKey,
  programId: PublicKey,
  matcherProgramId: PublicKey,
  mint: PublicKey,
  symbol: string,
): Promise<MarketState | null> {
  const walletAta = await getAssociatedTokenAddress(mint, wallet.publicKey);
  const [vaultPda] = deriveVaultAuthority(programId, slab);
  const vaultAta = await getAssociatedTokenAddress(mint, vaultPda, true);

  // Parse slab to find accounts
  const slabInfo = await conn.getAccountInfo(slab);
  if (!slabInfo) { log("setup", `❌ ${symbol}: slab not found`); return null; }
  const data = new Uint8Array(slabInfo.data);
  const accounts = parseAllAccounts(data);

  // Find LP account (index 0 is admin LP)
  const lpAccount = accounts.find(a => a.account.kind === 1);
  if (!lpAccount) { log("setup", `❌ ${symbol}: no LP account found`); return null; }

  // Find our user account
  let userAccount = accounts.find(
    a => a.account.kind === 0 && a.account.owner.equals(wallet.publicKey),
  );

  if (!userAccount) {
    log("setup", `${symbol}: creating user account...`);
    // InitUser
    const initUserData = encodeInitUser({ feePayment: "1000000" });
    const initUserKeys = buildAccountMetas(ACCOUNTS_INIT_USER, [
      wallet.publicKey, slab, walletAta, vaultAta, WELL_KNOWN.tokenProgram,
    ]);
    const tx1 = new Transaction().add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
      buildIx({ programId, keys: initUserKeys, data: initUserData }),
    );
    const sig1 = await sendTx(tx1, [wallet], `${symbol} InitUser`);
    if (!sig1) return null;

    // Wait and refetch
    await new Promise(r => setTimeout(r, 1000));
    const slabInfo2 = await conn.getAccountInfo(slab);
    if (!slabInfo2) return null;
    const accounts2 = parseAllAccounts(new Uint8Array(slabInfo2.data));
    userAccount = accounts2.find(
      a => a.account.kind === 0 && a.account.owner.equals(wallet.publicKey),
    );
    if (!userAccount) { log("setup", `❌ ${symbol}: user not found after init`); return null; }
    log("setup", `${symbol}: user at index ${userAccount.idx}`);

    // Deposit collateral
    const amount = BigInt(COLLATERAL_USDC) * 1_000_000n;
    const depositData = encodeDepositCollateral({
      userIdx: userAccount.idx,
      amount: amount.toString(),
    });
    const depositKeys = buildAccountMetas(ACCOUNTS_DEPOSIT_COLLATERAL, [
      wallet.publicKey, slab, walletAta, vaultAta, WELL_KNOWN.tokenProgram, SYSVAR_CLOCK_PUBKEY,
    ]);
    const tx2 = new Transaction().add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
      buildIx({ programId, keys: depositKeys, data: depositData }),
    );
    await sendTx(tx2, [wallet], `${symbol} Deposit $${COLLATERAL_USDC}`);
  } else {
    log("setup", `${symbol}: user exists at index ${userAccount.idx}`);
  }

  // Read matcher context from LP account bytes directly
  // LP account matcherContext is at a known offset in the account struct
  const matcherCtxBytes = lpAccount.account.matcherContext;
  const matcherCtx = matcherCtxBytes instanceof PublicKey
    ? matcherCtxBytes
    : new PublicKey(matcherCtxBytes ?? PublicKey.default.toBytes());

  return {
    symbol,
    slab,
    programId,
    matcherProgramId,
    mint,
    userIdx: userAccount.idx,
    lpIdx: lpAccount.idx,
    lpOwner: lpAccount.account.owner,
    matcherCtx,
    position: userAccount.account.positionSize ?? 0n,
    collateral: userAccount.account.capital ?? BigInt(COLLATERAL_USDC) * 1_000_000n,
  };
}

// ═══════════════════════════════════════════════════════════════
// Quote loop
// ═══════════════════════════════════════════════════════════════

async function quoteMarket(market: MarketState): Promise<void> {
  const price = await getPrice(market.symbol);
  if (!price) {
    log("quote", `${market.symbol}: no price, skip`);
    return;
  }

  // Refresh on-chain position
  try {
    const slabInfo = await conn.getAccountInfo(market.slab);
    if (slabInfo) {
      const accounts = parseAllAccounts(new Uint8Array(slabInfo.data));
      const userAcc = accounts.find(
        a => a.account.kind === 0 && a.account.owner.equals(wallet.publicKey),
      );
      if (userAcc) {
        market.position = userAcc.account.positionSize ?? market.position;
        market.collateral = userAcc.account.capital ?? market.collateral;
      }
    }
  } catch { /* use cached */ }

  const collUsd = Number(market.collateral) / 1e6;
  const posUsd = Number(market.position) / 1e6;
  const exposure = collUsd > 0 ? Math.abs(posUsd) / (collUsd * 0.1) : 0;

  log("state", `${market.symbol}: price=$${price.toFixed(2)} | pos=$${posUsd.toFixed(2)} | col=$${collUsd.toFixed(0)} | exp=${(exposure * 100).toFixed(1)}%`);

  // Skip if at max position
  if (exposure >= 0.95) {
    log("quote", `${market.symbol}: at max exposure, skipping`);
    return;
  }

  const spreadFrac = SPREAD_BPS / 10_000;
  const bidPrice = price * (1 - spreadFrac);
  const askPrice = price * (1 + spreadFrac);
  // Size is in TOKEN units (6 decimals). Notional = size * oraclePrice.
  // To get $QUOTE_SIZE_USDC notional: size = QUOTE_SIZE_USDC / oraclePrice * 1e6
  const sizeNative = BigInt(Math.max(1, Math.round((QUOTE_SIZE_USDC / price) * 1e6)));
  log("quote", `${market.symbol}: size=${sizeNative} tokens (notional ≈ $${(Number(sizeNative) / 1e6 * price).toFixed(2)})`);

  const [lpPda] = deriveLpPda(market.programId, market.slab, market.lpIdx);

  // Crank first
  const crankData = encodeKeeperCrank({ callerIdx: 65535, allowPanic: false });
  const crankKeys = buildAccountMetas(ACCOUNTS_KEEPER_CRANK, [
    wallet.publicKey, market.slab, WELL_KNOWN.clock, market.slab,
  ]);
  const crankIx = buildIx({ programId: market.programId, keys: crankKeys, data: crankData });

  // BID (buy / long)
  const bidTradeData = encodeTradeCpi({
    lpIdx: market.lpIdx,
    userIdx: market.userIdx,
    size: sizeNative.toString(),
  });
  const bidTradeKeys = buildAccountMetas(ACCOUNTS_TRADE_CPI, [
    wallet.publicKey,
    market.lpOwner,
    market.slab,
    market.slab, // oracle = slab for hyperp
    market.matcherProgramId,
    market.matcherCtx,
    lpPda,
  ]);
  const bidIx = buildIx({ programId: market.programId, keys: bidTradeKeys, data: bidTradeData });

  log("quote", `${market.symbol} BID @ $${bidPrice.toFixed(2)} | size: $${QUOTE_SIZE_USDC}`);
  const bidTx = new Transaction().add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }),
    crankIx,
    bidIx,
  );
  await sendTx(bidTx, [wallet], `${market.symbol} BID`);

  await new Promise(r => setTimeout(r, 1000));

  // ASK (sell / short)
  const askTradeData = encodeTradeCpi({
    lpIdx: market.lpIdx,
    userIdx: market.userIdx,
    size: (-sizeNative).toString(),
  });
  const askTradeKeys = buildAccountMetas(ACCOUNTS_TRADE_CPI, [
    wallet.publicKey,
    market.lpOwner,
    market.slab,
    market.slab,
    market.matcherProgramId,
    market.matcherCtx,
    lpPda,
  ]);
  const askIx = buildIx({ programId: market.programId, keys: askTradeKeys, data: askTradeData });

  log("quote", `${market.symbol} ASK @ $${askPrice.toFixed(2)} | size: $${QUOTE_SIZE_USDC}`);
  const askTx = new Transaction().add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }),
    crankIx, // Need to rebuild crank for fresh blockhash
    askIx,
  );
  await sendTx(askTx, [wallet], `${market.symbol} ASK`);
}

// ═══════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════

async function main() {
  log("main", `═══ PERC-370 Keeper Bot ═══`);
  log("main", `Wallet: ${wallet.publicKey.toBase58()}`);
  log("main", `Balance: ${(await conn.getBalance(wallet.publicKey)) / LAMPORTS_PER_SOL} SOL`);
  log("main", `Config: spread=${SPREAD_BPS}bps | size=$${QUOTE_SIZE_USDC} | interval=${INTERVAL_MS}ms`);

  // Load deployment config
  const deploy = JSON.parse(fs.readFileSync(DEPLOY_PATH, "utf8"));
  const programId = new PublicKey(deploy.programId);
  const matcherProgramId = new PublicKey(deploy.matcherProgramId);
  const mint = new PublicKey(deploy.mint);

  log("main", `Program: ${programId.toBase58().slice(0, 12)}...`);
  log("main", `Markets: ${deploy.markets.length}`);

  // Setup markets
  const markets: MarketState[] = [];
  for (const m of deploy.markets) {
    const state = await setupMarket(
      new PublicKey(m.slab),
      programId,
      matcherProgramId,
      mint,
      m.symbol || m.label,
    );
    if (state) markets.push(state);
    await new Promise(r => setTimeout(r, 500));
  }

  if (markets.length === 0) {
    log("main", "❌ No markets set up. Exiting.");
    process.exit(1);
  }

  log("main", `🚀 Starting on ${markets.length} market(s)`);

  let running = true;
  process.on("SIGINT", () => { running = false; });
  process.on("SIGTERM", () => { running = false; });

  while (running) {
    for (const market of markets) {
      if (!running) break;
      try {
        await quoteMarket(market);
      } catch (e: any) {
        log("main", `❌ ${market.symbol} error: ${e.message?.slice(0, 80)}`);
      }
      await new Promise(r => setTimeout(r, 1000));
    }
    const sleepMs = Math.max(1000, INTERVAL_MS);
    await new Promise(r => setTimeout(r, sleepMs));
  }
  log("main", "Bot stopped.");
}

main().catch(e => { console.error("Fatal:", e.message || e); process.exit(1); });
