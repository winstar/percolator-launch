"use client";

import { FC } from "react";

export const Footer: FC = () => {
  return (
    <footer className="border-t border-[#1e2433] py-6">
      <div className="mx-auto max-w-7xl px-4 text-center text-sm text-slate-500">
        <p>
          Percolator Launch — Perpetual futures for any token.{" "}
          <a
            href="https://github.com/dcccrypto/percolator-launch"
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-400 hover:underline"
          >
            GitHub
          </a>
        </p>
      </div>
    </footer>
  );
};
