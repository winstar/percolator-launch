"use client";

import { FC } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useUserAccount } from "@/hooks/useUserAccount";
import { useSlabState } from "@/components/providers/SlabProvider";
import { formatTokenAmount } from "@/lib/format";
import { AccountKind } from "@percolator/core";
import { useInitUser } from "@/hooks/useInitUser";

export const AccountInfo: FC<{ slabAddress: string }> = ({ slabAddress }) => {
  const { connected } = useWallet();
  const userAccount = useUserAccount();
  const { loading: slabLoading } = useSlabState();
  const { initUser, loading: initLoading, error: initError } = useInitUser(slabAddress);

  if (!connected) {
    return (
      <div className="rounded-2xl border border-[#1e2433] bg-[#111318] p-6 text-center">
        <p className="text-slate-400">Connect wallet to view account</p>
      </div>
    );
  }

  if (slabLoading) {
    return (
      <div className="rounded-2xl border border-[#1e2433] bg-[#111318] p-6">
        <p className="text-slate-500">Loading...</p>
      </div>
    );
  }

  if (!userAccount) {
    return (
      <div className="rounded-2xl border border-[#1e2433] bg-[#111318] p-6">
        <h3 className="mb-2 text-sm font-medium uppercase tracking-wider text-slate-500">Account</h3>
        <p className="mb-4 text-sm text-slate-500">No account found. Create one to start trading.</p>
        <button
          onClick={() => initUser()}
          disabled={initLoading}
          className="w-full rounded-xl bg-emerald-500 py-3 text-sm font-medium text-white hover:bg-emerald-400 disabled:opacity-50"
        >
          {initLoading ? "Creating..." : "Create Account"}
        </button>
        {initError && <p className="mt-2 text-xs text-red-400">{initError}</p>}
      </div>
    );
  }

  const { account, idx } = userAccount;
  const equity = account.capital + (account.pnl > 0n ? account.pnl : 0n);

  return (
    <div className="rounded-2xl border border-[#1e2433] bg-[#111318] p-6">
      <h3 className="mb-4 text-sm font-medium uppercase tracking-wider text-slate-500">Account</h3>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500">Index</span>
          <span className="text-sm text-white">{idx}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500">Type</span>
          <span className="text-sm text-white">{account.kind === AccountKind.LP ? "LP" : "User"}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500">Capital</span>
          <span className="text-sm text-white">{formatTokenAmount(account.capital)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500">PnL</span>
          <span className={`text-sm font-medium ${account.pnl === 0n ? "text-slate-500" : account.pnl > 0n ? "text-emerald-400" : "text-red-400"}`}>
            {account.pnl > 0n ? "+" : ""}{formatTokenAmount(account.pnl < 0n ? -account.pnl : account.pnl)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500">Equity</span>
          <span className="text-sm font-medium text-white">{formatTokenAmount(equity)}</span>
        </div>
      </div>
    </div>
  );
};
