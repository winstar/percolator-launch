import { describe, it, expect, vi, beforeEach } from "vitest";
import { PublicKey } from "@solana/web3.js";
import { marketRoutes } from "../../src/routes/markets.js";

// Mock dependencies
vi.mock("@percolator/shared", () => ({
  getConnection: vi.fn(),
  getSupabase: vi.fn(),
}));

vi.mock("@percolator/core", () => ({
  fetchSlab: vi.fn(),
  parseHeader: vi.fn(),
  parseConfig: vi.fn(),
  parseEngine: vi.fn(),
}));

const { getConnection, getSupabase } = await import("@percolator/shared");
const { fetchSlab, parseHeader, parseConfig, parseEngine } = await import("@percolator/core");

describe("markets routes", () => {
  let mockConnection: any;
  let mockSupabase: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockConnection = {};
    mockSupabase = {
      from: vi.fn(() => mockSupabase),
      select: vi.fn(() => mockSupabase),
      eq: vi.fn(() => mockSupabase),
      single: vi.fn(() => mockSupabase),
    };

    vi.mocked(getConnection).mockReturnValue(mockConnection);
    vi.mocked(getSupabase).mockReturnValue(mockSupabase);
  });

  describe("GET /markets", () => {
    it("should return merged market and stats data", async () => {
      const mockMarkets = [
        {
          slab_address: "11111111111111111111111111111111",
          mint_address: "TokenMint111111111111111111111111",
          symbol: "BTC-PERP",
          name: "Bitcoin Perpetual",
          decimals: 9,
          deployer: "Deployer11111111111111111111111111",
          oracle_authority: "Oracle111111111111111111111111111",
          initial_price_e6: 50000000000,
          max_leverage: 10,
          trading_fee_bps: 5,
          lp_collateral: "1000000000",
          matcher_context: null,
          status: "active",
          logo_url: null,
          created_at: "2025-01-01T00:00:00Z",
          updated_at: "2025-01-01T00:00:00Z",
        },
      ];

      const mockStats = [
        {
          slab_address: "11111111111111111111111111111111",
          total_open_interest: "5000000000",
          total_accounts: 100,
          last_crank_slot: 123456789,
          last_price: 50000000000,
          mark_price: 50000000000,
          index_price: 50000000000,
          funding_rate: 5,
          net_lp_pos: "1000000",
        },
      ];

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "markets") {
          return {
            select: vi.fn().mockResolvedValue({ data: mockMarkets, error: null }),
          };
        } else if (table === "market_stats") {
          return {
            select: vi.fn().mockResolvedValue({ data: mockStats, error: null }),
          };
        }
        return mockSupabase;
      });

      const app = marketRoutes();
      const res = await app.request("/markets");

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.markets).toHaveLength(1);
      expect(data.markets[0].slabAddress).toBe("11111111111111111111111111111111");
      expect(data.markets[0].symbol).toBe("BTC-PERP");
      expect(data.markets[0].totalOpenInterest).toBe("5000000000");
      expect(data.markets[0].fundingRate).toBe(5);
    });

    it("should handle markets without stats", async () => {
      const mockMarkets = [
        {
          slab_address: "22222222222222222222222222222222",
          symbol: "ETH-PERP",
          mint_address: "Mint2222222222222222222222222222",
          name: "Ethereum Perpetual",
          decimals: 9,
          deployer: "Deployer22222222222222222222222222",
          oracle_authority: "Oracle222222222222222222222222222",
          initial_price_e6: 3000000000,
          max_leverage: 10,
          trading_fee_bps: 5,
          lp_collateral: "1000000000",
          matcher_context: null,
          status: "active",
          logo_url: null,
          created_at: "2025-01-01T00:00:00Z",
          updated_at: "2025-01-01T00:00:00Z",
        },
      ];

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "markets") {
          return {
            select: vi.fn().mockResolvedValue({ data: mockMarkets, error: null }),
          };
        } else if (table === "market_stats") {
          return {
            select: vi.fn().mockResolvedValue({ data: [], error: null }),
          };
        }
        return mockSupabase;
      });

      const app = marketRoutes();
      const res = await app.request("/markets");

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.markets).toHaveLength(1);
      expect(data.markets[0].totalOpenInterest).toBeNull();
      expect(data.markets[0].fundingRate).toBeNull();
    });
  });

  describe("GET /markets/stats", () => {
    it("should return all market stats", async () => {
      const mockStats = [
        { slab_address: "11111111111111111111111111111111", total_open_interest: "5000000000" },
        { slab_address: "22222222222222222222222222222222", total_open_interest: "3000000000" },
      ];

      mockSupabase.select.mockResolvedValue({ data: mockStats, error: null });

      const app = marketRoutes();
      const res = await app.request("/markets/stats");

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.stats).toHaveLength(2);
    });
  });

  describe("GET /markets/:slab/stats", () => {
    it("should return stats for single market", async () => {
      const mockStat = {
        slab_address: "11111111111111111111111111111111",
        total_open_interest: "5000000000",
        funding_rate: 5,
      };

      mockSupabase.single.mockResolvedValue({ data: mockStat, error: null });

      const app = marketRoutes();
      const res = await app.request("/markets/11111111111111111111111111111111/stats");

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.stats.slab_address).toBe("11111111111111111111111111111111");
    });

    it("should return 400 for invalid slab", async () => {
      const app = marketRoutes();
      const res = await app.request("/markets/invalid-slab/stats");

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("Invalid slab address");
    });
  });

  describe("GET /markets/:slab", () => {
    it("should return on-chain market data", async () => {
      const mockSlabData = Buffer.alloc(100);
      
      vi.mocked(fetchSlab).mockResolvedValue(mockSlabData);
      vi.mocked(parseHeader).mockReturnValue({
        magic: BigInt(0x504552434F4C),
        version: 1,
        admin: new PublicKey("11111111111111111111111111111111"),
        resolved: true,
      });
      vi.mocked(parseConfig).mockReturnValue({
        collateralMint: new PublicKey("11111111111111111111111111111111"),
        vaultPubkey: new PublicKey("11111111111111111111111111111111"),
        oracleAuthority: new PublicKey("11111111111111111111111111111111"),
        authorityPriceE6: BigInt(50000000000),
      });
      vi.mocked(parseEngine).mockReturnValue({
        vault: BigInt(1000000000),
        totalOpenInterest: BigInt(5000000000),
        numUsedAccounts: 100,
        lastCrankSlot: BigInt(123456789),
      });

      const app = marketRoutes();
      const res = await app.request("/markets/11111111111111111111111111111111");

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.slabAddress).toBe("11111111111111111111111111111111");
      expect(data.header).toBeDefined();
      expect(data.config).toBeDefined();
      expect(data.engine).toBeDefined();
    });

    it("should return 400 for invalid slab address", async () => {
      const app = marketRoutes();
      const res = await app.request("/markets/invalid-address");

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("Invalid slab address");
    });

    it("should handle on-chain fetch errors", async () => {
      vi.mocked(fetchSlab).mockRejectedValue(new Error("Account not found"));

      const app = marketRoutes();
      const res = await app.request("/markets/11111111111111111111111111111111");

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("Account not found");
    });
  });
});
