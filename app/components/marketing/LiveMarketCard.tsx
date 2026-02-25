"use client";

import Link from "next/link";
import { MiniSparkline } from "./MiniSparkline";
import { MiniOrderBook } from "./MiniOrderBook";

export function LiveMarketCard({ className = "", animate = true }: { className?: string; animate?: boolean }) {
  return (
    <div className={`relative ${className}`}>
      {/* Ambient glow behind card */}
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(ellipse 400px 600px at 50% 50%, rgba(124,58,237,0.12), transparent)",
        }}
      />

      {/* Floating card */}
      <div
        className="w-full max-w-[380px] overflow-hidden rounded-2xl border border-white/10 bg-[#111118] shadow-[0_32px_80px_rgba(0,0,0,0.6)]"
        style={{
          animation: "market-card-float 4s ease-in-out infinite",
          willChange: "transform",
        }}
      >
        {/* Card header */}
        <div className="flex items-center justify-between border-b border-white/5 px-5 py-3.5">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-violet-600 text-xs font-bold text-white">
              S
            </div>
            <div>
              <div className="text-sm font-semibold text-white">SOL-PERP</div>
              <div className="text-[10px] text-white/40">
                Perpetual · 20x max
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="inline-flex items-center gap-1 rounded-full border border-green-400/30 bg-green-400/10 px-2 py-0.5 text-[10px] font-medium text-green-400">
              <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
              LIVE
            </div>
            <div className="mt-0.5 text-[11px] font-medium text-green-400">
              +3.24% ↑
            </div>
          </div>
        </div>

        {/* Mini price chart */}
        <div className="px-5 pt-4">
          <MiniSparkline width={340} height={120} basePrice={185.4} />
        </div>

        {/* Mini order book */}
        <div className="px-5 py-3 hidden md:block">
          <MiniOrderBook />
        </div>

        {/* Action buttons */}
        <div className="grid grid-cols-2 gap-2 px-5 pb-3">
          <Link
            href="/markets"
            className="flex h-10 items-center justify-center rounded-lg border border-green-500/40 bg-green-500/20 text-sm font-semibold text-green-400 transition-colors hover:bg-green-500/30"
          >
            LONG
          </Link>
          <Link
            href="/markets"
            className="flex h-10 items-center justify-center rounded-lg border border-red-500/40 bg-red-500/20 text-sm font-semibold text-red-400 transition-colors hover:bg-red-500/30"
          >
            SHORT
          </Link>
        </div>

        {/* Card footer */}
        <div className="border-t border-white/5 px-5 py-2.5 text-center text-[11px] text-white/40">
          8% Creator Fee · $2,500 seed · Launch in 60s
        </div>
      </div>
    </div>
  );
}
