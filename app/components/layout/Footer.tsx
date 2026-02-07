"use client";

import { FC } from "react";
import Link from "next/link";

const CA = "8PzFWyLpCVEmbZmVJcaRTU5r69XKJx1rd7YGpWvnpump";

export const Footer: FC = () => {
  return (
    <footer className="border-t border-[#1e2433]/50 bg-[#0a0b0f]">
      <div className="mx-auto max-w-7xl px-4 py-12">
        <div className="grid gap-10 md:grid-cols-4">
          {/* Brand */}
          <div className="md:col-span-2">
            <div className="mb-3 flex items-center gap-2.5 text-lg font-extrabold text-white">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-500 text-xs font-black text-white">
                P
              </span>
              Percolator
            </div>
            <p className="mb-4 max-w-sm text-sm leading-relaxed text-slate-500">
              Permissionless perpetual futures for any Solana token.
              Deploy a market in one click. Trade with up to 20x leverage.
            </p>
            <div className="flex items-center gap-3">
              <a
                href="https://x.com/i/communities/1980346190404415886"
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#1e2433] text-slate-500 transition-colors hover:border-slate-600 hover:text-white"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </a>
              <a
                href="https://github.com/dcccrypto/percolator-launch"
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#1e2433] text-slate-500 transition-colors hover:border-slate-600 hover:text-white"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
                </svg>
              </a>
              <a
                href={`https://solscan.io/token/${CA}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-8 items-center justify-center rounded-lg border border-[#1e2433] px-2.5 text-xs font-medium text-slate-500 transition-colors hover:border-slate-600 hover:text-white"
              >
                Solscan
              </a>
            </div>
          </div>

          {/* Product */}
          <div>
            <h4 className="mb-4 text-xs font-bold uppercase tracking-widest text-slate-500">Product</h4>
            <div className="flex flex-col gap-2.5">
              <Link href="/launch" className="text-sm text-slate-400 transition-colors hover:text-white">
                Launch Market
              </Link>
              <Link href="/markets" className="text-sm text-slate-400 transition-colors hover:text-white">
                Browse Markets
              </Link>
              <a
                href="https://solscan.io/account/GM8zjJ8LTBMv9xEsverh6H6wLyevgMHEJXcEzyY3rY24"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-slate-400 transition-colors hover:text-white"
              >
                Program ↗
              </a>
            </div>
          </div>

          {/* Community */}
          <div>
            <h4 className="mb-4 text-xs font-bold uppercase tracking-widest text-slate-500">Community</h4>
            <div className="flex flex-col gap-2.5">
              <a
                href="https://x.com/i/communities/1980346190404415886"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-slate-400 transition-colors hover:text-white"
              >
                X Community ↗
              </a>
              <a
                href="https://github.com/dcccrypto/percolator-launch"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-slate-400 transition-colors hover:text-white"
              >
                GitHub ↗
              </a>
            </div>
          </div>
        </div>

        {/* Bottom */}
        <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-[#1e2433]/50 pt-6 sm:flex-row">
          <p className="text-xs text-slate-600">
            Built on toly&apos;s Percolator protocol. Fully on-chain. Permissionless.
          </p>
          <p className="font-mono text-[10px] text-slate-700">
            {CA}
          </p>
        </div>
      </div>
    </footer>
  );
};
