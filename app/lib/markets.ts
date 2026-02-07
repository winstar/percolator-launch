export interface MarketInfo {
  slab: string;
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  createdAt: string;
  deployer: string;
}

const STORAGE_KEY = "percolator_launch_markets";

export function getStoredMarkets(): MarketInfo[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function addMarket(market: MarketInfo): void {
  const markets = getStoredMarkets();
  // Avoid duplicates
  if (markets.some((m) => m.slab === market.slab)) return;
  markets.push(market);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(markets));
}

export function getMarket(slab: string): MarketInfo | undefined {
  return getStoredMarkets().find((m) => m.slab === slab);
}
