/**
 * Coin-margined perpetual trade math utilities.
 *
 * On-chain PnL formula:
 *   mark_pnl = (oracle - entry) * abs_pos / oracle   (longs)
 *   mark_pnl = (entry - oracle) * abs_pos / oracle   (shorts)
 */

export function computeMarkPnl(
  positionSize: bigint,
  entryPrice: bigint,
  oraclePrice: bigint,
): bigint {
  if (positionSize === 0n || oraclePrice === 0n) return 0n;
  const absPos = positionSize < 0n ? -positionSize : positionSize;
  const diff = positionSize > 0n
    ? oraclePrice - entryPrice
    : entryPrice - oraclePrice;
  return (diff * absPos) / oraclePrice;
}

export function computeLiqPrice(
  entryPrice: bigint,
  capital: bigint,
  positionSize: bigint,
  maintenanceMarginBps: bigint,
): bigint {
  if (positionSize === 0n || entryPrice === 0n) return 0n;
  const absPos = positionSize < 0n ? -positionSize : positionSize;
  const maintBps = Number(maintenanceMarginBps);
  const capitalPerUnit = (Number(capital) * 1e6) / Number(absPos);
  const adjusted = (capitalPerUnit * 10000) / (10000 + maintBps);

  if (positionSize > 0n) {
    const liq = Number(entryPrice) - adjusted;
    return liq > 0 ? BigInt(Math.round(liq)) : 0n;
  } else {
    return BigInt(Math.round(Number(entryPrice) + adjusted));
  }
}

export function computePreTradeLiqPrice(
  oracleE6: bigint,
  margin: bigint,
  posSize: bigint,
  maintBps: bigint,
  feeBps: bigint,
  direction: "long" | "short",
): bigint {
  if (oracleE6 === 0n || margin === 0n || posSize === 0n) return 0n;
  const absPos = posSize < 0n ? -posSize : posSize;
  const fee = (absPos * feeBps) / 10000n;
  const effectiveCapital = margin > fee ? margin - fee : 0n;
  const signedPos = direction === "long" ? absPos : -absPos;
  return computeLiqPrice(oracleE6, effectiveCapital, signedPos, maintBps);
}

export function computeTradingFee(notional: bigint, tradingFeeBps: bigint): bigint {
  return (notional * tradingFeeBps) / 10000n;
}

export function computePnlPercent(pnlTokens: bigint, capital: bigint): number {
  if (capital === 0n) return 0;
  return (Number(pnlTokens) / Number(capital)) * 100;
}

export function computeEstimatedEntryPrice(
  oracleE6: bigint,
  tradingFeeBps: bigint,
  direction: "long" | "short",
): bigint {
  if (oracleE6 === 0n) return 0n;
  const feeImpact = (oracleE6 * tradingFeeBps) / 10000n;
  return direction === "long" ? oracleE6 + feeImpact : oracleE6 - feeImpact;
}

export function computeFundingRateAnnualized(fundingRateBpsPerSlot: bigint): number {
  const bpsPerSlot = Number(fundingRateBpsPerSlot);
  const slotsPerYear = 2.5 * 60 * 60 * 24 * 365;
  return (bpsPerSlot * slotsPerYear) / 100;
}
