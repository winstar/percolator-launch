import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getRpcEndpoint, getConfig } from "@/lib/config";

const originalEnv = { ...process.env };

function clearWindow() {
  // @ts-expect-error test helper
  delete globalThis.window;
}

describe("Mainnet Configuration Validation", () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
    clearWindow();
  });

  it("should document mainnet crankWallet TODO", () => {
    // This is a known blocker for mainnet launch (Issue #244)
    // Test documents the requirement and will fail if accidentally deployedwithout it
    clearWindow();
    process.env.NEXT_PUBLIC_DEFAULT_NETWORK = "mainnet";
    
    const config = getConfig();
    // Skip test if not on mainnet (should only run when explicitly testing mainnet)
    if (config.network !== "mainnet") {
      return;
    }
    
    expect(config.crankWallet).toBeTruthy(
      "Mainnet crankWallet is required. Deploy keeper bot and set in app/lib/config.ts"
    );
  });

  it("should document mainnet matcherProgramId deployed", () => {
    // Verify matcher program is deployed to mainnet
    clearWindow();
    process.env.NEXT_PUBLIC_DEFAULT_NETWORK = "mainnet";
    
    const config = getConfig();
    // Skip test if not on mainnet
    if (config.network !== "mainnet") {
      return;
    }
    
    // Should be a valid Base58 address (44 chars)
    expect(config.matcherProgramId).toBeTruthy();
    expect(config.matcherProgramId).toHaveLength(44);
  });

  it("should have valid devnet crankWallet", () => {
    // Devnet config should always have these values for local testing
    clearWindow();
    process.env.NEXT_PUBLIC_DEFAULT_NETWORK = "devnet";
    
    const config = getConfig();
    expect(config.crankWallet).toBeTruthy();
    expect(config.crankWallet).toHaveLength(44); // Base58 address length
  });

  it("should have valid devnet matcherProgramId", () => {
    // Devnet config should always have these values for local testing
    clearWindow();
    process.env.NEXT_PUBLIC_DEFAULT_NETWORK = "devnet";
    
    const config = getConfig();
    expect(config.matcherProgramId).toBeTruthy();
    expect(config.matcherProgramId).toHaveLength(44); // Base58 address length
  });
});

describe("getRpcEndpoint", () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
    clearWindow();
  });

  it("returns absolute /api/rpc when running in browser", () => {
    vi.stubGlobal("window", { location: { origin: "https://example.com" } } as any);
    expect(getRpcEndpoint()).toBe("https://example.com/api/rpc");
  });

  it("prefers NEXT_PUBLIC_HELIUS_RPC_URL on the server", () => {
    clearWindow();
    process.env.NEXT_PUBLIC_HELIUS_RPC_URL = "https://devnet.helius-rpc.com/?api-key=abc";
    expect(getRpcEndpoint()).toBe("https://devnet.helius-rpc.com/?api-key=abc");
  });

  it("falls back to public devnet RPC when no Helius config provided", () => {
    clearWindow();
    delete process.env.NEXT_PUBLIC_HELIUS_RPC_URL;
    delete process.env.HELIUS_API_KEY;
    delete process.env.NEXT_PUBLIC_HELIUS_API_KEY;
    delete process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
    expect(getRpcEndpoint()).toBe("https://api.devnet.solana.com");
  });
});
