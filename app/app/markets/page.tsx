"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { getStoredMarkets, type MarketInfo } from "@/lib/markets";
import { shortenAddress } from "@/lib/format";

export default function MarketsPage() {
  const [markets, setMarkets] = useState<MarketInfo[]>([]);

  useEffect(() => {
    setMarkets(getStoredMarkets());
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Markets</h1>
          <p className="mt-1 text-slate-400">Browse deployed perpetual futures markets</p>
        </div>
        <Link
          href="/launch"
          className="rounded-xl bg-emerald-500 px-6 py-2.5 text-sm font-semibold text-white hover:bg-emerald-400"
        >
          + Launch New
        </Link>
      </div>

      {markets.length === 0 ? (
        <div className="rounded-2xl border border-[#1e2433] bg-[#111318] p-16 text-center">
          <p className="mb-2 text-lg text-slate-400">No markets found</p>
          <p className="mb-6 text-sm text-slate-500">
            Markets you deploy will appear here. You can also scan on-chain for all markets.
          </p>
          <Link
            href="/launch"
            className="inline-block rounded-xl bg-emerald-500 px-6 py-3 font-semibold text-white hover:bg-emerald-400"
          >
            🚀 Launch the First Market
          </Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {/* Header */}
          <div className="grid grid-cols-6 gap-4 px-4 text-xs font-medium uppercase text-slate-500">
            <span>Token</span>
            <span>Market Address</span>
            <span>Mint</span>
            <span>Deployer</span>
            <span>Created</span>
            <span></span>
          </div>
          {markets.map((m) => (
            <div
              key={m.slab}
              className="grid grid-cols-6 items-center gap-4 rounded-xl border border-[#1e2433] bg-[#111318] p-4 transition-colors hover:border-emerald-500/30"
            >
              <div>
                <p className="font-semibold text-white">{m.symbol}</p>
                <p className="text-xs text-slate-500">{m.name}</p>
              </div>
              <p className="font-mono text-xs text-slate-400">{shortenAddress(m.slab, 6)}</p>
              <p className="font-mono text-xs text-slate-400">{shortenAddress(m.mint, 6)}</p>
              <p className="font-mono text-xs text-slate-400">{shortenAddress(m.deployer, 4)}</p>
              <p className="text-xs text-slate-500">{new Date(m.createdAt).toLocaleDateString()}</p>
              <Link
                href={`/trade/${m.slab}`}
                className="rounded-lg bg-emerald-500/10 px-4 py-2 text-center text-sm font-medium text-emerald-400 hover:bg-emerald-500/20"
              >
                Trade
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
