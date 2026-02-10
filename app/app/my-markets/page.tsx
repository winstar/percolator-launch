"use client";

import { FC, useState, useEffect, useRef } from "react";
import Link from "next/link";
import gsap from "gsap";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useMyMarkets, type MyMarket } from "@/hooks/useMyMarkets";
import { useAdminActions } from "@/hooks/useAdminActions";
import { useToast } from "@/hooks/useToast";
import { GlassCard } from "@/components/ui/GlassCard";
import { GlowButton } from "@/components/ui/GlowButton";
import { ShimmerSkeleton } from "@/components/ui/ShimmerSkeleton";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { getConfig, explorerAccountUrl } from "@/lib/config";
import { deriveInsuranceLpMint } from "@percolator/core";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";

/* helpers */
function fmt(v: bigint, decimals = 6): string {
  const n = Number(v) / 10 ** decimals;
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function fmtPrice(v: bigint): string {
  const n = Number(v) / 1e6;
  return "$" + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 });
}

function shortAddr(addr: string): string {
  return addr.slice(0, 6) + "..." + addr.slice(-4);
}

function timeAgo(slot: bigint, currentSlot: bigint): string {
  const diff = Number(currentSlot - slot);
  if (diff < 0) return "just now";
  const secs = Math.floor(diff * 0.4);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

/* confirm dialog */
const ConfirmDialog: FC<{
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}> = ({ open, title, description, confirmLabel, onConfirm, onCancel, danger }) => {
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const prefersReduced = usePrefersReducedMotion();

  useEffect(() => {
    if (!open) return;
    if (prefersReduced) return;
    if (overlayRef.current) gsap.fromTo(overlayRef.current, { opacity: 0 }, { opacity: 1, duration: 0.2 });
    if (dialogRef.current) gsap.fromTo(dialogRef.current, { scale: 0.95, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.3, ease: "power2.out" });
  }, [open, prefersReduced]);

  if (!open) return null;
  return (
    <div ref={overlayRef} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div ref={dialogRef} className="mx-4 max-w-md rounded-sm border border-[var(--border)] bg-[var(--bg-elevated)] p-8">
        <h3 className="text-lg font-bold text-white">{title}</h3>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">{description}</p>
        <div className="mt-6 flex gap-3">
          <GlowButton variant="ghost" size="sm" onClick={onCancel}>cancel</GlowButton>
          <GlowButton
            variant={danger ? "secondary" : "primary"}
            size="sm"
            onClick={onConfirm}
            className={danger ? "!border-[var(--short)]/30 !text-[var(--short)] hover:!bg-[var(--short)]/10" : ""}
          >
            {confirmLabel}
          </GlowButton>
        </div>
      </div>
    </div>
  );
};

/* input dialog */
const InputDialog: FC<{
  open: boolean;
  title: string;
  description: string;
  placeholder: string;
  confirmLabel: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}> = ({ open, title, description, placeholder, confirmLabel, onConfirm, onCancel }) => {
  const [value, setValue] = useState("");
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const prefersReduced = usePrefersReducedMotion();

  useEffect(() => {
    if (!open) return;
    if (prefersReduced) return;
    if (overlayRef.current) gsap.fromTo(overlayRef.current, { opacity: 0 }, { opacity: 1, duration: 0.2 });
    if (dialogRef.current) gsap.fromTo(dialogRef.current, { scale: 0.95, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.3, ease: "power2.out" });
  }, [open, prefersReduced]);

  if (!open) return null;
  return (
    <div ref={overlayRef} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div ref={dialogRef} className="mx-4 max-w-md w-full rounded-sm border border-[var(--border)] bg-[var(--bg-elevated)] p-8">
        <h3 className="text-lg font-bold text-white">{title}</h3>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">{description}</p>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          className="mt-4 w-full rounded-sm border border-[var(--border)] bg-[var(--bg)] px-4 py-2.5 text-sm text-white placeholder-[var(--text-dim)] outline-none focus:border-[var(--accent)]/40"
        />
        <div className="mt-4 flex gap-3">
          <GlowButton variant="ghost" size="sm" onClick={onCancel}>cancel</GlowButton>
          <GlowButton
            variant="primary"
            size="sm"
            disabled={!value.trim()}
            onClick={() => { onConfirm(value.trim()); setValue(""); }}
          >
            {confirmLabel}
          </GlowButton>
        </div>
      </div>
    </div>
  );
};

/* market card */
const MarketCard: FC<{
  market: MyMarket;
  insuranceMintExists: boolean;
}> = ({ market, insuranceMintExists }) => {
  const { toast } = useToast();
  const actions = useAdminActions();
  const cfg = getConfig();

  const slab = market.slabAddress.toBase58();
  const oi = market.engine.totalOpenInterest;
  const vault = market.engine.vault;
  const insurance = market.engine.insuranceFund.balance;
  const lastCrank = market.engine.lastCrankSlot;
  const currentSlot = market.engine.currentSlot;
  const staleness = Number(currentSlot - lastCrank);
  const healthy = staleness < Number(market.engine.maxCrankStalenessSlots);
  const oraclePrice = market.config.authorityPriceE6;
  const oracleAuthority = market.config.oracleAuthority.toBase58();
  const hasOracleAuthority = oracleAuthority !== PublicKey.default.toBase58();

  const [showBurnConfirm, setShowBurnConfirm] = useState(false);
  const [showOracleInput, setShowOracleInput] = useState(false);
  const [showPriceInput, setShowPriceInput] = useState(false);
  const [showTopUpInput, setShowTopUpInput] = useState(false);

  async function handleAction(name: string, fn: () => Promise<string>) {
    try {
      const sig = await fn();
      toast(`${name} successful! Tx: ${sig.slice(0, 16)}...`, "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : `${name} failed`, "error");
    }
  }

  return (
    <>
      <GlassCard hover glow padding="none">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] p-5">
          <div>
            <p className="font-semibold text-white">{market.label}</p>
            <a
              href={explorerAccountUrl(slab)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors"
            >
              {shortAddr(slab)} &rarr;
            </a>
          </div>
          <span className={`text-xs font-bold ${healthy ? "text-[var(--long)]" : "text-[var(--short)]"}`}>
            {healthy ? "healthy" : "stale"}
          </span>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-px sm:grid-cols-4">
          {[
            { label: "oracle price", value: oraclePrice > 0n ? fmtPrice(oraclePrice) : "N/A" },
            { label: "open interest", value: fmt(oi) },
            { label: "vault balance", value: fmt(vault) },
            { label: "insurance", value: fmt(insurance) },
            { label: "last crank", value: timeAgo(lastCrank, currentSlot) },
            { label: "staleness", value: `${staleness} slots` },
            { label: "oracle authority", value: hasOracleAuthority ? shortAddr(oracleAuthority) : "none" },
            { label: "active accounts", value: market.engine.numUsedAccounts.toString() },
          ].map((s) => (
            <div key={s.label} className="border-t border-[var(--border)] p-4 transition-colors hover:bg-[var(--accent)]/[0.04]">
              <p className="text-[10px] uppercase tracking-wider text-[var(--text-dim)]">{s.label}</p>
              <p className="mt-1 text-sm text-white" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2 border-t border-[var(--border)] p-5">
          <button onClick={() => setShowOracleInput(true)} disabled={actions.loading === "setOracleAuthority"} className="text-xs text-[var(--text-secondary)] hover:text-[var(--text)] transition-colors disabled:opacity-40">
            set oracle authority
          </button>
          <button onClick={() => setShowPriceInput(true)} disabled={actions.loading === "pushPrice"} className="text-xs text-[var(--text-secondary)] hover:text-[var(--text)] transition-colors disabled:opacity-40">
            push price
          </button>
          <button onClick={() => setShowTopUpInput(true)} disabled={actions.loading === "topUpInsurance"} className="text-xs text-[var(--text-secondary)] hover:text-[var(--text)] transition-colors disabled:opacity-40">
            top up insurance
          </button>
          {!insuranceMintExists && (
            <button
              onClick={() => handleAction("Create Insurance Mint", () => actions.createInsuranceMint(market))}
              disabled={actions.loading === "createInsuranceMint"}
              className="text-xs text-[var(--text-secondary)] hover:text-[var(--text)] transition-colors disabled:opacity-40"
            >
              {actions.loading === "createInsuranceMint" ? "creating..." : "create insurance mint"}
            </button>
          )}
          <button
            onClick={() => setShowBurnConfirm(true)}
            disabled={actions.loading === "renounceAdmin"}
            className="text-xs text-[var(--short)]/70 hover:text-[var(--short)] transition-colors disabled:opacity-40"
          >
            burn admin key
          </button>
          <Link href={`/trade/${slab}`} className="text-xs text-[var(--accent)] hover:opacity-80 transition-opacity">
            trade &rarr;
          </Link>
        </div>
      </GlassCard>

      {/* Dialogs */}
      <InputDialog
        open={showOracleInput}
        title="set oracle authority"
        description="enter the public key that will be authorized to push oracle price updates."
        placeholder={cfg.crankWallet || "pubkey..."}
        confirmLabel="set authority"
        onConfirm={(v) => { setShowOracleInput(false); handleAction("Set Oracle Authority", () => actions.setOracleAuthority(market, v)); }}
        onCancel={() => setShowOracleInput(false)}
      />
      <InputDialog
        open={showPriceInput}
        title="push oracle price"
        description="enter the price in USD (e.g. 1.50)."
        placeholder="1.00"
        confirmLabel="push price"
        onConfirm={(v) => { setShowPriceInput(false); const priceE6 = Math.round(parseFloat(v) * 1e6).toString(); handleAction("Push Price", () => actions.pushPrice(market, priceE6)); }}
        onCancel={() => setShowPriceInput(false)}
      />
      <InputDialog
        open={showTopUpInput}
        title="top up insurance fund"
        description="enter the amount of collateral tokens to add."
        placeholder="100"
        confirmLabel="top up"
        onConfirm={(v) => { setShowTopUpInput(false); const amount = BigInt(Math.round(parseFloat(v) * 1e6)); handleAction("Top Up Insurance", () => actions.topUpInsurance(market, amount)); }}
        onCancel={() => setShowTopUpInput(false)}
      />
      <ConfirmDialog
        open={showBurnConfirm}
        title="burn admin key"
        description="this is permanent. like, actually permanent. you will never be able to update config, set oracle, or perform any admin actions on this market again."
        confirmLabel="burn it"
        danger
        onConfirm={() => { setShowBurnConfirm(false); handleAction("Burn Admin Key", () => actions.renounceAdmin(market)); }}
        onCancel={() => setShowBurnConfirm(false)}
      />
    </>
  );
};

/* loading skeleton */
const LoadingSkeleton: FC = () => (
  <div className="min-h-[calc(100vh-48px)] relative">
    <div className="absolute inset-x-0 top-0 h-48 bg-grid pointer-events-none" />
    <main className="relative mx-auto max-w-4xl px-4 py-10">
      <ShimmerSkeleton className="mb-2 h-3 w-20" />
      <ShimmerSkeleton className="mb-8 h-8 w-48" />
      <div className="mb-8 grid grid-cols-3 gap-px overflow-hidden border border-[var(--border)] bg-[var(--border)]">
        {[1, 2, 3].map((i) => <ShimmerSkeleton key={i} className="h-20" />)}
      </div>
      {[1, 2].map((i) => <ShimmerSkeleton key={i} className="mb-4 h-64" />)}
    </main>
  </div>
);

/* main page */
const MyMarketsPage: FC = () => {
  const { myMarkets, loading, error, connected } = useMyMarkets();
  const { connection } = useConnection();
  const [insuranceMintMap, setInsuranceMintMap] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!myMarkets.length) return;
    let cancelled = false;
    async function check() {
      const map: Record<string, boolean> = {};
      for (const m of myMarkets) {
        const [mintPda] = deriveInsuranceLpMint(m.programId, m.slabAddress);
        try {
          const info = await connection.getAccountInfo(mintPda);
          map[m.slabAddress.toBase58()] = info !== null && info.data.length > 0;
        } catch {
          map[m.slabAddress.toBase58()] = false;
        }
      }
      if (!cancelled) setInsuranceMintMap(map);
    }
    check();
    return () => { cancelled = true; };
  }, [myMarkets, connection]);

  if (!connected) {
    return (
      <div className="min-h-[calc(100vh-48px)] relative">
        <div className="absolute inset-x-0 top-0 h-48 bg-grid pointer-events-none" />
            <main className="relative mx-auto max-w-4xl px-4 py-10">
          <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.25em] text-[var(--accent)]/60">
            // admin
          </div>
          <h1 className="text-xl font-medium tracking-[-0.01em] text-white sm:text-2xl" style={{ fontFamily: "var(--font-heading)" }}>
            <span className="font-normal text-white/50">Your </span>Markets
          </h1>
          <p className="mt-2 mb-8 text-[13px] text-[var(--text-secondary)]">connect your wallet to see what you&apos;ve built.</p>
          <div className="border border-[var(--border)] bg-[var(--panel-bg)] p-10 text-center">
            <p className="text-[13px] text-[var(--text-secondary)]">Connect wallet to continue</p>
          </div>
        </main>
      </div>
    );
  }

  if (loading) return <LoadingSkeleton />;

  if (error) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-24 text-center">
        <GlassCard hover={false}>
          <div className="p-8">
            <h1 className="text-xl font-bold text-white">something broke.</h1>
            <p className="mt-2 text-sm text-[var(--short)]">{error}</p>
          </div>
        </GlassCard>
      </main>
    );
  }

  if (myMarkets.length === 0) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-24 text-center">
        <GlassCard hover={false}>
          <div className="p-8">
            <h1 className="text-xl font-bold text-white">nothing here yet.</h1>
            <p className="mt-2 mb-6 text-sm text-[var(--text-secondary)]">you haven&apos;t created any markets. go make something.</p>
            <Link href="/create">
              <GlowButton>launch a market</GlowButton>
            </Link>
          </div>
        </GlassCard>
      </main>
    );
  }

  const totalMarkets = myMarkets.length;
  const totalVault = myMarkets.reduce((acc, m) => acc + m.engine.vault, 0n);
  const totalInsurance = myMarkets.reduce((acc, m) => acc + m.engine.insuranceFund.balance, 0n);

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <ScrollReveal>
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white" style={{ fontFamily: "var(--font-space-grotesk)" }}>your markets</h1>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">manage what you&apos;ve built.</p>
          </div>
          <Link href="/create">
            <GlowButton size="sm">+ new market</GlowButton>
          </Link>
        </div>
      </ScrollReveal>

      <ScrollReveal stagger={0.1}>
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[
            { label: "total markets", value: totalMarkets.toString() },
            { label: "total TVL", value: fmt(totalVault) },
            { label: "total insurance", value: fmt(totalInsurance) },
          ].map((s) => (
            <GlassCard key={s.label} accent hover>
              <p className="text-xs text-[var(--text-secondary)]">{s.label}</p>
              <p className="mt-1 text-xl font-bold text-white">{s.value}</p>
            </GlassCard>
          ))}
        </div>
      </ScrollReveal>

      <div className="grid gap-6">
        {myMarkets.map((m) => (
          <MarketCard
            key={m.slabAddress.toBase58()}
            market={m}
            insuranceMintExists={insuranceMintMap[m.slabAddress.toBase58()] ?? false}
          />
        ))}
      </div>
    </main>
  );
};

export default MyMarketsPage;
