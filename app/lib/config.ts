export type Network = "mainnet" | "devnet";

function getNetwork(): Network {
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem("percolator_network");
    if (stored === "devnet" || stored === "mainnet") return stored;
  }
  return (process.env.NEXT_PUBLIC_DEFAULT_NETWORK as Network) ?? "devnet";
}

const CONFIGS = {
  mainnet: {
    rpcUrl: "https://mainnet.helius-rpc.com/?api-key=e568033d-06d6-49d1-ba90-b3564c91851b",
    programId: "GM8zjJ8LTBMv9xEsverh6H6wLyevgMHEJXcEzyY3rY24",
    matcherProgramId: "DHP6DtwXP1yJsz8YzfoeigRFPB979gzmumkmCxDLSkUX",
    explorerUrl: "https://solscan.io",
  },
  devnet: {
    rpcUrl: "https://devnet.helius-rpc.com/?api-key=e568033d-06d6-49d1-ba90-b3564c91851b",
    programId: "EXsr2Tfz8ntWYP3vgCStdknFBoafvJQugJKAh4nFdo8f",
    matcherProgramId: "8VvDz1y1AFmzLhBZN5vRCSbBhVx3qiN6vqxCmk3arune",
    explorerUrl: "https://explorer.solana.com",
  },
} as const;

export function getConfig() {
  const network = getNetwork();
  return {
    ...CONFIGS[network],
    network,
    // Slab size is fixed by the program — next_free array is hardcoded [u16; 4096]
    // 992,560 bytes = ~6.85 SOL rent. Cannot use smaller sizes.
    slabSize: 992_560,
    matcherCtxSize: 320,
    priorityFee: 50_000,
  };
}

export function setNetwork(network: Network) {
  if (typeof window !== "undefined") {
    localStorage.setItem("percolator_network", network);
    window.location.reload();
  }
}

// For backward compat
export const config = getConfig();
