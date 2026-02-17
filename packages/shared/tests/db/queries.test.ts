import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

// Mock the Supabase client module
vi.mock("../../src/db/client.js", () => {
  const mockSupabaseClient = {
    from: vi.fn(),
  };

  return {
    getSupabase: vi.fn(() => mockSupabaseClient),
  };
});

describe("queries", () => {
  let mockFrom: ReturnType<typeof vi.fn>;
  let mockSelect: ReturnType<typeof vi.fn>;
  let mockInsert: ReturnType<typeof vi.fn>;
  let mockUpsert: ReturnType<typeof vi.fn>;
  let mockEq: ReturnType<typeof vi.fn>;
  let mockGte: ReturnType<typeof vi.fn>;
  let mockSingle: ReturnType<typeof vi.fn>;
  let mockOrder: ReturnType<typeof vi.fn>;
  let mockLimit: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();

    // Setup chain-able mock methods
    mockSelect = vi.fn();
    mockInsert = vi.fn();
    mockUpsert = vi.fn();
    mockEq = vi.fn();
    mockGte = vi.fn();
    mockSingle = vi.fn();
    mockOrder = vi.fn();
    mockLimit = vi.fn();
    mockFrom = vi.fn();

    // Default: from returns a builder with all methods
    mockFrom.mockReturnValue({
      select: mockSelect,
      insert: mockInsert,
      upsert: mockUpsert,
    });

    // Setup method chaining
    mockSelect.mockReturnValue({
      eq: mockEq,
      gte: mockGte,
      order: mockOrder,
      limit: mockLimit,
    });

    mockEq.mockReturnValue({
      eq: mockEq,
      single: mockSingle,
      order: mockOrder,
      limit: mockLimit,
      gte: mockGte,
    });

    mockGte.mockReturnValue({
      order: mockOrder,
      gte: mockGte,
    });

    mockOrder.mockReturnValue({
      limit: mockLimit,
      order: mockOrder,
    });

    mockLimit.mockReturnValue({
      // Terminal - returns promise-like
    });

    mockSingle.mockReturnValue({
      // Terminal - returns promise-like
    });

    mockInsert.mockReturnValue({
      // Terminal for insert
    });

    mockUpsert.mockReturnValue({
      // Terminal for upsert
    });

    // Mock the getSupabase to return our mock
    const { getSupabase } = await import("../../src/db/client.js");
    (getSupabase as ReturnType<typeof vi.fn>).mockReturnValue({
      from: mockFrom,
    });
  });

  describe("getMarkets", () => {
    it("should return all markets", async () => {
      const mockMarkets = [
        { id: "1", slab_address: "slab1", symbol: "BTC" },
        { id: "2", slab_address: "slab2", symbol: "ETH" },
      ];

      mockSelect.mockResolvedValue({ data: mockMarkets, error: null });

      const { getMarkets } = await import("../../src/db/queries.js");
      const result = await getMarkets();

      expect(result).toEqual(mockMarkets);
      expect(mockFrom).toHaveBeenCalledWith("markets");
      expect(mockSelect).toHaveBeenCalledWith("*");
    });

    it("should throw error on failure", async () => {
      const mockError = { message: "Database error", code: "500" };
      mockSelect.mockResolvedValue({ data: null, error: mockError });

      const { getMarkets } = await import("../../src/db/queries.js");

      await expect(getMarkets()).rejects.toEqual(mockError);
    });

    it("should return empty array when no data", async () => {
      mockSelect.mockResolvedValue({ data: null, error: null });

      const { getMarkets } = await import("../../src/db/queries.js");
      const result = await getMarkets();

      expect(result).toEqual([]);
    });
  });

  describe("getMarketBySlabAddress", () => {
    it("should return market by slab address", async () => {
      const mockMarket = { id: "1", slab_address: "test-slab", symbol: "BTC" };
      mockSingle.mockResolvedValue({ data: mockMarket, error: null });

      const { getMarketBySlabAddress } = await import("../../src/db/queries.js");
      const result = await getMarketBySlabAddress("test-slab");

      expect(result).toEqual(mockMarket);
      expect(mockFrom).toHaveBeenCalledWith("markets");
      expect(mockSelect).toHaveBeenCalledWith("*");
      expect(mockEq).toHaveBeenCalledWith("slab_address", "test-slab");
      expect(mockSingle).toHaveBeenCalled();
    });

    it("should return null when market not found", async () => {
      mockSingle.mockResolvedValue({ data: null, error: { code: "PGRST116" } });

      const { getMarketBySlabAddress } = await import("../../src/db/queries.js");
      const result = await getMarketBySlabAddress("nonexistent");

      expect(result).toBeNull();
    });

    it("should throw on other errors", async () => {
      const mockError = { message: "Other error", code: "500" };
      mockSingle.mockResolvedValue({ data: null, error: mockError });

      const { getMarketBySlabAddress } = await import("../../src/db/queries.js");

      await expect(getMarketBySlabAddress("test")).rejects.toEqual(mockError);
    });
  });

  describe("insertMarket", () => {
    it("should insert market successfully", async () => {
      mockInsert.mockResolvedValue({ error: null });

      const { insertMarket } = await import("../../src/db/queries.js");
      const market = {
        slab_address: "test-slab",
        mint_address: "test-mint",
        symbol: "BTC",
        name: "Bitcoin",
        decimals: 8,
        deployer: "deployer-address",
        oracle_authority: null,
        initial_price_e6: 50000000000,
        max_leverage: 10,
        trading_fee_bps: 10,
        lp_collateral: null,
        matcher_context: null,
        status: "active",
      };

      await insertMarket(market);

      expect(mockFrom).toHaveBeenCalledWith("markets");
      expect(mockInsert).toHaveBeenCalledWith(market);
    });

    it("should ignore unique constraint violations (23505)", async () => {
      mockInsert.mockResolvedValue({ error: { code: "23505", message: "duplicate key" } });

      const { insertMarket } = await import("../../src/db/queries.js");
      const market = {
        slab_address: "test-slab",
        mint_address: "test-mint",
        symbol: "BTC",
        name: "Bitcoin",
        decimals: 8,
        deployer: "deployer",
        oracle_authority: null,
        initial_price_e6: 50000,
        max_leverage: 10,
        trading_fee_bps: 10,
        lp_collateral: null,
        matcher_context: null,
        status: "active",
      };

      // Should not throw
      await expect(insertMarket(market)).resolves.toBeUndefined();
    });

    it("should throw on other errors", async () => {
      const mockError = { code: "500", message: "Server error" };
      mockInsert.mockResolvedValue({ error: mockError });

      const { insertMarket } = await import("../../src/db/queries.js");
      const market = {
        slab_address: "test-slab",
        mint_address: "test-mint",
        symbol: "BTC",
        name: "Bitcoin",
        decimals: 8,
        deployer: "deployer",
        oracle_authority: null,
        initial_price_e6: 50000,
        max_leverage: 10,
        trading_fee_bps: 10,
        lp_collateral: null,
        matcher_context: null,
        status: "active",
      };

      await expect(insertMarket(market)).rejects.toEqual(mockError);
    });
  });

  describe("upsertMarketStats", () => {
    it("should upsert market stats", async () => {
      mockUpsert.mockResolvedValue({ error: null });

      const { upsertMarketStats } = await import("../../src/db/queries.js");
      const stats = {
        slab_address: "test-slab",
        last_price: 50000,
        volume_24h: 1000000,
      };

      await upsertMarketStats(stats);

      expect(mockFrom).toHaveBeenCalledWith("market_stats");
      expect(mockUpsert).toHaveBeenCalledWith(stats, { onConflict: "slab_address" });
    });

    it("should throw on error", async () => {
      const mockError = { code: "500", message: "Error" };
      mockUpsert.mockResolvedValue({ error: mockError });

      const { upsertMarketStats } = await import("../../src/db/queries.js");

      await expect(upsertMarketStats({ slab_address: "test" })).rejects.toEqual(mockError);
    });
  });

  describe("insertTrade", () => {
    it("should insert trade successfully", async () => {
      mockInsert.mockResolvedValue({ error: null });

      const { insertTrade } = await import("../../src/db/queries.js");
      const trade = {
        slab_address: "test-slab",
        trader: "trader-address",
        side: "long" as const,
        size: "1000000",
        price: 50000,
        fee: 5,
        tx_signature: "sig123",
      };

      await insertTrade(trade);

      expect(mockFrom).toHaveBeenCalledWith("trades");
      expect(mockInsert).toHaveBeenCalledWith(trade);
    });

    it("should ignore unique constraint violations (23505)", async () => {
      mockInsert.mockResolvedValue({ error: { code: "23505", message: "duplicate" } });

      const { insertTrade } = await import("../../src/db/queries.js");
      const trade = {
        slab_address: "test-slab",
        trader: "trader",
        side: "long" as const,
        size: 1000,
        price: 50000,
        fee: 5,
        tx_signature: "sig123",
      };

      await expect(insertTrade(trade)).resolves.toBeUndefined();
    });

    it("should throw on other errors", async () => {
      const mockError = { code: "500", message: "Error" };
      mockInsert.mockResolvedValue({ error: mockError });

      const { insertTrade } = await import("../../src/db/queries.js");
      const trade = {
        slab_address: "test-slab",
        trader: "trader",
        side: "short" as const,
        size: 1000,
        price: 50000,
        fee: 5,
        tx_signature: "sig123",
      };

      await expect(insertTrade(trade)).rejects.toEqual(mockError);
    });
  });

  describe("tradeExistsBySignature", () => {
    it("should return true when trade exists", async () => {
      mockLimit.mockResolvedValue({ data: [{ id: "1" }], error: null });

      const { tradeExistsBySignature } = await import("../../src/db/queries.js");
      const result = await tradeExistsBySignature("sig123");

      expect(result).toBe(true);
      expect(mockSelect).toHaveBeenCalledWith("id");
      expect(mockEq).toHaveBeenCalledWith("tx_signature", "sig123");
      expect(mockLimit).toHaveBeenCalledWith(1);
    });

    it("should return false when trade does not exist", async () => {
      mockLimit.mockResolvedValue({ data: [], error: null });

      const { tradeExistsBySignature } = await import("../../src/db/queries.js");
      const result = await tradeExistsBySignature("nonexistent");

      expect(result).toBe(false);
    });

    it("should throw on error", async () => {
      const mockError = { code: "500", message: "Error" };
      mockLimit.mockResolvedValue({ data: null, error: mockError });

      const { tradeExistsBySignature } = await import("../../src/db/queries.js");

      await expect(tradeExistsBySignature("sig")).rejects.toEqual(mockError);
    });
  });

  describe("insertOraclePrice", () => {
    it("should insert oracle price", async () => {
      mockInsert.mockResolvedValue({ error: null });

      const { insertOraclePrice } = await import("../../src/db/queries.js");
      const price = {
        slab_address: "test-slab",
        price_e6: "50000000000",
        timestamp: 1234567890,
        tx_signature: "sig123",
      };

      await insertOraclePrice(price);

      expect(mockFrom).toHaveBeenCalledWith("oracle_prices");
      expect(mockInsert).toHaveBeenCalledWith({
        slab_address: "test-slab",
        price_e6: "50000000000",
        timestamp: 1234567890,
        tx_signature: "sig123",
      });
    });

    it("should handle null tx_signature", async () => {
      mockInsert.mockResolvedValue({ error: null });

      const { insertOraclePrice } = await import("../../src/db/queries.js");
      const price = {
        slab_address: "test-slab",
        price_e6: "50000000000",
        timestamp: 1234567890,
      };

      await insertOraclePrice(price);

      expect(mockInsert).toHaveBeenCalledWith({
        slab_address: "test-slab",
        price_e6: "50000000000",
        timestamp: 1234567890,
        tx_signature: null,
      });
    });

    it("should throw on error", async () => {
      const mockError = { code: "500", message: "Error" };
      mockInsert.mockResolvedValue({ error: mockError });

      const { insertOraclePrice } = await import("../../src/db/queries.js");

      await expect(
        insertOraclePrice({
          slab_address: "test",
          price_e6: "1000",
          timestamp: 123,
        })
      ).rejects.toEqual(mockError);
    });
  });

  describe("getRecentTrades", () => {
    it("should get recent trades with default limit", async () => {
      const mockTrades = [
        { id: "1", slab_address: "test", size: 100 },
        { id: "2", slab_address: "test", size: 200 },
      ];
      mockLimit.mockResolvedValue({ data: mockTrades, error: null });

      const { getRecentTrades } = await import("../../src/db/queries.js");
      const result = await getRecentTrades("test-slab");

      expect(result).toEqual(mockTrades);
      expect(mockEq).toHaveBeenCalledWith("slab_address", "test-slab");
      expect(mockOrder).toHaveBeenCalledWith("created_at", { ascending: false });
      expect(mockLimit).toHaveBeenCalledWith(50);
    });

    it("should get recent trades with custom limit", async () => {
      mockLimit.mockResolvedValue({ data: [], error: null });

      const { getRecentTrades } = await import("../../src/db/queries.js");
      await getRecentTrades("test-slab", 100);

      expect(mockLimit).toHaveBeenCalledWith(100);
    });

    it("should throw on error", async () => {
      const mockError = { code: "500", message: "Error" };
      mockLimit.mockResolvedValue({ data: null, error: mockError });

      const { getRecentTrades } = await import("../../src/db/queries.js");

      await expect(getRecentTrades("test")).rejects.toEqual(mockError);
    });
  });

  describe("get24hVolume", () => {
    it("should calculate volume from BigInt sizes", async () => {
      const mockTrades = [
        { size: "1000000" },
        { size: "2000000" },
        { size: "-500000" }, // Negative (short)
      ];
      mockGte.mockResolvedValue({ data: mockTrades, error: null });

      const { get24hVolume } = await import("../../src/db/queries.js");
      const result = await get24hVolume("test-slab");

      // Total: 1000000 + 2000000 + 500000 = 3500000
      expect(result.volume).toBe("3500000");
      expect(result.tradeCount).toBe(3);
    });

    it("should handle numeric sizes", async () => {
      const mockTrades = [{ size: 1000 }, { size: -2000 }];
      mockGte.mockResolvedValue({ data: mockTrades, error: null });

      const { get24hVolume } = await import("../../src/db/queries.js");
      const result = await get24hVolume("test-slab");

      // Total: 1000 + 2000 = 3000
      expect(result.volume).toBe("3000");
      expect(result.tradeCount).toBe(2);
    });

    it("should handle empty trades", async () => {
      mockGte.mockResolvedValue({ data: [], error: null });

      const { get24hVolume } = await import("../../src/db/queries.js");
      const result = await get24hVolume("test-slab");

      expect(result.volume).toBe("0");
      expect(result.tradeCount).toBe(0);
    });

    it("should filter by 24h timestamp", async () => {
      mockGte.mockResolvedValue({ data: [], error: null });

      const { get24hVolume } = await import("../../src/db/queries.js");
      await get24hVolume("test-slab");

      // Check that gte was called with a recent timestamp
      expect(mockGte).toHaveBeenCalledWith("created_at", expect.any(String));
    });

    it("should throw on error", async () => {
      const mockError = { code: "500", message: "Error" };
      mockGte.mockResolvedValue({ data: null, error: mockError });

      const { get24hVolume } = await import("../../src/db/queries.js");

      await expect(get24hVolume("test")).rejects.toEqual(mockError);
    });
  });

  describe("getGlobalRecentTrades", () => {
    it("should get global trades with default limit", async () => {
      const mockTrades = [{ id: "1" }, { id: "2" }];
      mockLimit.mockResolvedValue({ data: mockTrades, error: null });

      const { getGlobalRecentTrades } = await import("../../src/db/queries.js");
      const result = await getGlobalRecentTrades();

      expect(result).toEqual(mockTrades);
      expect(mockOrder).toHaveBeenCalledWith("created_at", { ascending: false });
      expect(mockLimit).toHaveBeenCalledWith(50);
    });

    it("should get global trades with custom limit", async () => {
      mockLimit.mockResolvedValue({ data: [], error: null });

      const { getGlobalRecentTrades } = await import("../../src/db/queries.js");
      await getGlobalRecentTrades(200);

      expect(mockLimit).toHaveBeenCalledWith(200);
    });
  });

  describe("getPriceHistory", () => {
    it("should get price history since timestamp", async () => {
      const mockPrices = [
        { slab_address: "test", price_e6: "50000", timestamp: 100 },
        { slab_address: "test", price_e6: "51000", timestamp: 200 },
      ];
      mockOrder.mockResolvedValue({ data: mockPrices, error: null });

      const { getPriceHistory } = await import("../../src/db/queries.js");
      const result = await getPriceHistory("test-slab", 100);

      expect(result).toEqual(mockPrices);
      expect(mockEq).toHaveBeenCalledWith("slab_address", "test-slab");
      expect(mockGte).toHaveBeenCalledWith("timestamp", 100);
      expect(mockOrder).toHaveBeenCalledWith("timestamp", { ascending: true });
    });

    it("should throw on error", async () => {
      const mockError = { code: "500", message: "Error" };
      mockOrder.mockResolvedValue({ data: null, error: mockError });

      const { getPriceHistory } = await import("../../src/db/queries.js");

      await expect(getPriceHistory("test", 0)).rejects.toEqual(mockError);
    });
  });

  describe("insertFundingHistory", () => {
    it("should insert funding history record", async () => {
      mockInsert.mockResolvedValue({ error: null });

      const { insertFundingHistory } = await import("../../src/db/queries.js");
      const record = {
        market_slab: "test-slab",
        slot: 12345,
        timestamp: "2024-01-01T00:00:00Z",
        rate_bps_per_slot: 10,
        net_lp_pos: "1000000",
        price_e6: 50000000000,
        funding_index_qpb_e6: "1000000000",
      };

      await insertFundingHistory(record);

      expect(mockFrom).toHaveBeenCalledWith("funding_history");
      expect(mockInsert).toHaveBeenCalledWith(record);
    });

    it("should throw on error", async () => {
      const mockError = { code: "500", message: "Error" };
      mockInsert.mockResolvedValue({ error: mockError });

      const { insertFundingHistory } = await import("../../src/db/queries.js");

      await expect(
        insertFundingHistory({
          market_slab: "test",
          slot: 1,
          timestamp: "2024-01-01",
          rate_bps_per_slot: 1,
          net_lp_pos: "0",
          price_e6: 1000,
          funding_index_qpb_e6: "0",
        })
      ).rejects.toEqual(mockError);
    });
  });

  describe("getFundingHistory", () => {
    it("should get funding history with default limit", async () => {
      const mockHistory = [{ id: "1" }, { id: "2" }];
      mockLimit.mockResolvedValue({ data: mockHistory, error: null });

      const { getFundingHistory } = await import("../../src/db/queries.js");
      const result = await getFundingHistory("test-slab");

      expect(result).toEqual(mockHistory);
      expect(mockEq).toHaveBeenCalledWith("market_slab", "test-slab");
      expect(mockOrder).toHaveBeenCalledWith("timestamp", { ascending: false });
      expect(mockLimit).toHaveBeenCalledWith(100);
    });

    it("should get funding history with custom limit", async () => {
      mockLimit.mockResolvedValue({ data: [], error: null });

      const { getFundingHistory } = await import("../../src/db/queries.js");
      await getFundingHistory("test-slab", 200);

      expect(mockLimit).toHaveBeenCalledWith(200);
    });

    it("should return empty array on null data", async () => {
      mockLimit.mockResolvedValue({ data: null, error: null });

      const { getFundingHistory } = await import("../../src/db/queries.js");
      const result = await getFundingHistory("test-slab");

      expect(result).toEqual([]);
    });
  });

  describe("getFundingHistorySince", () => {
    it("should get funding history since timestamp", async () => {
      const mockHistory = [{ id: "1", timestamp: "2024-01-02" }];
      mockOrder.mockResolvedValue({ data: mockHistory, error: null });

      const { getFundingHistorySince } = await import("../../src/db/queries.js");
      const result = await getFundingHistorySince("test-slab", "2024-01-01T00:00:00Z");

      expect(result).toEqual(mockHistory);
      expect(mockEq).toHaveBeenCalledWith("market_slab", "test-slab");
      expect(mockGte).toHaveBeenCalledWith("timestamp", "2024-01-01T00:00:00Z");
      expect(mockOrder).toHaveBeenCalledWith("timestamp", { ascending: true });
    });

    it("should return empty array on null data", async () => {
      mockOrder.mockResolvedValue({ data: null, error: null });

      const { getFundingHistorySince } = await import("../../src/db/queries.js");
      const result = await getFundingHistorySince("test-slab", "2024-01-01");

      expect(result).toEqual([]);
    });
  });
});
