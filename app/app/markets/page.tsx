"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { MarketWithStats } from "@/lib/supabase";
import { supabase } from "@/lib/supabase";

function formatNum(n: number | null | undefined, decimals = 2): string {
  if (n === null || n === undefined) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(decimals)}`;
}

function formatPrice(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  if (n < 0.01) return `$${n.toFixed(6)}`;
  if (n < 1) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

export default function MarketsPage() {
  const [markets, setMarkets] = useState<MarketWithStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("markets_with_stats")
        .select("*");
      setMarkets(data || []);
      setLoading(false);
    }
    load();

    // Real-time updates
    const channel = supabase
      .channel("markets-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "markets" }, () => {
        load();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "market_stats" }, () => {
        load();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  return (
    <div className="mx-auto max-w-7xl px-4 py-12">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Markets</h1>
          <p className="mt-1 text-slate-400">Perpetual futures for any Solana token</p>
        </div>
        <Link
          href="/launch"
          className="rounded-xl bg-emerald-500 px-6 py-2.5 font-semibold text-white transition-colors hover:bg-emerald-400"
        >
          + Launch Market
        </Link>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl border border-[#1e2433] bg-[#111318]" />
          ))}
        </div>
      ) : markets.length === 0 ? (
        <div className="rounded-2xl border border-[#1e2433] bg-[#111318] p-16 text-center">
          <div className="mb-4 text-5xl">🚀</div>
          <h3 className="mb-2 text-xl font-semibold text-white">No markets yet</h3>
          <p className="mb-6 text-slate-400">Be the first to launch a perpetual futures market.</p>
          <Link
            href="/launch"
            className="inline-block rounded-xl bg-emerald-500 px-8 py-3 font-semibold text-white hover:bg-emerald-400"
          >
            Launch First Market
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[#1e2433]">
          {/* Header */}
          <div className="grid grid-cols-7 gap-4 border-b border-[#1e2433] bg-[#0a0b0f] px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">
            <div className="col-span-2">Market</div>
            <div className="text-right">Price</div>
            <div className="text-right">24h Volume</div>
            <div className="text-right">Open Interest</div>
            <div className="text-right">Insurance</div>
            <div className="text-right">Leverage</div>
          </div>

          {/* Rows */}
          {markets.map((m) => (
            <Link
              key={m.slab_address}
              href={`/trade/${m.slab_address}`}
              className="grid grid-cols-7 gap-4 border-b border-[#1e2433] bg-[#111318] px-6 py-4 transition-colors hover:bg-[#1a1d24]"
            >
              <div className="col-span-2">
                <div className="font-semibold text-white">{m.symbol}/USD</div>
                <div className="text-xs text-slate-500">{m.name}</div>
              </div>
              <div className="text-right">
                <div className="font-mono text-white">{formatPrice(m.last_price)}</div>
              </div>
              <div className="text-right">
                <div className="font-mono text-slate-300">{formatNum(m.volume_24h)}</div>
              </div>
              <div className="text-right">
                <div className="font-mono text-slate-300">
                  {formatNum((m.open_interest_long || 0) + (m.open_interest_short || 0))}
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono text-emerald-400">{formatNum(m.insurance_fund)}</div>
              </div>
              <div className="text-right">
                <div className="text-slate-300">{m.max_leverage}x</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
