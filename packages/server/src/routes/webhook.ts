import { Hono } from "hono";
import { IX_TAG } from "@percolator/core";
import { config } from "../config.js";
import { insertTrade } from "../db/queries.js";
import { eventBus } from "../services/events.js";

const TRADE_TAGS = new Set<number>([IX_TAG.TradeNoCpi, IX_TAG.TradeCpi]);
const PROGRAM_IDS = new Set(config.allProgramIds);

/**
 * Helius Enhanced Transaction webhook receiver.
 * Parses trade instructions from enhanced tx data and stores them.
 */
export function webhookRoutes(): Hono {
  const app = new Hono();

  app.post("/webhook/trades", async (c) => {
    // Validate auth header
    const authHeader = c.req.header("authorization");
    if (config.webhookSecret && authHeader !== config.webhookSecret) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    // Parse body — Helius sends an array of enhanced transactions
    let transactions: any[];
    try {
      const body = await c.req.json();
      transactions = Array.isArray(body) ? body : [body];
    } catch {
      return c.json({ error: "Invalid JSON" }, 400);
    }

    // Process in background to return 200 quickly
    const processing = processTransactions(transactions);

    // Don't await — return immediately so Helius doesn't retry
    processing.catch((err) => {
      console.error("[Webhook] Background processing error:", err instanceof Error ? err.message : err);
    });

    return c.json({ received: transactions.length }, 200);
  });

  return app;
}

async function processTransactions(transactions: any[]): Promise<void> {
  let indexed = 0;

  for (const tx of transactions) {
    try {
      const trades = extractTradesFromEnhancedTx(tx);
      for (const trade of trades) {
        try {
          await insertTrade(trade);
          eventBus.publish("trade.executed", trade.slab_address, {
            signature: trade.tx_signature,
            trader: trade.trader,
            side: trade.side,
            size: trade.size,
            price: trade.price,
            fee: trade.fee,
          });
          indexed++;
        } catch (err) {
          // insertTrade already handles duplicate constraint (23505)
          console.warn("[Webhook] Insert error:", err instanceof Error ? err.message : err);
        }
      }
    } catch (err) {
      console.warn("[Webhook] Failed to process tx:", err instanceof Error ? err.message : err);
    }
  }

  if (indexed > 0) {
    console.log(`[Webhook] Indexed ${indexed} trade(s)`);
  }
}

interface TradeData {
  slab_address: string;
  trader: string;
  side: "long" | "short";
  size: string;
  price: number;
  fee: number;
  tx_signature: string;
}

