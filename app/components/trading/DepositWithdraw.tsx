"use client";

import { FC, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useUserAccount } from "@/hooks/useUserAccount";
import { useDeposit } from "@/hooks/useDeposit";
import { useWithdraw } from "@/hooks/useWithdraw";

export const DepositWithdraw: FC<{ slabAddress: string }> = ({ slabAddress }) => {
  const { connected } = useWallet();
  const userAccount = useUserAccount();
  const { deposit, loading: depositLoading, error: depositError } = useDeposit(slabAddress);
  const { withdraw, loading: withdrawLoading, error: withdrawError } = useWithdraw(slabAddress);

  const [mode, setMode] = useState<"deposit" | "withdraw">("deposit");
  const [amount, setAmount] = useState("");

  if (!connected || !userAccount) return null;

  const loading = mode === "deposit" ? depositLoading : withdrawLoading;
  const error = mode === "deposit" ? depositError : withdrawError;

  async function handleSubmit() {
    if (!amount || !userAccount) return;
    const parts = amount.split(".");
    const whole = parts[0] || "0";
    const frac = (parts[1] || "").padEnd(6, "0").slice(0, 6);
    const amtNative = BigInt(whole) * 1_000_000n + BigInt(frac);
    if (amtNative <= 0n) return;

    try {
      if (mode === "deposit") {
        await deposit({ userIdx: userAccount.idx, amount: amtNative });
      } else {
        await withdraw({ userIdx: userAccount.idx, amount: amtNative });
      }
      setAmount("");
    } catch { /* error set by hook */ }
  }

  return (
    <div className="rounded-2xl border border-[#1e2433] bg-[#111318] p-6">
      <h3 className="mb-4 text-sm font-medium uppercase tracking-wider text-slate-500">Deposit / Withdraw</h3>

      <div className="mb-4 flex gap-2">
        <button
          onClick={() => setMode("deposit")}
          className={`flex-1 rounded-xl py-2 text-sm font-medium ${
            mode === "deposit" ? "bg-emerald-500 text-white" : "bg-slate-800 text-slate-400"
          }`}
        >
          Deposit
        </button>
        <button
          onClick={() => setMode("withdraw")}
          className={`flex-1 rounded-xl py-2 text-sm font-medium ${
            mode === "withdraw" ? "bg-amber-500 text-white" : "bg-slate-800 text-slate-400"
          }`}
        >
          Withdraw
        </button>
      </div>

      <input
        type="text"
        value={amount}
        onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
        placeholder="Amount"
        className="mb-4 w-full rounded-xl border border-[#1e2433] bg-[#0a0b0f] px-3 py-2 text-white placeholder-slate-600 focus:border-emerald-500 focus:outline-none"
      />

      <button
        onClick={handleSubmit}
        disabled={loading || !amount}
        className="w-full rounded-xl bg-emerald-500 py-3 text-sm font-medium text-white hover:bg-emerald-400 disabled:opacity-50"
      >
        {loading ? "Sending..." : mode === "deposit" ? "Deposit" : "Withdraw"}
      </button>

      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  );
};
