"use client";

import { use } from "react";
import { SlabProvider } from "@/components/providers/SlabProvider";
import { TradeForm } from "@/components/trading/TradeForm";
import { PositionPanel } from "@/components/trading/PositionPanel";
import { MarketStats } from "@/components/market/MarketStats";
import { FundingRate } from "@/components/market/FundingRate";
import { InsuranceFund } from "@/components/market/InsuranceFund";
import { AccountInfo } from "@/components/trading/AccountInfo";
import { DepositWithdraw } from "@/components/trading/DepositWithdraw";

export default function TradePage({ params }: { params: Promise<{ slab: string }> }) {
  const { slab } = use(params);

  return (
    <SlabProvider slabAddress={slab}>
      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">Trade</h1>
          <p className="font-mono text-xs text-slate-500">{slab}</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left: Trade + Account */}
          <div className="space-y-6">
            <TradeForm slabAddress={slab} />
            <DepositWithdraw slabAddress={slab} />
          </div>

          {/* Middle: Position + Account Info */}
          <div className="space-y-6">
            <PositionPanel />
            <AccountInfo slabAddress={slab} />
            <MarketStats />
          </div>

          {/* Right: Market data */}
          <div className="space-y-6">
            <InsuranceFund />
            <FundingRate />
          </div>
        </div>
      </div>
    </SlabProvider>
  );
}
