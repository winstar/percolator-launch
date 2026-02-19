import { NextResponse } from "next/server";
import { getBackendUrl } from "@/lib/config";
import * as Sentry from "@sentry/nextjs";

export const dynamic = "force-dynamic";

/**
 * GET /api/prices/markets
 *
 * Proxies the backend /prices/markets endpoint and transforms the response
 * into the map format expected by useTrade.ts and useWithdraw.ts:
 *
 *   { [slabAddress]: { priceE6: string } }
 *
 * Backend returns: { markets: [{ slab_address, last_price, mark_price, ... }] }
 * where last_price is in USD (e.g. 100.50). We convert to e6 integer strings.
 */
export async function GET() {
  try {
    const backendUrl = getBackendUrl();
    const res = await fetch(`${backendUrl}/prices/markets`, {
      headers: { "Content-Type": "application/json" },
      // Short timeout — this is called inline during trades
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Backend returned ${res.status}` },
        { status: res.status }
      );
    }

    const data = await res.json() as {
      markets?: Array<{
        slab_address: string;
        last_price: number | null;
        mark_price: number | null;
        index_price: number | null;
      }>;
    };

    // Transform array → map keyed by slab address
    // Prefer mark_price (real-time) over last_price (indexed), fall back to index_price
    const result: Record<string, { priceE6: string }> = {};
    for (const market of data.markets ?? []) {
      const usdPrice = market.mark_price ?? market.last_price ?? market.index_price;
      if (usdPrice != null && usdPrice > 0) {
        // Convert USD float → e6 integer string (e.g. 100.5 → "100500000")
        const priceE6 = Math.round(usdPrice * 1_000_000).toString();
        result[market.slab_address] = { priceE6 };
      }
    }

    return NextResponse.json(result);
  } catch (err) {
    Sentry.captureException(err, { tags: { endpoint: "/api/prices/markets" } });
    return NextResponse.json({ error: "Failed to fetch prices" }, { status: 502 });
  }
}
