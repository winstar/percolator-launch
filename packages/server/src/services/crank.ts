import { PublicKey, SYSVAR_CLOCK_PUBKEY } from "@solana/web3.js";
import {
  discoverMarkets,
  encodeKeeperCrank,
  buildAccountMetas,
  buildIx,
  ACCOUNTS_KEEPER_CRANK,
  type DiscoveredMarket,
} from "@percolator/core";
import { config } from "../config.js";
import { getConnection, loadKeypair, sendWithRetry } from "../utils/solana.js";
import { eventBus } from "./events.js";
import { OracleService } from "./oracle.js";

interface MarketCrankState {
  market: DiscoveredMarket;
  lastCrankTime: number;
  successCount: number;
  failureCount: number;
}

export class CrankService {
  private markets = new Map<string, MarketCrankState>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly intervalMs: number;
  private readonly oracleService: OracleService;

  constructor(oracleService: OracleService, intervalMs?: number) {
    this.oracleService = oracleService;
    this.intervalMs = intervalMs ?? config.crankIntervalMs;
  }

  async discover(): Promise<DiscoveredMarket[]> {
    const connection = getConnection();
    const programId = new PublicKey(config.programId);
    const discovered = await discoverMarkets(connection, programId);

    for (const market of discovered) {
      const key = market.slabAddress.toBase58();
      if (!this.markets.has(key)) {
        this.markets.set(key, {
          market,
          lastCrankTime: 0,
          successCount: 0,
          failureCount: 0,
        });
      } else {
        this.markets.get(key)!.market = market;
      }
    }

    return discovered;
  }

  private isAdminOracle(market: DiscoveredMarket): boolean {
    return !market.config.oracleAuthority.equals(PublicKey.default);
  }

  async crankMarket(slabAddress: string): Promise<boolean> {
    const state = this.markets.get(slabAddress);
    if (!state) {
      console.warn(`[CrankService] Market ${slabAddress} not found`);
      return false;
    }

    const { market } = state;

    try {
      // For admin oracle markets, push price first
      if (this.isAdminOracle(market)) {
        await this.oracleService.pushPrice(slabAddress, market.config);
      }

      const connection = getConnection();
      const keypair = loadKeypair(config.crankKeypair);
      const programId = new PublicKey(config.programId);

      const data = encodeKeeperCrank({ callerIdx: 65535, allowPanic: false });

      // ACCOUNTS_KEEPER_CRANK: [caller, slab, clock, oracle]
      // For admin oracle: oracle = slab (unused but required)
      const oracleKey = this.isAdminOracle(market)
        ? market.slabAddress
        : market.config.indexFeedId;

      const keys = buildAccountMetas(ACCOUNTS_KEEPER_CRANK, [
        keypair.publicKey,
        market.slabAddress,
        SYSVAR_CLOCK_PUBKEY,
        oracleKey,
      ]);

      const ix = buildIx({ programId, keys, data });
      const sig = await sendWithRetry(connection, ix, [keypair]);

      state.lastCrankTime = Date.now();
      state.successCount++;

      eventBus.publish("crank.success", slabAddress, { signature: sig });
      return true;
    } catch (err) {
      state.failureCount++;
      eventBus.publish("crank.failure", slabAddress, {
        error: err instanceof Error ? err.message : String(err),
      });
      console.error(`[CrankService] Crank failed for ${slabAddress}:`, err);
      return false;
    }
  }

  async crankAll(): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    for (const [slabAddress] of this.markets) {
      const ok = await this.crankMarket(slabAddress);
      if (ok) success++;
      else failed++;
    }

    return { success, failed };
  }

  start(): void {
    if (this.timer) return;
    console.log(`[CrankService] Starting with interval ${this.intervalMs}ms`);

    this.timer = setInterval(async () => {
      try {
        await this.discover();
        await this.crankAll();
      } catch (err) {
        console.error("[CrankService] Cycle error:", err);
      }
    }, this.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log("[CrankService] Stopped");
    }
  }

  getStatus(): Record<string, { lastCrankTime: number; successCount: number; failureCount: number }> {
    const status: Record<string, { lastCrankTime: number; successCount: number; failureCount: number }> = {};
    for (const [key, state] of this.markets) {
      status[key] = {
        lastCrankTime: state.lastCrankTime,
        successCount: state.successCount,
        failureCount: state.failureCount,
      };
    }
    return status;
  }

  getMarkets(): Map<string, MarketCrankState> {
    return this.markets;
  }
}
