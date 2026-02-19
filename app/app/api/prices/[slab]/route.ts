import { NextRequest, NextResponse } from "next/server";
import { getBackendUrl } from "@/lib/config";
import * as Sentry from "@sentry/nextjs";

export const dynamic = "force-dynamic";

/**
 * GET /api/prices/[slab]
 *
 * Proxies the backend /prices/:slab endpoint and transforms the response
 * into the stats shape expected by useLivePrice.ts:
 *
 *   { stats?: { change24h?: number; high24h?: string; low24h?: string } }
 *
 * Backend returns: { prices: [{ price_e6: string, timestamp: number }] }
 * sorted descending by timestamp, up to 100 entries (oracle price history).
 *
 * We compute 24h stats from the history:
 *  - high24h / low24h: max/min price_e6 in the window
 *  - change24h: % change from oldest entry in window vs latest
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slab: string }> }
) {
  try {
    const { slab } = await params;
    const backendUrl = getBackendUrl();

    const res = await fetch(`${backendUrl}/prices/${slab}`, {
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Backend returned ${res.status}` },
        { status: res.status }
      );
    }

    const data = await res.json() as {
      prices?: Array<{ price_e6: string; timestamp: number }>;
    };

    const prices = data.prices ?? [];
    if (prices.length === 0) {
      return NextResponse.json({ stats: null });
    }

    // Prices are sorted desc (newest first). Find entries within last 24h.
    const nowSec = Math.floor(Date.now() / 1000);
    const cutoff24h = nowSec - 86_400;

    const window = prices.filter((p) => p.timestamp >= cutoff24h);
    const all = window.length > 0 ? window : prices; // fall back to all if window empty

    const values = all.map((p) => BigInt(p.price_e6));
    const latest = values[0];                              // newest (sorted desc)
    const oldest = values[values.length - 1];              // oldest in window

    let high = values[0];
    let low = values[0];
    for (const v of values) {
      if (v > high) high = v;
      if (v < low) low = v;
    }

    // change24h as percentage
    const change24h =
      oldest > 0n
        ? (Number(latest - oldest) / Number(oldest)) * 100
        : 0;

    return NextResponse.json({
      stats: {
        change24h,
        high24h: high.toString(),
        low24h: low.toString(),
      },
    });
  } catch (err) {
    Sentry.captureException(err, { tags: { endpoint: "/api/prices/[slab]" } });
    return NextResponse.json({ error: "Failed to fetch price stats" }, { status: 502 });
  }
}
