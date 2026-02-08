import { Hono } from "hono";
import { PublicKey } from "@solana/web3.js";
import { fetchSlab, parseHeader, parseConfig, parseEngine } from "@percolator/core";
import { getConnection } from "../utils/solana.js";
import type { CrankService } from "../services/crank.js";
import type { MarketLifecycleManager, LaunchOptions } from "../services/lifecycle.js";

interface MarketDeps {
  crankService: CrankService;
  lifecycleManager: MarketLifecycleManager;
}

export function marketRoutes(deps: MarketDeps): Hono {
  const app = new Hono();

  // GET /markets — list all discovered markets with stats
  app.get("/markets", (c) => {
    const markets = deps.crankService.getMarkets();
    const result = Array.from(markets.entries()).map(([key, state]) => ({
      slabAddress: key,
      admin: state.market.header.admin.toBase58(),
      mint: state.market.config.collateralMint.toBase58(),
      lastCrankTime: state.lastCrankTime,
      successCount: state.successCount,
      failureCount: state.failureCount,
    }));
    return c.json({ markets: result });
  });

  // GET /markets/:slab — single market details
  app.get("/markets/:slab", async (c) => {
    const slab = c.req.param("slab");
    try {
      const connection = getConnection();
      const slabPubkey = new PublicKey(slab);
      const data = await fetchSlab(connection, slabPubkey);
      const header = parseHeader(data);
      const cfg = parseConfig(data);
      const engine = parseEngine(data);

      return c.json({
        slabAddress: slab,
        header: {
          magic: header.magic.toString(),
          version: header.version,
          admin: header.admin.toBase58(),
          resolved: header.resolved,
        },
        config: {
          collateralMint: cfg.collateralMint.toBase58(),
          vault: cfg.vaultPubkey.toBase58(),
          oracleAuthority: cfg.oracleAuthority.toBase58(),
          authorityPriceE6: cfg.authorityPriceE6.toString(),
        },
        engine: {
          vault: engine.vault.toString(),
          totalOpenInterest: engine.totalOpenInterest.toString(),
          numUsedAccounts: engine.numUsedAccounts,
          lastCrankSlot: engine.lastCrankSlot.toString(),
        },
      });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "Unknown error" }, 400);
    }
  });

  // POST /markets — register an existing market
  app.post("/markets", async (c) => {
    const body = await c.req.json<{ slabAddress: string; metadata?: Record<string, unknown> }>();
    const ok = await deps.lifecycleManager.registerMarket(body.slabAddress, body.metadata ?? {});
    return c.json({ registered: ok });
  });

  // POST /markets/launch — one-click launch
  app.post("/markets/launch", async (c) => {
    const body = await c.req.json<{ mint: string; options?: LaunchOptions }>();
    const result = await deps.lifecycleManager.launchMarket(body.mint, body.options ?? {});
    if (!result.market) {
      return c.json({ error: "Market not found for mint" }, 404);
    }
    return c.json({
      slabAddress: result.market.slabAddress.toBase58(),
      registered: result.registered,
    });
  });

  return app;
}
