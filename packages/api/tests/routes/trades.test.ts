import { describe, it, expect, vi, beforeEach } from "vitest";
import { tradeRoutes } from "../../src/routes/trades.js";

// Mock @percolator/shared
vi.mock("@percolator/shared", () => ({
  getRecentTrades: vi.fn(),
  get24hVolume: vi.fn(),
  getGlobalRecentTrades: vi.fn(),
  getPriceHistory: vi.fn(),
}));

const { getRecentTrades, get24hVolume, getGlobalRecentTrades, getPriceHistory } = 
  await import("@percolator/shared");

describe("trades routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /markets/:slab/trades", () => {
    it("should return recent trades for a market", async () => {
      const mockTrades = [
        { id: "1", price: 50000, size: 100, timestamp: "2025-01-01T00:00:00Z" },
        { id: "2", price: 50100, size: 200, timestamp: "2025-01-01T00:01:00Z" },
      ];

      vi.mocked(getRecentTrades).mockResolvedValue(mockTrades);

      const app = tradeRoutes();
      const res = await app.request("/markets/11111111111111111111111111111111/trades");

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.trades).toHaveLength(2);
      expect(getRecentTrades).toHaveBeenCalledWith("11111111111111111111111111111111", 50);
    });

    it("should respect limit parameter", async () => {
      vi.mocked(getRecentTrades).mockResolvedValue([]);

      const app = tradeRoutes();
      await app.request("/markets/11111111111111111111111111111111/trades?limit=100");

      expect(getRecentTrades).toHaveBeenCalledWith("11111111111111111111111111111111", 100);
    });

    it("should clamp limit to 1-200 range", async () => {
      vi.mocked(getRecentTrades).mockResolvedValue([]);

      const app = tradeRoutes();
      
      // Test upper bound
      await app.request("/markets/11111111111111111111111111111111/trades?limit=500");
      expect(getRecentTrades).toHaveBeenCalledWith("11111111111111111111111111111111", 200);

      // Test lower bound
      await app.request("/markets/11111111111111111111111111111111/trades?limit=0");
      expect(getRecentTrades).toHaveBeenCalledWith("11111111111111111111111111111111", 1);
    });

    it("should return 400 for invalid slab format", async () => {
      const app = tradeRoutes();
      const res = await app.request("/markets/invalid-address/trades");

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("Invalid slab address");
    });

    it("should handle errors from getRecentTrades", async () => {
      vi.mocked(getRecentTrades).mockRejectedValue(new Error("Database error"));

      const app = tradeRoutes();
      const res = await app.request("/markets/11111111111111111111111111111111/trades");

      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.error).toBe("Failed to fetch trades");
    });
  });

  describe("GET /markets/:slab/volume", () => {
    it("should return 24h volume for a market", async () => {
      vi.mocked(get24hVolume).mockResolvedValue({
        volume: "10000000000",
        tradeCount: 150,
      });

      const app = tradeRoutes();
      const res = await app.request("/markets/11111111111111111111111111111111/volume");

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.slab_address).toBe("11111111111111111111111111111111");
      expect(data.volume_24h).toBe("10000000000");
      expect(data.trade_count_24h).toBe(150);
    });

    it("should return 400 for invalid slab format", async () => {
      const app = tradeRoutes();
      const res = await app.request("/markets/invalid/volume");

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("Invalid slab address");
    });
  });

  describe("GET /markets/:slab/prices", () => {
    it("should return price history for a market", async () => {
      const mockPrices = [
        { price_e6: 50000000000, timestamp: "2025-01-01T00:00:00Z" },
        { price_e6: 50100000000, timestamp: "2025-01-01T01:00:00Z" },
      ];

      vi.mocked(getPriceHistory).mockResolvedValue(mockPrices);

      const app = tradeRoutes();
      const res = await app.request("/markets/11111111111111111111111111111111/prices");

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.slab_address).toBe("11111111111111111111111111111111");
      expect(data.prices).toHaveLength(2);
      expect(data.prices[0].price).toBe(50000);
      expect(data.prices[0].price_e6).toBe(50000000000);
    });

    it("should handle hours parameter", async () => {
      vi.mocked(getPriceHistory).mockResolvedValue([]);

      const app = tradeRoutes();
      await app.request("/markets/11111111111111111111111111111111/prices?hours=48");

      // Check that getPriceHistory was called with a timestamp ~48 hours ago
      expect(getPriceHistory).toHaveBeenCalled();
      const call = vi.mocked(getPriceHistory).mock.calls[0];
      const sinceEpoch = call[1];
      const expectedEpoch = Math.floor((Date.now() - 48 * 60 * 60 * 1000) / 1000);
      expect(sinceEpoch).toBeCloseTo(expectedEpoch, -2); // Within ~100 seconds
    });

    it("should clamp hours to 1-720 range", async () => {
      vi.mocked(getPriceHistory).mockResolvedValue([]);

      const app = tradeRoutes();
      
      // Test upper bound
      await app.request("/markets/11111111111111111111111111111111/prices?hours=1000");
      const call1 = vi.mocked(getPriceHistory).mock.calls[0];
      const since1 = call1[1];
      const expected1 = Math.floor((Date.now() - 720 * 60 * 60 * 1000) / 1000);
      expect(since1).toBeCloseTo(expected1, -2);

      // Test lower bound
      await app.request("/markets/11111111111111111111111111111111/prices?hours=0");
      const call2 = vi.mocked(getPriceHistory).mock.calls[1];
      const since2 = call2[1];
      const expected2 = Math.floor((Date.now() - 1 * 60 * 60 * 1000) / 1000);
      expect(since2).toBeCloseTo(expected2, -2);
    });

    it("should return 400 for invalid slab format", async () => {
      const app = tradeRoutes();
      const res = await app.request("/markets/invalid/prices");

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("Invalid slab address");
    });
  });

  describe("GET /trades/recent", () => {
    it("should return global recent trades", async () => {
      const mockTrades = [
        { id: "1", slab_address: "11111111111111111111111111111111", price: 50000 },
        { id: "2", slab_address: "22222222222222222222222222222222", price: 3000 },
      ];

      vi.mocked(getGlobalRecentTrades).mockResolvedValue(mockTrades);

      const app = tradeRoutes();
      const res = await app.request("/trades/recent");

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.trades).toHaveLength(2);
      expect(getGlobalRecentTrades).toHaveBeenCalledWith(50);
    });

    it("should respect limit parameter", async () => {
      vi.mocked(getGlobalRecentTrades).mockResolvedValue([]);

      const app = tradeRoutes();
      await app.request("/trades/recent?limit=100");

      expect(getGlobalRecentTrades).toHaveBeenCalledWith(100);
    });

    it("should clamp limit to 1-200 range", async () => {
      vi.mocked(getGlobalRecentTrades).mockResolvedValue([]);

      const app = tradeRoutes();
      
      // Test upper bound
      await app.request("/trades/recent?limit=300");
      expect(getGlobalRecentTrades).toHaveBeenCalledWith(200);

      // Test lower bound  
      await app.request("/trades/recent?limit=-5");
      expect(getGlobalRecentTrades).toHaveBeenCalledWith(1);
    });
  });
});
