import type { WalletListEntry } from "@privy-io/react-auth";

export type InstalledWalletDetector = {
  phantom: boolean;
  solflare: boolean;
  backpack: boolean;
};

const ORDER: (keyof InstalledWalletDetector)[] = ["phantom", "solflare", "backpack"];
const DEFAULT_WALLETS: WalletListEntry[] = ["phantom", "solflare", "backpack"];
const DETECTED_ENTRY: WalletListEntry = "detected_solana_wallets";
const WALLET_CONNECT_ENTRY: WalletListEntry = "wallet_connect";

export function getInstalledWalletIds(detector: InstalledWalletDetector): WalletListEntry[] {
  return ORDER.filter((key) => detector[key]) as WalletListEntry[];
}

export function getPrivyWalletList(installedWalletIds: WalletListEntry[] = []): WalletListEntry[] {
  const installed = installedWalletIds.filter((id) => DEFAULT_WALLETS.includes(id));
  const suggestions = DEFAULT_WALLETS.filter((id) => !installed.includes(id));

  if (installed.length > 0) {
    return [...installed, DETECTED_ENTRY, ...suggestions, WALLET_CONNECT_ENTRY];
  }

  return [...DEFAULT_WALLETS, DETECTED_ENTRY, WALLET_CONNECT_ENTRY];
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
