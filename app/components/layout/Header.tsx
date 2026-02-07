"use client";

import { FC } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";

const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false }
);

export const Header: FC = () => {
  return (
    <header className="border-b border-[#1e2433] bg-[#0a0b0f]/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2 text-lg font-bold text-white">
            <span className="text-emerald-400">⚡</span>
            Percolator Launch
          </Link>
          <nav className="flex gap-6">
            <Link href="/launch" className="text-sm font-medium text-slate-400 transition-colors hover:text-white">
              Launch
            </Link>
            <Link href="/markets" className="text-sm font-medium text-slate-400 transition-colors hover:text-white">
              Markets
            </Link>
          </nav>
        </div>
        <WalletMultiButton />
      </div>
    </header>
  );
};
