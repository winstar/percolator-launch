"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { GlassCard } from "@/components/ui/GlassCard";
import { GlowButton } from "@/components/ui/GlowButton";
import { buildSolflareBrowseUrl } from "@/lib/solflare";

type WalletDebugSnapshot = {
  url: string;
  origin: string;
  userAgent: string;
  solana: {
    present: boolean;
    isPhantom: boolean;
    isSolflare: boolean;
  };
  phantom: {
    present: boolean;
    isPhantom: boolean;
  };
  solflare: {
    present: boolean;
    isSolflare: boolean;
  };
};

const DEBUG_ENABLED = new Set(["1", "true", "yes"]);

export function WalletDebugPanel() {
  const searchParams = useSearchParams();
  const flag = searchParams?.get("walletDebug") ?? "";
  const enabled = DEBUG_ENABLED.has(flag.toLowerCase());

  const snapshot = useMemo<WalletDebugSnapshot>(() => {
    if (typeof window === "undefined") {
      return {
        url: "",
        origin: "",
        userAgent: "",
        solana: { present: false, isPhantom: false, isSolflare: false },
        phantom: { present: false, isPhantom: false },
        solflare: { present: false, isSolflare: false },
      };
    }

    const win = window as unknown as {
      solana?: { isPhantom?: boolean; isSolflare?: boolean };
      phantom?: { solana?: { isPhantom?: boolean } };
      solflare?: { isSolflare?: boolean };
    };

    return {
      url: window.location.href,
      origin: window.location.origin,
      userAgent: navigator.userAgent,
      solana: {
        present: !!win.solana,
        isPhantom: !!win.solana?.isPhantom,
        isSolflare: !!win.solana?.isSolflare,
      },
      phantom: {
        present: !!win.phantom?.solana,
        isPhantom: !!win.phantom?.solana?.isPhantom,
      },
      solflare: {
        present: !!win.solflare,
        isSolflare: !!win.solflare?.isSolflare,
      },
    };
  }, []);

  if (!enabled) return null;

  const solflareBrowseUrl = snapshot.url
    ? buildSolflareBrowseUrl(snapshot.url, snapshot.origin)
    : "";

  return (
    <GlassCard className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">
            Wallet Debug
          </p>
          <p className="mt-1 text-[12px] text-[var(--text-secondary)]">
            Use this to capture wallet detection details for support.
          </p>
        </div>
        {solflareBrowseUrl ? (
          <a
            href={solflareBrowseUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-sm border border-[var(--border)] px-3 py-2 text-[11px] font-medium text-[var(--text-secondary)] hover:border-[var(--accent)]/40 hover:text-[var(--text)]"
          >
            Open in Solflare
          </a>
        ) : null}
      </div>

      <div className="mt-4 grid gap-2 text-[12px] text-[var(--text-secondary)]">
        <DebugRow label="URL" value={snapshot.url || "(unknown)"} />
        <DebugRow label="User agent" value={snapshot.userAgent || "(unknown)"} />
        <DebugRow label="window.solana" value={formatBool(snapshot.solana.present)} />
        <DebugRow label="window.solana.isPhantom" value={formatBool(snapshot.solana.isPhantom)} />
        <DebugRow label="window.solana.isSolflare" value={formatBool(snapshot.solana.isSolflare)} />
        <DebugRow label="window.phantom" value={formatBool(snapshot.phantom.present)} />
        <DebugRow label="window.solflare" value={formatBool(snapshot.solflare.present)} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <GlowButton
          size="sm"
          variant="secondary"
          onClick={() => {
            if (!navigator?.clipboard?.writeText) return;
            navigator.clipboard.writeText(JSON.stringify(snapshot, null, 2));
          }}
        >
          Copy debug
        </GlowButton>
      </div>
    </GlassCard>
  );
}

function DebugRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-2">
      <span className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">
        {label}
      </span>
      <span className="font-mono text-[11px] text-[var(--text-secondary)] break-all">{value}</span>
    </div>
  );
}

function formatBool(value: boolean) {
  return value ? "true" : "false";
}
