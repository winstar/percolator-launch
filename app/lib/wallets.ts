export type InstalledWalletDetector = {
  phantom: boolean;
  solflare: boolean;
  backpack: boolean;
};

const ORDER: (keyof InstalledWalletDetector)[] = ["phantom", "solflare", "backpack"];

export function getInstalledWalletIds(detector: InstalledWalletDetector): string[] {
  return ORDER.filter((key) => detector[key]);
}

export function getPrivyWalletList(): string[] {
  return [
    "detected_solana_wallets",
    "phantom",
    "solflare",
    "backpack",
    "wallet_connect",
  ];
}

export function defaultWalletDetector(): InstalledWalletDetector {
  if (typeof window === "undefined") {
    return { phantom: false, solflare: false, backpack: false };
  }

  const win = window as unknown as {
    phantom?: { solana?: { isPhantom?: boolean } };
    solflare?: { isSolflare?: boolean };
    backpack?: { isBackpack?: boolean };
  };

  return {
    phantom: !!win.phantom?.solana?.isPhantom,
    solflare: !!win.solflare?.isSolflare,
    backpack: !!win.backpack?.isBackpack,
  };
}
