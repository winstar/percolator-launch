export type InstalledWalletDetector = {
  phantom: boolean;
  solflare: boolean;
  backpack: boolean;
};

const ORDER: (keyof InstalledWalletDetector)[] = ["phantom", "solflare", "backpack"];
const DEFAULT_WALLETS: string[] = [...ORDER];

export function getInstalledWalletIds(detector: InstalledWalletDetector): string[] {
  return ORDER.filter((key) => detector[key]);
}

export function getPrivyWalletList(installedWalletIds: string[] = []): string[] {
  const installed = installedWalletIds.filter((id) => DEFAULT_WALLETS.includes(id));
  const suggestions = DEFAULT_WALLETS.filter((id) => !installed.includes(id));

  if (installed.length > 0) {
    return [...installed, "detected_solana_wallets", ...suggestions, "wallet_connect"];
  }

  return [...DEFAULT_WALLETS, "detected_solana_wallets", "wallet_connect"];
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
