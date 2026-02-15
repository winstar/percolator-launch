"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

interface SimulationRow {
  id: string;
  status: string;
  slab_address: string;
  mint_address: string | null;
  token_symbol: string | null;
  token_name: string | null;
  creator_wallet: string | null;
  model: string | null;
  scenario: string | null;
  start_price_e6: number | null;
  end_price_e6: number | null;
  high_price_e6: number | null;
  low_price_e6: number | null;
  total_trades: number | null;
  total_liquidations: number | null;
  total_volume_e6: number | null;
  force_closes: number | null;
  duration_seconds: number | null;
  bot_count: number | null;
  started_at: string | null;
  ended_at: string | null;
  price_change_pct: number | null;
}

type SortKey = "newest" | "biggest_move" | "most_trades" | "most_liquidations";

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function formatPrice(e6: number | null): string {
  if (e6 === null) return "--";
  return `$${(e6 / 1_000_000).toFixed(2)}`;
}

function truncateAddr(addr: string): string {
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}

// --------------------------------------------------------------------------
// Component
// --------------------------------------------------------------------------

export default function SimulationsGalleryPage() {
  const [sessions, setSessions] = useState<SimulationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>("newest");

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      setError("Supabase not configured");
      setLoading(false);
      return;
    }

    const sb = createClient(url, key);
    sb.from("simulation_gallery")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(100)
      .then(({ data, error: err }) => {
        if (err) {
          setError(err.message);
        } else {
          setSessions((data as SimulationRow[]) ?? []);
        }
        setLoading(false);
      });
  }, []);

  const sorted = useMemo(() => {
    const copy = [...sessions];
    switch (sortBy) {
      case "newest":
        return copy.sort((a, b) => (b.started_at ?? "").localeCompare(a.started_at ?? ""));
      case "biggest_move":
        return copy.sort((a, b) => Math.abs(b.price_change_pct ?? 0) - Math.abs(a.price_change_pct ?? 0));
      case "most_trades":
        return copy.sort((a, b) => (b.total_trades ?? 0) - (a.total_trades ?? 0));
      case "most_liquidations":
        return copy.sort((a, b) => (b.total_liquidations ?? 0) - (a.total_liquidations ?? 0));
    }
  }, [sessions, sortBy]);

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--text-dim)] mb-1">
            Simulation Gallery
          </p>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
            Past Simulations
          </h1>
        </div>
        <Link
          href="/simulation"
          className="border border-[var(--accent)]/50 bg-[var(--accent)]/[0.08] px-4 py-2 text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--accent)] hover:bg-[var(--accent)]/[0.15] transition-all rounded-none"
        >
          Launch New
        </Link>
      </div>

      {/* Sort Controls */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {(
          [
            ["newest", "Newest"],
            ["biggest_move", "Biggest Move"],
            ["most_trades", "Most Trades"],
            ["most_liquidations", "Most Liquidations"],
          ] as [SortKey, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setSortBy(key)}
            className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.15em] border transition-all rounded-none ${
              sortBy === key
                ? "border-[var(--accent)] bg-[var(--accent)]/[0.15] text-[var(--accent)]"
                : "border-[var(--border)] text-[var(--text-dim)] hover:border-[var(--text-dim)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-[var(--text-dim)] text-sm">Loading simulations...</div>
        </div>
      ) : error ? (
        <div className="border border-red-500/30 bg-red-500/[0.05] p-4">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      ) : sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <p className="text-[var(--text-dim)] text-sm">No simulations yet</p>
          <Link
            href="/simulation"
            className="border border-[var(--accent)]/50 bg-[var(--accent)]/[0.08] px-6 py-3 text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--accent)] hover:bg-[var(--accent)]/[0.15] transition-all rounded-none"
          >
            Run Your First Simulation
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sorted.map((sim) => (
            <SimulationCard key={sim.id} sim={sim} />
          ))}
        </div>
      )}
    </div>
  );
}

// --------------------------------------------------------------------------
// Card
// --------------------------------------------------------------------------

function SimulationCard({ sim }: { sim: SimulationRow }) {
  const pct = sim.price_change_pct ?? 0;
  const isPositive = pct >= 0;
  const isRunning = sim.status === "running";

  return (
    <Link
      href={`/simulation?slab=${sim.slab_address}`}
      className="block border border-[var(--border)] bg-[var(--card-bg,var(--bg))] hover:border-[var(--accent)]/50 transition-all rounded-none group"
    >
      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="text-[14px] font-bold text-[var(--text)]">
              {sim.token_symbol ?? "SIM"}/USD
            </p>
            <p className="text-[10px] text-[var(--text-dim)] mt-0.5">
              {sim.token_name ?? "Simulation"}
            </p>
          </div>
          <div className="text-right">
            {isRunning ? (
              <span className="inline-block px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.15em] border border-yellow-500/50 text-yellow-400 bg-yellow-500/[0.08]">
                Live
              </span>
            ) : (
              <span
                className={`text-[16px] font-bold font-mono ${
                  isPositive ? "text-green-400" : "text-red-400"
                }`}
              >
                {isPositive ? "+" : ""}
                {pct.toFixed(2)}%
              </span>
            )}
          </div>
        </div>

        {/* Price Range */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-[var(--text-dim)]">Start</p>
            <p className="text-[12px] font-mono text-[var(--text)]">{formatPrice(sim.start_price_e6)}</p>
          </div>
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-[var(--text-dim)]">End</p>
            <p className="text-[12px] font-mono text-[var(--text)]">{formatPrice(sim.end_price_e6)}</p>
          </div>
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-[var(--text-dim)]">Duration</p>
            <p className="text-[12px] font-mono text-[var(--text)]">
              {sim.duration_seconds ? formatDuration(sim.duration_seconds) : "--"}
            </p>
          </div>
        </div>

        {/* Stats Row */}
        <div className="flex items-center gap-4 border-t border-[var(--border)] pt-3">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-[var(--text-dim)]">Trades</p>
            <p className="text-[12px] font-mono text-[var(--text)]">{sim.total_trades ?? 0}</p>
          </div>
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-[var(--text-dim)]">Liquidations</p>
            <p className="text-[12px] font-mono text-[var(--text)]">{sim.total_liquidations ?? 0}</p>
          </div>
          {sim.scenario && (
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-[var(--text-dim)]">Scenario</p>
              <p className="text-[12px] font-mono text-[var(--accent)]">{sim.scenario}</p>
            </div>
          )}
          {sim.slab_address && (
            <div className="ml-auto">
              <p className="text-[9px] font-mono text-[var(--text-dim)] group-hover:text-[var(--accent)] transition-colors">
                {truncateAddr(sim.slab_address)}
              </p>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
