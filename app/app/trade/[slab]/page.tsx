"use client";

import { use, useState, useRef, useEffect } from "react";
import gsap from "gsap";
import { SlabProvider, useSlabState } from "@/components/providers/SlabProvider";
import { TradeForm } from "@/components/trade/TradeForm";
import { PositionPanel } from "@/components/trade/PositionPanel";
import { AccountsCard } from "@/components/trade/AccountsCard";
import { DepositWithdrawCard } from "@/components/trade/DepositWithdrawCard";
import { EngineHealthCard } from "@/components/trade/EngineHealthCard";
import { MarketStatsCard } from "@/components/trade/MarketStatsCard";
import { MarketBookCard } from "@/components/trade/MarketBookCard";
import { PriceChart } from "@/components/trade/PriceChart";
import { HealthBadge } from "@/components/market/HealthBadge";
import { ShareButton } from "@/components/market/ShareCard";
import { GlassCard } from "@/components/ui/GlassCard";
import { computeMarketHealth } from "@/lib/health";
import { useLivePrice } from "@/hooks/useLivePrice";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";

function Collapsible({ title, defaultOpen = true, badge, children }: { title: string; defaultOpen?: boolean; badge?: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  const contentRef = useRef<HTMLDivElement>(null);
  const prefersReduced = usePrefersReducedMotion();

  useEffect(() => {
    const el = contentRef.current;
    if (!el || prefersReduced) {
      if (el) el.style.display = open ? "block" : "none";
      return;
    }

    if (open) {
      el.style.display = "block";
      gsap.fromTo(el, { height: 0, opacity: 0 }, { height: "auto", opacity: 1, duration: 0.3, ease: "power2.out" });
    } else {
      gsap.to(el, { height: 0, opacity: 0, duration: 0.2, ease: "power2.in", onComplete: () => { el.style.display = "none"; } });
    }
  }, [open, prefersReduced]);

  return (
    <GlassCard hover={false} padding="none">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-5 py-4 text-left text-sm font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text)]"
      >
        <span className="flex items-center gap-2">
          {title}
          {badge}
        </span>
        <span className={`text-xs text-[var(--text-dim)] transition-transform duration-200 ${open ? "rotate-180" : ""}`}>v</span>
      </button>
      <div ref={contentRef} className="overflow-hidden" style={{ display: defaultOpen ? "block" : "none" }}>
        {children}
      </div>
    </GlassCard>
  );
}

function TradePageInner({ slab }: { slab: string }) {
  const { engine } = useSlabState();
  const { priceUsd } = useLivePrice();
  const health = engine ? computeMarketHealth(engine) : null;
  const prefersReduced = usePrefersReducedMotion();
  const leftColRef = useRef<HTMLDivElement>(null);
  const rightColRef = useRef<HTMLDivElement>(null);

  // Card stagger on mount
  useEffect(() => {
    if (prefersReduced) return;
    if (leftColRef.current) {
      gsap.fromTo(
        leftColRef.current.children,
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.5, stagger: 0.1, ease: "power2.out" }
      );
    }
    if (rightColRef.current) {
      gsap.fromTo(
        rightColRef.current.children,
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.5, stagger: 0.1, delay: 0.15, ease: "power2.out" }
      );
    }
  }, [prefersReduced]);

  return (
    <div className="relative mx-auto max-w-7xl px-4 py-6">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-white" style={{ fontFamily: "var(--font-space-grotesk)" }}>trade</h1>
          <p className="truncate text-[11px] text-[var(--text-dim)]" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>{slab}</p>
        </div>
        <div className="ml-auto flex items-center gap-4">
          {health && <HealthBadge level={health.level} />}
          <ShareButton
            slabAddress={slab}
            marketName="TOKEN"
            price={BigInt(Math.round((priceUsd ?? 0) * 1e6))}
          />
          {priceUsd != null && (
            <div className="text-right">
              <div className="text-3xl font-bold text-white" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>
                ${priceUsd < 0.01 ? priceUsd.toFixed(6) : priceUsd < 1 ? priceUsd.toFixed(4) : priceUsd.toFixed(2)}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main grid */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Left column */}
        <div ref={leftColRef} className="space-y-4 lg:col-span-2">
          <GlassCard hover={false} padding="none">
            <PriceChart slabAddress={slab} />
          </GlassCard>
          <GlassCard hover={false} padding="none">
            <TradeForm slabAddress={slab} />
          </GlassCard>
          <GlassCard hover={false} padding="none">
            <PositionPanel slabAddress={slab} />
          </GlassCard>
        </div>

        {/* Right column */}
        <div ref={rightColRef} className="space-y-4">
          <GlassCard hover={false} padding="none">
            <AccountsCard />
          </GlassCard>
          <GlassCard hover={false} padding="none">
            <DepositWithdrawCard slabAddress={slab} />
          </GlassCard>
          <Collapsible title="engine health" defaultOpen={false} badge={health && <HealthBadge level={health.level} />}>
            <EngineHealthCard />
          </Collapsible>
          <GlassCard hover={false} padding="none">
            <MarketStatsCard />
          </GlassCard>
        </div>
      </div>

      {/* Full-width */}
      <div className="mt-4">
        <Collapsible title="market book" defaultOpen={false}>
          <MarketBookCard />
        </Collapsible>
      </div>
    </div>
  );
}

export default function TradePage({ params }: { params: Promise<{ slab: string }> }) {
  const { slab } = use(params);

  return (
    <SlabProvider slabAddress={slab}>
      <TradePageInner slab={slab} />
    </SlabProvider>
  );
}
