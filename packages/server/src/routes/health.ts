import { Hono } from "hono";
import { getConnection } from "../utils/solana.js";

const startTime = Date.now();

export function healthRoutes(deps: { crankService: { getStatus: () => Record<string, unknown> } }): Hono {
  const app = new Hono();

  app.get("/health", async (c) => {
    let rpcLatencyMs = -1;
    try {
      const start = Date.now();
      await getConnection().getSlot();
      rpcLatencyMs = Date.now() - start;
    } catch {
      rpcLatencyMs = -1;
    }

    const crankStatus = deps.crankService.getStatus();
    return c.json({
      status: "ok",
      uptimeMs: Date.now() - startTime,
      rpcLatencyMs,
      connectedMarkets: Object.keys(crankStatus).length,
      crankStatus,
    });
  });

  return app;
}
