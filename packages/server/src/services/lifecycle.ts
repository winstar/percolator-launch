import { PublicKey } from "@solana/web3.js";
import { discoverMarkets, type DiscoveredMarket } from "@percolator/core";
import { config } from "../config.js";
import { getConnection } from "../utils/solana.js";
import { eventBus } from "./events.js";
import { CrankService } from "./crank.js";
import { OracleService } from "./oracle.js";

export interface LaunchOptions {
  oracleType?: "admin" | "pyth";
  metadata?: Record<string, unknown>;
}

export class MarketLifecycleManager {
  private readonly crankService: CrankService;
  private readonly oracleService: OracleService;

  constructor(crankService: CrankService, oracleService: OracleService) {
    this.crankService = crankService;
    this.oracleService = oracleService;
  }

  /**
   * Full launch flow: detect pool → discover market → register → start services
   * Note: actual market initialization tx should be done via CLI or frontend.
   * This discovers and registers already-initialized markets.
   */
  async launchMarket(
    mint: string,
    options: LaunchOptions = {},
  ): Promise<{ market: DiscoveredMarket | null; registered: boolean }> {
    const connection = getConnection();
    const programId = new PublicKey(config.programId);

    // Discover all markets and find the one matching this mint
    const markets = await discoverMarkets(connection, programId);
    const mintPubkey = new PublicKey(mint);
    const found = markets.find((m) => m.config.collateralMint.equals(mintPubkey));

    if (!found) {
      return { market: null, registered: false };
    }

    const slabAddress = found.slabAddress.toBase58();

    eventBus.publish("market.created", slabAddress, {
      mint,
      oracleType: options.oracleType ?? "admin",
      metadata: options.metadata,
    });

    // Re-discover to update crank service state
    await this.crankService.discover();

    return { market: found, registered: true };
  }

  /**
   * Register an existing market by slab address
   */
  async registerMarket(
    slabAddress: string,
    metadata: Record<string, unknown> = {},
  ): Promise<boolean> {
    eventBus.publish("market.created", slabAddress, { metadata });
    await this.crankService.discover();
    return true;
  }

  /**
   * Deregister a market — stop services, mark inactive
   */
  deregisterMarket(slabAddress: string): void {
    eventBus.publish("market.updated", slabAddress, { status: "inactive" });
  }
}
