"use client";

import { FC, useState, useRef, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAllMarketStats } from "@/hooks/useAllMarketStats";

interface MarketSelectorProps {
  currentSlabAddress: string;
  symbol: string;
  logoUrl: string | null;
}

function formatPrice(priceE6: number | null): string {
  if (priceE6 == null) return "—";
  const p = priceE6 / 1e6;
  if (p < 0.01) return `$${p.toFixed(6)}`;
  if (p < 1) return `$${p.toFixed(4)}`;
  return `$${p.toFixed(2)}`;
}

function formatVolume(vol: number | null): string {
  if (vol == null || vol === 0) return "—";
  const v = vol / 1e6;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

export const MarketSelector: FC<MarketSelectorProps> = ({
  currentSlabAddress,
  symbol,
  logoUrl,
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { statsMap, loading } = useAllMarketStats();

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Focus search on open
  useEffect(() => {
    if (open && searchRef.current) {
      searchRef.current.focus();
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  const markets = useMemo(() => {
    const all = Array.from(statsMap.values())
      .filter((m) => m.slab_address && m.slab_address !== currentSlabAddress)
      .sort((a, b) => (b.volume_24h ?? 0) - (a.volume_24h ?? 0));

    if (!search.trim()) return all;

    const q = search.toLowerCase();
    return all.filter(
      (m) =>
        (m.symbol?.toLowerCase().includes(q)) ||
        (m.name?.toLowerCase().includes(q)) ||
        (m.slab_address?.toLowerCase().includes(q))
    );
  }, [statsMap, currentSlabAddress, search]);

  const handleSelect = (slabAddress: string) => {
    setOpen(false);
    setSearch("");
    router.push(`/trade/${slabAddress}`);
  };

  return (
    <div ref={wrapperRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-sm px-2 py-1 transition-colors hover:bg-[var(--accent)]/[0.06]"
      >
        <span
          className="text-sm font-bold text-[var(--text)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {symbol}/USD
        </span>
        <span className="text-[10px] font-normal text-[var(--text-muted)]">PERP</span>
        <svg
          className={`h-3.5 w-3.5 text-[var(--text-dim)] transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-[340px] border border-[var(--border)] bg-[var(--bg)] shadow-lg shadow-black/20">
          {/* Search */}
          <div className="border-b border-[var(--border)]/50 px-3 py-2">
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search markets..."
              className="w-full bg-transparent text-[11px] text-[var(--text)] placeholder:text-[var(--text-dim)] outline-none"
              style={{ fontFamily: "var(--font-mono)" }}
            />
          </div>

          {/* Header row */}
          <div className="flex items-center px-3 py-1.5 text-[8px] font-medium uppercase tracking-[0.15em] text-[var(--text-dim)] border-b border-[var(--border)]/30">
            <span className="flex-1">Market</span>
            <span className="w-20 text-right">Price</span>
            <span className="w-16 text-right">24h Vol</span>
          </div>

          {/* Market list */}
          <div className="max-h-[320px] overflow-y-auto">
            {loading && markets.length === 0 ? (
              <div className="py-6 text-center">
                <span className="text-[10px] text-[var(--text-dim)]">Loading markets...</span>
              </div>
            ) : markets.length === 0 ? (
              <div className="py-6 text-center">
                <span className="text-[10px] text-[var(--text-muted)]">
                  {search ? "No markets found" : "No other markets available"}
                </span>
              </div>
            ) : (
              markets.map((m) => (
                <button
                  key={m.slab_address}
                  onClick={() => handleSelect(m.slab_address!)}
                  className="flex w-full items-center px-3 py-2 text-left transition-colors hover:bg-[var(--accent)]/[0.04]"
                >
                  {/* Symbol */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-medium text-[var(--text)]">
                        {m.symbol ?? m.slab_address?.slice(0, 6)}/USD
                      </span>
                      {m.max_leverage && (
                        <span className="text-[8px] text-[var(--text-dim)]">
                          {m.max_leverage}x
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Price */}
                  <span
                    className="w-20 text-right text-[10px] text-[var(--text-secondary)]"
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    {formatPrice(m.last_price)}
                  </span>

                  {/* Volume */}
                  <span
                    className="w-16 text-right text-[10px] text-[var(--text-dim)]"
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    {formatVolume(m.volume_24h)}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
