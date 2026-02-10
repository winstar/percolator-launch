"use client";

import { FC, useMemo, useRef, useEffect } from "react";
import gsap from "gsap";
import { useEngineState } from "@/hooks/useEngineState";
import { useMarketConfig } from "@/hooks/useMarketConfig";
import { useSlabState } from "@/components/providers/SlabProvider";
import { useTokenMeta } from "@/hooks/useTokenMeta";
import { useLivePrice } from "@/hooks/useLivePrice";
import { formatUsd, formatTokenAmount, shortenAddress } from "@/lib/format";
import { AccountKind } from "@percolator/core";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";

export const MarketBookCard: FC = () => {
  const { engine, params, loading } = useEngineState();
  const config = useMarketConfig();
  const { accounts, config: mktConfig } = useSlabState();
  const { priceE6: livePriceE6 } = useLivePrice();
  const tokenMeta = useTokenMeta(mktConfig?.collateralMint ?? null);
  const symbol = tokenMeta?.symbol ?? "Token";
  const prefersReduced = usePrefersReducedMotion();
  const depthBarsRef = useRef<(HTMLDivElement | null)[]>([]);

  const lps = useMemo(
    () => accounts.filter(({ account }) => account.kind === AccountKind.LP),
    [accounts],
  );

  const maxLpCapital = useMemo(
    () =>
      lps.length > 0
        ? lps.reduce((max, { account }) => (account.capital > max ? account.capital : max), 0n)
        : 1n,
    [lps],
  );

  useEffect(() => {
    if (prefersReduced || lps.length === 0) return;
    const bars = depthBarsRef.current.filter(Boolean) as HTMLDivElement[];
    if (bars.length === 0) return;

    // Store each bar's target width, then set to 0 before animating
    const targets = bars.map((bar) => {
      const target = bar.style.width;
      bar.style.width = "0%";
      return target;
    });

    bars.forEach((bar, i) => {
      gsap.to(bar, {
        width: targets[i],
        duration: 0.5,
        ease: "power2.out",
        delay: i * 0.05,
      });
    });
  }, [lps, prefersReduced, maxLpCapital]);

  if (loading || !engine || !config || !params) {
    return (
      <div className="p-4">
        <p className="text-sm text-[var(--text-secondary)]">{loading ? "Loading..." : "--"}</p>
      </div>
    );
  }

  const oraclePrice = livePriceE6 ?? config.lastEffectivePriceE6;
  const feeBps = Number(params.tradingFeeBps);
  const bestBid = oraclePrice > 0n ? Number(oraclePrice) * (1 - feeBps / 10000) : 0;
  const bestAsk = oraclePrice > 0n ? Number(oraclePrice) * (1 + feeBps / 10000) : 0;
  const lpTotalCapital = lps.reduce((sum, { account }) => sum + account.capital, 0n);

  return (
    <div className="p-4">
      {/* Price ladder */}
      <div className="mb-4 grid grid-cols-3 gap-px overflow-hidden rounded-sm bg-[var(--border)]">
        <div className="bg-[var(--bg)] p-3 text-center hover:bg-[var(--accent)]/[0.06] transition-colors duration-150">
          <p className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">Bid</p>
          <p className="data-cell text-sm font-medium text-[var(--long)]">${(bestBid / 1_000_000).toFixed(6)}</p>
        </div>
        <div className="bg-[var(--bg)] p-3 text-center hover:bg-[var(--accent)]/[0.06] transition-colors duration-150">
          <p className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">Oracle</p>
          <p className="data-cell text-sm font-medium text-[var(--text)]">{formatUsd(oraclePrice)}</p>
        </div>
        <div className="bg-[var(--bg)] p-3 text-center hover:bg-[var(--accent)]/[0.06] transition-colors duration-150">
          <p className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">Ask</p>
          <p className="data-cell text-sm font-medium text-[var(--short)]">${(bestAsk / 1_000_000).toFixed(6)}</p>
        </div>
      </div>

      {/* Depth bars */}
      <div className="mb-4 grid grid-cols-2 gap-2">
        <div className="rounded-sm bg-[var(--long)]/5 p-2.5 text-center ring-1 ring-[var(--long)]/10">
          <p className="text-[10px] uppercase tracking-wider text-[var(--long)]/60">Bid Depth</p>
          <p className="data-cell text-sm font-semibold text-[var(--long)]">{formatTokenAmount(lpTotalCapital)}</p>
        </div>
        <div className="rounded-sm bg-[var(--short)]/5 p-2.5 text-center ring-1 ring-[var(--short)]/10">
          <p className="text-[10px] uppercase tracking-wider text-[var(--short)]/60">Ask Depth</p>
          <p className="data-cell text-sm font-semibold text-[var(--short)]">{formatTokenAmount(lpTotalCapital)}</p>
        </div>
      </div>

      {/* LP table */}
      {lps.length > 0 && (
        <div>
          <div className="mb-1 flex text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
            <span className="w-6">#</span>
            <span className="flex-1">LP</span>
            <span className="w-24 text-right">Capital</span>
            <span className="w-24 text-right">Net Pos</span>
            <span className="w-20" />
          </div>
          {lps.map(({ idx, account }, i) => {
            const pct = maxLpCapital > 0n ? Number(account.capital * 100n / maxLpCapital) : 0;
            return (
              <div key={idx} className="flex items-center border-t border-[var(--border-subtle)] py-1.5 text-[11px] hover:bg-[var(--accent)]/[0.06] transition-colors duration-150">
                <span className="w-6 text-[var(--text-muted)]">{i + 1}</span>
                <span className="data-cell flex-1 text-[var(--text-secondary)]">{shortenAddress(account.owner.toBase58())}</span>
                <span className="data-cell w-24 text-right text-[var(--text)]">{formatTokenAmount(account.capital)}</span>
                <span className={`data-cell w-24 text-right ${account.positionSize >= 0n ? "text-[var(--long)]" : "text-[var(--short)]"}`}>
                  {formatTokenAmount(account.positionSize < 0n ? -account.positionSize : account.positionSize)}
                </span>
                <span className="w-20 pl-3">
                  <div className="h-1 rounded-full bg-[var(--border)]">
                    <div
                      ref={(el) => { depthBarsRef.current[i] = el; }}
                      className="h-1 rounded-full bg-[var(--long)]/50"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
