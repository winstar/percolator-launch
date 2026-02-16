import { Hono } from "hono";
import { getConnection, getSupabase } from "@percolator/shared";

export function healthRoutes(): Hono {
  const app = new Hono();
  
  app.get("/health", async (c) => {
    const checks: Record<string, string> = {};
    
    try {
      const slot = await getConnection().getSlot();
      checks.rpc = `ok (slot: ${slot})`;
    } catch {
      checks.rpc = "error";
    }
    
    try {
      const { count } = await getSupabase().from("markets").select("*", { count: "exact", head: true });
      checks.database = `ok (${count} markets)`;
    } catch {
      checks.database = "error";
    }
    
    const healthy = !Object.values(checks).includes("error");
    return c.json({ status: healthy ? "healthy" : "degraded", service: "api", checks }, healthy ? 200 : 503);
  });
  
  return app;
}
