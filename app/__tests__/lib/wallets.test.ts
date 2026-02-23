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

  it("returns the configured Privy wallet list", () => {
    expect(getPrivyWalletList()).toEqual([
      "detected_solana_wallets",
      "phantom",
      "solflare",
      "backpack",
      "wallet_connect",
    ]);
  });
});
