import { Hono } from "hono";
import type { OracleService } from "../services/oracle.js";

export function priceRoutes(deps: { oracleService: OracleService }): Hono {
  const app = new Hono();

  // GET /prices/:slab — current price
  app.get("/prices/:slab", (c) => {
    const slab = c.req.param("slab");
    const price = deps.oracleService.getCurrentPrice(slab);
    if (!price) {
      return c.json({ error: "No price available" }, 404);
    }
    return c.json({
      slabAddress: slab,
      priceE6: price.priceE6.toString(),
      source: price.source,
      timestamp: price.timestamp,
    });
  });

  // GET /prices/:slab/history — price history (in-memory)
  app.get("/prices/:slab/history", (c) => {
    const slab = c.req.param("slab");
    const history = deps.oracleService.getPriceHistory(slab);
    return c.json({
      slabAddress: slab,
      prices: history.map((p) => ({
        priceE6: p.priceE6.toString(),
        source: p.source,
        timestamp: p.timestamp,
      })),
    });
  });

  return app;
}
