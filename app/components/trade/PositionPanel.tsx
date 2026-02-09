"use client";
import { explorerTxUrl } from "@/lib/config";

import { FC, useMemo, useState } from "react";
import { useUserAccount } from "@/hooks/useUserAccount";
import { useMarketConfig } from "@/hooks/useMarketConfig";
import { useTrade } from "@/hooks/useTrade";
import { useSlabState } from "@/components/providers/SlabProvider";
import { useTokenMeta } from "@/hooks/useTokenMeta";
import { AccountKind } from "@percolator/core";
import { formatTokenAmount, formatUsd } from "@/lib/format";
import { useLivePrice } from "@/hooks/useLivePrice";
import {
  computeMarkPnl,
  computeLiqPrice,
  computePnlPercent,
} from "@/lib/trading";

function abs(n: bigint): bigint {
  return n < 0n ? -n : n;
}

export const PositionPanel: FC<{ slabAddress: string }> = ({ slabAddress }) => {
  const userAccount = useUserAccount();
  const config = useMarketConfig();
  const { trade, loading: closeLoading, error: closeError } = useTrade(slabAddress);
  const { accounts, config: mktConfig, params } = useSlabState();
  const { priceE6: livePriceE6, priceUsd } = useLivePrice();
  const tokenMeta = useTokenMeta(mktConfig?.collateralMint ?? null);
  const symbol = tokenMeta?.symbol ?? "Token";
  const [closeSig, setCloseSig] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const lpIdx = useMemo(() => {
    const lp = accounts.find(({ account }) => account.kind === AccountKind.LP);
    return lp?.idx ?? 0;
  }, [accounts]);

  if (!userAccount) {
    return (
      <div className="rounded-xl border border-[#1e1e2e] bg-[#0a0b0f] p-6 shadow-sm">
        <h3 className="mb-4 text-sm font-medium uppercase tracking-wider text-[#71717a]">
          Position
        </h3>
        <div className="space-y-3">
          <div className="h-4 w-24 animate-pulse rounded bg-[#1a1a2e]" />
          <div className="h-4 w-32 animate-pulse rounded bg-[#1a1a2e]" />
          <div className="h-4 w-20 animate-pulse rounded bg-[#1a1a2e]" />
        </div>
      </div>
    );
  }

  const { account } = userAccount;
  const hasPosition = account.positionSize !== 0n;
  const isLong = account.positionSize > 0n;
  const absPosition = abs(account.positionSize);
  const onChainPriceE6 = config?.lastEffectivePriceE6 ?? 0n;
  const currentPriceE6 = livePriceE6 ?? onChainPriceE6;

  const entryPriceE6 =
    account.reservedPnl > 0n ? account.reservedPnl : account.entryPrice;

  // --- PnL via trading.ts utilities ---
  const pnlTokens = computeMarkPnl(
    account.positionSize,
    entryPriceE6,
    currentPriceE6,
  );
  const pnlUsd =
    priceUsd !== null ? (Number(pnlTokens) / 1e6) * priceUsd : null;
  const roe = computePnlPercent(pnlTokens, account.capital);

  // --- Liquidation price ---
  const maintenanceBps = params?.maintenanceMarginBps ?? 100n;
  const liqPriceE6 = computeLiqPrice(
    entryPriceE6,
    account.capital,
    account.positionSize,
    maintenanceBps,
  );

  // --- Colours ---
  const pnlColor =
    pnlTokens === 0n
      ? "text-[#71717a]"
      : pnlTokens > 0n
        ? "text-[#00d4aa]"
        : "text-red-400";

  const pnlBgColor =
    pnlTokens === 0n
      ? "bg-[#1a1a2e]"
      : pnlTokens > 0n
        ? "bg-[#00d4aa]/10"
        : "bg-red-500/10";

  const pnlBarWidth = Math.min(100, Math.max(0, Math.abs(roe)));

  let marginHealthStr = "N/A";
  if (hasPosition && absPosition > 0n) {
    const healthPct = Number((account.capital * 100n) / absPosition);
    marginHealthStr = `${healthPct.toFixed(1)}%`;
  }

  async function handleClose() {
    if (!userAccount || !hasPosition) return;
    try {
      const closeSize = isLong ? -absPosition : absPosition;
      const sig = await trade({
        lpIdx,
        userIdx: userAccount.idx,
        size: closeSize,
      });
      setCloseSig(sig ?? null);
      setShowConfirm(false);
    } catch {
      // error set by hook
    }
  }

  return (
    <div className="rounded-xl border border-[#1e1e2e] bg-[#0a0b0f] p-6 shadow-sm">
      <h3 className="mb-4 text-sm font-medium uppercase tracking-wider text-[#71717a]">
        Position
      </h3>

      {!hasPosition ? (
        <p className="text-sm text-[#71717a]">No open position</p>
      ) : (
        <div className="space-y-3">
          {/* PnL highlight bar */}
          <div className={`rounded-lg ${pnlBgColor} p-3`}>
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#71717a]">Unrealized PnL</span>
              <div className="text-right">
                <span className={`font-mono text-sm font-bold ${pnlColor}`}>
                  {pnlTokens > 0n ? "+" : pnlTokens < 0n ? "-" : ""}
                  {formatTokenAmount(abs(pnlTokens))} {symbol}
                </span>
                {pnlUsd !== null && (
                  <span className={`ml-1.5 font-mono text-xs ${pnlColor}`}>
                    ({pnlUsd >= 0 ? "+" : ""}$
                    {Math.abs(pnlUsd).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                    )
                  </span>
                )}
              </div>
            </div>
            {/* PnL bar */}
            <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-[#1e1e2e]">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  pnlTokens >= 0n ? "bg-[#00d4aa]" : "bg-red-500"
                }`}
                style={{ width: `${pnlBarWidth}%` }}
              />
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-[#52525b]">
              <span>
                PnL%:{" "}
                <span className={`font-mono ${pnlColor}`}>
                  {roe >= 0 ? "+" : ""}
                  {roe.toFixed(2)}%
                </span>
              </span>
            </div>
          </div>

          {/* Position details */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#71717a]">Direction</span>
            <span
              className={`text-sm font-medium ${
                isLong ? "text-[#00d4aa]" : "text-red-400"
              }`}
            >
              {isLong ? "LONG" : "SHORT"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#71717a]">Size</span>
            <span className="font-mono text-sm text-[#e4e4e7]">
              {formatTokenAmount(absPosition)} {symbol}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#71717a]">Entry Price</span>
            <span className="font-mono text-sm text-[#e4e4e7]">
              {formatUsd(entryPriceE6)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#71717a]">Oracle Price</span>
            <span className="font-mono text-sm text-[#e4e4e7]">
              {formatUsd(currentPriceE6)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#71717a]">Liq. Price</span>
            <span className="font-mono text-sm text-amber-400">
              {liqPriceE6 > 0n ? formatUsd(liqPriceE6) : "—"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#71717a]">Margin Health</span>
            <span className="font-mono text-sm text-[#a1a1aa]">
              {marginHealthStr}
            </span>
          </div>

          {/* Close button with confirmation */}
          {!showConfirm ? (
            <button
              onClick={() => setShowConfirm(true)}
              disabled={closeLoading}
              className="mt-2 w-full rounded-lg border border-red-600/30 bg-red-600/10 py-2.5 text-sm font-medium text-red-400 transition-all duration-150 hover:bg-red-600/20 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-red-500/30"
            >
              Close Position
            </button>
          ) : (
            <div className="mt-2 space-y-2 rounded-lg border border-red-600/30 bg-red-900/10 p-3">
              <p className="text-xs text-[#a1a1aa]">
                Close {isLong ? "LONG" : "SHORT"}{" "}
                {formatTokenAmount(absPosition)} {symbol}?
              </p>
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#71717a]">Est. PnL</span>
                <span className={`font-mono font-medium ${pnlColor}`}>
                  {pnlTokens > 0n ? "+" : pnlTokens < 0n ? "-" : ""}
                  {formatTokenAmount(abs(pnlTokens))} {symbol}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#71717a]">You&apos;ll receive</span>
                <span className="font-mono font-medium text-[#e4e4e7]">
                  ~
                  {formatTokenAmount(
                    pnlTokens > 0n
                      ? account.capital + pnlTokens
                      : pnlTokens < 0n
                        ? account.capital > abs(pnlTokens)
                          ? account.capital - abs(pnlTokens)
                          : 0n
                        : account.capital,
                  )}{" "}
                  {symbol}
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowConfirm(false)}
                  className="flex-1 rounded-lg border border-[#1e1e2e] bg-[#1a1a2e] py-2 text-xs font-medium text-[#71717a] transition-colors hover:bg-[#1e1e2e]"
                >
                  Cancel
                </button>
                <button
                  onClick={handleClose}
                  disabled={closeLoading}
                  className="flex-1 rounded-lg bg-red-600 py-2 text-xs font-medium text-white transition-colors hover:bg-red-500 disabled:opacity-50"
                >
                  {closeLoading ? "Closing..." : "Confirm Close"}
                </button>
              </div>
            </div>
          )}

          {closeError && <p className="text-xs text-red-400">{closeError}</p>}

          {closeSig && (
            <p className="text-xs text-[#71717a]">
              Closed:{" "}
              <a
                href={`${explorerTxUrl(closeSig)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:underline"
              >
                {closeSig.slice(0, 16)}...
              </a>
            </p>
          )}
        </div>
      )}
    </div>
  );
};
