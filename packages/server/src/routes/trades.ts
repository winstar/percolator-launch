import { Hono } from "hono";
import { getRecentTrades, get24hVolume, getGlobalRecentTrades } from "../db/queries.js";

export function tradeRoutes(): Hono {
  const app = new Hono();

  /** Recent trades for a specific market */
  app.get("/markets/:slab/trades", async (c) => {
    const slab = c.req.param("slab");
    const limit = Math.min(Number(c.req.query("limit") ?? 50), 200);

    try {
      const trades = await getRecentTrades(slab, limit);
      return c.json({ trades });
    } catch (err) {
      console.error("[TradeRoutes] Error fetching trades:", err instanceof Error ? err.message : err);
      return c.json({ error: "Failed to fetch trades" }, 500);
    }
  });

  /** 24h volume for a specific market */
  app.get("/markets/:slab/volume", async (c) => {
    const slab = c.req.param("slab");

    try {
      const volume = await get24hVolume(slab);
      return c.json({ slab_address: slab, volume_24h: volume });
    } catch (err) {
      console.error("[TradeRoutes] Error fetching volume:", err instanceof Error ? err.message : err);
      return c.json({ error: "Failed to fetch volume" }, 500);
    }
  });

  /** Global recent trades across all markets */
  app.get("/trades/recent", async (c) => {
    const limit = Math.min(Number(c.req.query("limit") ?? 50), 200);

    try {
      const trades = await getGlobalRecentTrades(limit);
      return c.json({ trades });
    } catch (err) {
      console.error("[TradeRoutes] Error fetching global trades:", err instanceof Error ? err.message : err);
      return c.json({ error: "Failed to fetch trades" }, 500);
    }
  });

  return app;
}
