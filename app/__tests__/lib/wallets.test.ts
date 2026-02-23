import { describe, it, expect } from "vitest";
import { getInstalledWalletIds, getPrivyWalletList } from "@/lib/wallets";

describe("wallet helpers", () => {
  it("returns installed wallet ids in preferred order", () => {
    const detector = { phantom: true, solflare: false, backpack: true };
    expect(getInstalledWalletIds(detector)).toEqual(["phantom", "backpack"]);
  });

  it("returns empty array when nothing installed", () => {
    const detector = { phantom: false, solflare: false, backpack: false };
    expect(getInstalledWalletIds(detector)).toEqual([]);
  });

  it("returns installed-first Privy wallet list when wallets detected", () => {
    expect(getPrivyWalletList(["phantom", "backpack"])).toEqual([
      "phantom",
      "backpack",
      "detected_solana_wallets",
      "solflare",
      "wallet_connect",
    ]);
  });

  it("returns fallback Privy wallet list when none detected", () => {
    expect(getPrivyWalletList()).toEqual([
      "phantom",
      "solflare",
      "backpack",
      "detected_solana_wallets",
      "wallet_connect",
    ]);
  });
});