function extractTradesFromEnhancedTx(tx: any): TradeData[] {
  const trades: TradeData[] = [];
  const signature = tx.signature ?? "";
  if (!signature) return trades;

  const instructions = tx.instructions ?? [];
  const accountKeys = tx.accountData ?? [];

  // Build token transfer map for price/fee extraction
  const tokenTransfers: any[] = tx.tokenTransfers ?? [];
  const nativeTransfers: any[] = tx.nativeTransfers ?? [];

  for (const ix of instructions) {
    const programId = ix.programId ?? "";
    if (!PROGRAM_IDS.has(programId)) continue;

    // Decode instruction data (base58)
    const data = ix.data ? decodeBase58(ix.data) : null;
    if (!data || data.length < 21) continue;

    const tag = data[0];
    if (!TRADE_TAGS.has(tag)) continue;

    // Parse: tag(1) + lpIdx(u16=2) + userIdx(u16=2) + size(i128=16)
    const sizeBytes = data.slice(5, 21);
    const isNegative = sizeBytes[15] >= 128;
    const side: "long" | "short" = isNegative ? "short" : "long";

    let sizeValue: bigint;
    if (isNegative) {
      const inverted = new Uint8Array(16);
      for (let k = 0; k < 16; k++) inverted[k] = ~sizeBytes[k] & 0xff;
      sizeValue = readU128LE(inverted) + 1n;
    } else {
      sizeValue = readU128LE(sizeBytes);
    }

    // Accounts: first is trader (signer), find slab from accounts list
    const accounts: string[] = ix.accounts ?? [];
    const trader = accounts[0] ?? "";
    if (!trader) continue;

    // Slab is typically the 2nd or 3rd account — find it by checking known market accounts
    // For now, use the inner instructions or just pick a reasonable account
    // The slab account is usually accounts[1] in the trade instruction
    const slabAddress = accounts.length > 1 ? accounts[1] : "";
    if (!slabAddress) continue;

    // Extract price from token transfers associated with this tx
    const price = extractPriceFromTransfers(tokenTransfers, trader);
    const fee = extractFeeFromNativeTransfers(nativeTransfers, trader);

    trades.push({
      slab_address: slabAddress,
      trader,
      side,
      size: sizeValue.toString(),
      price,
      fee,
      tx_signature: signature,
    });
  }

  // Also check inner instructions
  const innerInstructions = tx.innerInstructions ?? [];
  for (const inner of innerInstructions) {
    const innerIxs = inner.instructions ?? [];
    for (const ix of innerIxs) {
      const programId = ix.programId ?? "";
      if (!PROGRAM_IDS.has(programId)) continue;

      const data = ix.data ? decodeBase58(ix.data) : null;
      if (!data || data.length < 21) continue;

      const tag = data[0];
      if (!TRADE_TAGS.has(tag)) continue;

      const sizeBytes = data.slice(5, 21);
      const isNegative = sizeBytes[15] >= 128;
      const side: "long" | "short" = isNegative ? "short" : "long";

      let sizeValue: bigint;
      if (isNegative) {
        const inverted = new Uint8Array(16);
        for (let k = 0; k < 16; k++) inverted[k] = ~sizeBytes[k] & 0xff;
        sizeValue = readU128LE(inverted) + 1n;
      } else {
        sizeValue = readU128LE(sizeBytes);
      }

      const accounts: string[] = ix.accounts ?? [];
      const trader = accounts[0] ?? "";
      const slabAddress = accounts.length > 1 ? accounts[1] : "";
      if (!trader || !slabAddress) continue;

      const price = extractPriceFromTransfers(tokenTransfers, trader);
      const fee = extractFeeFromNativeTransfers(nativeTransfers, trader);

      // Avoid duplicates within same tx
      if (trades.some((t) => t.tx_signature === signature && t.trader === trader && t.side === side)) continue;

      trades.push({
        slab_address: slabAddress,
        trader,
        side,
        size: sizeValue.toString(),
        price,
        fee,
        tx_signature: signature,
      });
    }
  }

  return trades;
}

/**
 * Extract approximate price from Helius token transfers.
 * Looks for token transfer amounts involving the trader to estimate execution price.
 */
function extractPriceFromTransfers(tokenTransfers: any[], trader: string): number {
  // Find transfers where trader is sender or receiver
  for (const transfer of tokenTransfers) {
    if (transfer.fromUserAccount === trader || transfer.toUserAccount === trader) {
      const amount = Number(transfer.tokenAmount ?? 0);
      // If we find a USDC-like transfer (6 decimals), use it as price indicator
      if (amount > 0 && transfer.mint) {
        return amount;
      }
    }
  }
  return 0;
}

/**
 * Extract fee from native (SOL) transfers — look for small outbound transfers from trader.
 */
function extractFeeFromNativeTransfers(nativeTransfers: any[], trader: string): number {
  let totalFee = 0;
  for (const transfer of nativeTransfers) {
    if (transfer.fromUserAccount === trader) {
      const amount = Number(transfer.amount ?? 0);
      // Protocol fees are typically small SOL amounts
      if (amount > 0 && amount < 1_000_000_000) {
        // Convert lamports to SOL
        totalFee += amount / 1e9;
      }
    }
  }
  return totalFee;
}

/** Decode base58 string to Uint8Array */
function decodeBase58(str: string): Uint8Array | null {
  try {
    const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    const BASE = 58;
    let zeros = 0;
    while (zeros < str.length && str[zeros] === "1") zeros++;
    const bytes: number[] = [];
    for (let i = zeros; i < str.length; i++) {
      const charIndex = ALPHABET.indexOf(str[i]);
      if (charIndex < 0) return null;
      let carry = charIndex;
      for (let j = bytes.length - 1; j >= 0; j--) {
        carry += bytes[j] * BASE;
        bytes[j] = carry & 0xff;
        carry >>= 8;
      }
      while (carry > 0) {
        bytes.unshift(carry & 0xff);
        carry >>= 8;
      }
    }
    const result = new Uint8Array(zeros + bytes.length);
    result.set(bytes, zeros);
    return result;
  } catch {
    return null;
  }
}

/** Read unsigned 128-bit little-endian integer */
function readU128LE(bytes: Uint8Array): bigint {
  let value = 0n;
  for (let i = 15; i >= 0; i--) {
    value = (value << 8n) | BigInt(bytes[i]);
  }
  return value;
}
