import { PublicKey } from "@solana/web3.js";
import { discoverMarkets, type DiscoveredMarket } from "@percolator/core";
import { config, getConnection, getFallbackConnection } from "@percolator/shared";

export class MarketDiscovery {
  private markets = new Map<string, { market: DiscoveredMarket }>();
  private timer: ReturnType<typeof setInterval> | null = null;
  
  async discover(): Promise<DiscoveredMarket[]> {
    const programIds = config.allProgramIds;
    const conn = getFallbackConnection();
    const all: DiscoveredMarket[] = [];
    
    for (const id of programIds) {
      try {
        const found = await discoverMarkets(conn, new PublicKey(id));
        all.push(...found);
      } catch (e) {
        console.warn(`[MarketDiscovery] Failed on ${id}:`, e);
      }
      await new Promise(r => setTimeout(r, 2000));
    }
    
    for (const market of all) {
      this.markets.set(market.slabAddress.toBase58(), { market });
    }
    
    console.log(`[MarketDiscovery] Found ${all.length} markets`);
    return all;
  }
  
  getMarkets() {
    return this.markets;
  }
  
  start(intervalMs = 60_000) {
    this.discover().catch(console.error);
    this.timer = setInterval(() => this.discover().catch(console.error), intervalMs);
  }
  
  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
