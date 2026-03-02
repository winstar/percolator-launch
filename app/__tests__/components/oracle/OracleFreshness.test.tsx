/**
 * useOracleFreshness Hook Tests
 * Tests: ORACLE-004, ORACLE-005, ORACLE-006, ORACLE-007
 *
 * ORACLE-004: Returns correct freshness levels based on elapsed time
 * ORACLE-005: Detects oracle mode from config
 * ORACLE-006: Returns mode label correctly
 * ORACLE-007: Admin mode with zero timestamp uses authorityPriceE6 fallback
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { PublicKey } from "@solana/web3.js";

// Dynamic mock config — reassign before each test as needed
let currentConfig: Record<string, unknown> | null = null;

vi.mock("@/components/providers/SlabProvider", () => ({
  useSlabState: () => ({
    config: currentConfig,
    slabAddress: "test-slab",
  }),
}));

import { useOracleFreshness } from "@/hooks/useOracleFreshness";

// Non-zero authority key for admin mode
const ADMIN_AUTHORITY = new PublicKey("Sysvar1111111111111111111111111111111111112");
const NON_ZERO_FEED = new PublicKey("Sysvar1111111111111111111111111111111111113");

describe("useOracleFreshness", () => {
  beforeEach(() => {
    // Default: hyperp mode config
    currentConfig = {
      oracleAuthority: PublicKey.default,
      indexFeedId: PublicKey.default,
      authorityPriceE6: 42000_000000n,
      authorityTimestamp: 0n,
      lastEffectivePriceE6: 42000_000000n,
      collateralMint: new PublicKey("So11111111111111111111111111111111111111112"),
    };
  });

  it("ORACLE-005: detects hyperp mode when indexFeedId is zero", () => {
    // indexFeedId = PublicKey.default (all zeros) → hyperp mode
    const { result } = renderHook(() => useOracleFreshness());
    expect(result.current.mode).toBe("hyperp");
    expect(result.current.modeLabel).toBe("HYPERP");
  });

  it("ORACLE-004: returns fresh level for < 5s elapsed", () => {
    const { result } = renderHook(() => useOracleFreshness());
    // On first render with price > 0, lastUpdateMs is set to Date.now()
    // so elapsedSecs should be 0 → "fresh"
    expect(result.current.level).toBe("fresh");
    expect(result.current.color).toBe("#22c55e");
  });

  it("ORACLE-006: returns ready=true when config is available", () => {
    const { result } = renderHook(() => useOracleFreshness());
    expect(result.current.ready).toBe(true);
  });

  it("ORACLE-007: admin mode with zero timestamp and zero lastEffectivePriceE6 uses authorityPriceE6", () => {
    // Simulate the exact bug: admin market where authorityTimestamp=0, lastEffectivePriceE6=0,
    // but authorityPriceE6 is set (the actual displayed price)
    currentConfig = {
      oracleAuthority: ADMIN_AUTHORITY,
      indexFeedId: NON_ZERO_FEED,
      authorityPriceE6: 21_100_011_000000n,
      authorityTimestamp: 0n,
      lastEffectivePriceE6: 0n,
      collateralMint: new PublicKey("So11111111111111111111111111111111111111112"),
    };

    const { result } = renderHook(() => useOracleFreshness());
    expect(result.current.mode).toBe("admin");
    expect(result.current.modeLabel).toBe("ADMIN");
    // The key assertion: ready should be true because authorityPriceE6 > 0
    expect(result.current.ready).toBe(true);
    expect(result.current.lastUpdateMs).not.toBeNull();
  });

  it("ORACLE-007b: admin mode with valid authorityTimestamp uses it directly", () => {
    const nowSecs = BigInt(Math.floor(Date.now() / 1000));
    currentConfig = {
      oracleAuthority: ADMIN_AUTHORITY,
      indexFeedId: NON_ZERO_FEED,
      authorityPriceE6: 50_000_000000n,
      authorityTimestamp: nowSecs,
      lastEffectivePriceE6: 0n,
      collateralMint: new PublicKey("So11111111111111111111111111111111111111112"),
    };

    const { result } = renderHook(() => useOracleFreshness());
    expect(result.current.mode).toBe("admin");
    expect(result.current.ready).toBe(true);
    expect(result.current.lastUpdateMs).toBe(Number(nowSecs) * 1000);
  });
});
