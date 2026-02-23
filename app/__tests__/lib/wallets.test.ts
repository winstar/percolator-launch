import { describe, it, expect } from "vitest";
import { getInstalledWalletIds } from "@/lib/wallets";

describe("wallet helpers", () => {
  it("returns installed wallet ids in preferred order", () => {
    const detector = { phantom: true, solflare: false, backpack: true };
    expect(getInstalledWalletIds(detector)).toEqual(["phantom", "backpack"]);
  });

  it("returns empty array when nothing installed", () => {
    const detector = { phantom: false, solflare: false, backpack: false };
    expect(getInstalledWalletIds(detector)).toEqual([]);
  });
});
