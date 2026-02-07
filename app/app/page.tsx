"use client";

import Link from "next/link";

export default function Home() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16">
      {/* Hero */}
      <div className="mb-20 text-center">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-4 py-1.5 text-sm text-emerald-400">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          Live on Solana Mainnet
        </div>
        <h1 className="mb-6 text-5xl font-bold tracking-tight text-white md:text-7xl">
          Launch Perpetual Futures
          <br />
          <span className="text-emerald-400">for Any Token</span>
        </h1>
        <p className="mx-auto mb-10 max-w-2xl text-lg text-slate-400">
          Deploy a perpetual futures market on Solana in one click. No smart contract needed.
          Powered by the Percolator protocol.
        </p>
        <div className="flex items-center justify-center gap-4">
          <Link
            href="/launch"
            className="rounded-xl bg-emerald-500 px-8 py-4 text-base font-semibold text-white transition-all hover:bg-emerald-400 hover:shadow-lg hover:shadow-emerald-500/25"
          >
            🚀 Launch a Market
          </Link>
          <Link
            href="/markets"
            className="rounded-xl border border-slate-700 bg-slate-800/50 px-8 py-4 text-base font-semibold text-slate-300 transition-all hover:border-slate-600 hover:bg-slate-800"
          >
            Browse Markets
          </Link>
        </div>
      </div>

      {/* How it works */}
      <div className="mb-20">
        <h2 className="mb-10 text-center text-3xl font-bold text-white">How It Works</h2>
        <div className="grid gap-6 md:grid-cols-3">
          {[
            {
              step: "1",
              title: "Pick a Token",
              desc: "Paste any Solana token mint address. We auto-fetch metadata and price from Jupiter.",
            },
            {
              step: "2",
              title: "Set Parameters",
              desc: "Choose max leverage, trading fees, and seed liquidity. Customize your market.",
            },
            {
              step: "3",
              title: "Deploy & Trade",
              desc: "One-click deployment creates the market on-chain. Share the link and start trading.",
            },
          ].map((item) => (
            <div
              key={item.step}
              className="rounded-2xl border border-[#1e2433] bg-[#111318] p-8"
            >
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10 text-xl font-bold text-emerald-400">
                {item.step}
              </div>
              <h3 className="mb-2 text-lg font-semibold text-white">{item.title}</h3>
              <p className="text-sm leading-relaxed text-slate-400">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Stats placeholder */}
      <div className="mb-20 grid grid-cols-3 gap-6">
        {[
          { label: "Markets Deployed", value: "—" },
          { label: "Total Volume", value: "—" },
          { label: "Insurance Locked", value: "—" },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-[#1e2433] bg-[#111318] p-6 text-center">
            <p className="text-3xl font-bold text-white">{s.value}</p>
            <p className="mt-1 text-sm text-slate-500">{s.label}</p>
          </div>
        ))}
      </div>

      {/* On-chain info */}
      <div className="text-center">
        <p className="text-sm text-slate-500">
          Program:{" "}
          <a
            href="https://solscan.io/account/GM8zjJ8LTBMv9xEsverh6H6wLyevgMHEJXcEzyY3rY24"
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-emerald-400 hover:underline"
          >
            GM8zjJ...Y3rY24
          </a>
        </p>
      </div>
    </div>
  );
}
