"use client";

import { FC, useRef, useEffect } from "react";
import gsap from "gsap";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import {
  computeEstimatedEntryPrice,
  computeTradingFee,
  computePreTradeLiqPrice,
} from "@/lib/trading";
import { formatUsd, formatTokenAmount } from "@/lib/format";

interface PreTradeSummaryProps {
  oracleE6: bigint;
  margin: bigint;
  positionSize: bigint;
  direction: "long" | "short";
  leverage: number;
  tradingFeeBps: bigint;
  maintenanceMarginBps: bigint;
  symbol: string;
}

function SummaryRow({
  label,
  value,
  valueClass = "text-[var(--text)]",
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-[var(--text-muted)]">{label}</span>
      <span className={`font-mono font-medium ${valueClass}`}>{value}</span>
    </div>
  );
}

export const PreTradeSummary: FC<PreTradeSummaryProps> = ({
  oracleE6,
  margin,
  positionSize,
  direction,
  leverage,
  tradingFeeBps,
  maintenanceMarginBps,
  symbol,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const prefersReduced = usePrefersReducedMotion();

  useEffect(() => {
    if (prefersReduced || !containerRef.current) return;
    gsap.fromTo(
      containerRef.current,
      { height: 0, opacity: 0 },
      { height: "auto", opacity: 1, duration: 0.3, ease: "power2.out" },
    );
  }, [prefersReduced]);

  if (oracleE6 === 0n || margin === 0n || positionSize === 0n) return null;

  const estEntry = computeEstimatedEntryPrice(oracleE6, tradingFeeBps, direction);
  const fee = computeTradingFee(positionSize, tradingFeeBps);
  const liqPrice = computePreTradeLiqPrice(
    oracleE6,
    margin,
    positionSize,
    maintenanceMarginBps,
    tradingFeeBps,
    direction,
  );

  const isLong = direction === "long";

  return (
    <div
      ref={containerRef}
      className="mb-4 rounded-sm border border-[var(--border)] bg-[var(--panel-bg)] px-3.5 py-3 text-xs"
    >
      <div className="mb-2 flex items-center gap-2">
        <div className={`h-1.5 w-1.5 rounded-full ${isLong ? "bg-[var(--long)]" : "bg-[var(--short)]"}`} />
        <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
          Order Summary
        </span>
      </div>

      <div className="space-y-0.5 divide-y divide-[var(--border)]">
        <SummaryRow
          label="Direction"
          value={`${isLong ? "Long" : "Short"} ${leverage}x`}
          valueClass={isLong ? "text-[var(--long)]" : "text-[var(--short)]"}
        />
        <SummaryRow label="Est. Entry Price" value={formatUsd(estEntry)} />
        <SummaryRow
          label="Notional Value"
          value={`${formatTokenAmount(positionSize)} ${symbol}`}
        />
        <SummaryRow
          label="Trading Fee"
          value={`${formatTokenAmount(fee)} ${symbol}`}
          valueClass="text-[var(--text-secondary)]"
        />
        <SummaryRow
          label="Margin Required"
          value={`${formatTokenAmount(margin)} ${symbol}`}
        />
        <SummaryRow
          label="Est. Liq Price"
          value={formatUsd(liqPrice)}
          valueClass={isLong ? "text-[var(--short)]" : "text-[var(--long)]"}
        />
      </div>
    </div>
  );
};
