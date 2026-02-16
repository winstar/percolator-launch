import { Hono } from "hono";
import { PublicKey } from "@solana/web3.js";
import { validateSlab } from "../middleware/validateSlab.js";
import { fetchSlab, parseHeader, parseConfig, parseEngine } from "@percolator/core";
import { getConnection, getSupabase } from "@percolator/shared";

export function marketRoutes(): Hono {
  const app = new Hono();

  // GET /markets — list all markets from Supabase
  app.get("/markets", async (c) => {
    try {
      // Fetch from markets table joined with market_stats
      const { data: markets, error: marketsError } = await getSupabase()
        .from("markets")
        .select("*");

      if (marketsError) throw marketsError;

      const { data: stats, error: statsError } = await getSupabase()
        .from("market_stats")
        .select("*");

      if (statsError) throw statsError;

      // Merge markets with their stats
      const statsMap = new Map((stats ?? []).map((s) => [s.slab_address, s]));
      const result = (markets ?? []).map((m) => {
        const s = statsMap.get(m.slab_address);
        return {
          slabAddress: m.slab_address,
          mintAddress: m.mint_address,
          symbol: m.symbol,
          name: m.name,
          decimals: m.decimals,
          deployer: m.deployer,
          oracleAuthority: m.oracle_authority,
          initialPriceE6: m.initial_price_e6,
          maxLeverage: m.max_leverage,
          tradingFeeBps: m.trading_fee_bps,
          lpCollateral: m.lp_collateral,
          matcherContext: m.matcher_context,
          status: m.status,
          logoUrl: m.logo_url,
          createdAt: m.created_at,
          updatedAt: m.updated_at,
          // Include stats if available
          totalOpenInterest: s?.total_open_interest ?? null,
          totalAccounts: s?.total_accounts ?? null,
          lastCrankSlot: s?.last_crank_slot ?? null,
          lastPrice: s?.last_price ?? null,
          markPrice: s?.mark_price ?? null,
          indexPrice: s?.index_price ?? null,
          fundingRate: s?.funding_rate ?? null,
          netLpPos: s?.net_lp_pos ?? null,
        };
      });

      return c.json({ markets: result });
    } catch (err) {
      console.error("[Markets API] Error fetching markets:", err);
      return c.json({ error: "Failed to fetch markets" }, 500);
    }
  });

  // GET /markets/stats — all market stats from DB
  app.get("/markets/stats", async (c) => {
    try {
      const { data, error } = await getSupabase().from("market_stats").select("*");
      if (error) throw error;
      return c.json({ stats: data ?? [] });
    } catch (err) {
      return c.json({ error: "Failed to fetch market stats" }, 500);
    }
  });

  // GET /markets/:slab/stats — single market stats from DB
  app.get("/markets/:slab/stats", validateSlab, async (c) => {
    const slab = c.req.param("slab");
    try {
      const { data, error } = await getSupabase()
        .from("market_stats")
        .select("*")
        .eq("slab_address", slab)
        .single();
      if (error && error.code !== "PGRST116") throw error;
      return c.json({ stats: data ?? null });
    } catch (err) {
      return c.json({ error: "Failed to fetch market stats" }, 500);
    }
  });

  // GET /markets/:slab — single market details (on-chain read)
  app.get("/markets/:slab", validateSlab, async (c) => {
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

  return app;
}
