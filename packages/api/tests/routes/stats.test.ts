import { describe, it, expect, vi, beforeEach } from "vitest";
import { statsRoutes } from "../../src/routes/stats.js";

// Mock @percolator/shared
vi.mock("@percolator/shared", () => ({
  getSupabase: vi.fn(),
  getConnection: vi.fn(),
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
  sanitizeSlabAddress: vi.fn((addr: string) => addr),
  sanitizePagination: vi.fn((p: any) => p),
  sanitizeString: vi.fn((s: string) => s),
  sendInfoAlert: vi.fn(),
  sendCriticalAlert: vi.fn(),
  sendWarningAlert: vi.fn(),
  eventBus: { on: vi.fn(), emit: vi.fn(), off: vi.fn() },
  config: { supabaseUrl: "http://test", supabaseKey: "test", rpcUrl: "http://test" },
}));

const { getSupabase } = await import("@percolator/shared");

describe("stats routes", () => {
  let mockSupabase: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockSupabase = {
      from: vi.fn(() => mockSupabase),
      select: vi.fn(() => mockSupabase),
      gte: vi.fn(() => mockSupabase),
    };

    vi.mocked(getSupabase).mockReturnValue(mockSupabase);
  });

  describe("GET /stats", () => {
    it("should return aggregated platform stats", async () => {
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "markets") {
          return {
            select: vi.fn().mockResolvedValue({ 
              count: 10, 
              error: null 
            }),
          };
        } else if (table === "market_stats") {
          return {
            select: vi.fn().mockResolvedValue({
              data: [
                { volume_24h: "1000000000", total_open_interest: "5000000000" },
                { volume_24h: "500000000", total_open_interest: "3000000000" },
              ],
              error: null,
            }),
          };
        } else if (table === "trades") {
          return {
            select: vi.fn(() => ({
              gte: vi.fn().mockResolvedValue({ 
                count: 1250, 
                error: null 
              }),
            })),
          };
        }
        return mockSupabase;
      });

      // Mock for deployers query (second call to markets table)
      let marketsCalls = 0;
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "markets") {
          marketsCalls++;
          if (marketsCalls === 1) {
            return {
              select: vi.fn().mockResolvedValue({ 
                count: 10, 
                error: null 
              }),
            };
          } else {
            return {
              select: vi.fn().mockResolvedValue({
                data: [
                  { deployer: "Deployer11111111111111111111111111" },
                  { deployer: "Deployer22222222222222222222222222" },
                  { deployer: "Deployer11111111111111111111111111" }, // Duplicate
                ],
                error: null,
              }),
            };
          }
        } else if (table === "market_stats") {
          return {
            select: vi.fn().mockResolvedValue({
              data: [
                { volume_24h: "1000000000", total_open_interest: "5000000000" },
                { volume_24h: "500000000", total_open_interest: "3000000000" },
              ],
              error: null,
            }),
          };
        } else if (table === "trades") {
          return {
            select: vi.fn(() => ({
              gte: vi.fn().mockResolvedValue({ 
                count: 1250, 
                error: null 
              }),
            })),
          };
        }
        return mockSupabase;
      });

      const app = statsRoutes();
      const res = await app.request("/stats");

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.totalMarkets).toBe(10);
      expect(data.volume24h).toBe("1500000000");
      expect(data.totalOpenInterest).toBe("8000000000");
      expect(data.uniqueDeployers).toBe(2);
      expect(data.trades24h).toBe(1250);
    });

    it("should handle BigInt aggregation correctly", async () => {
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "markets") {
          return {
            select: vi.fn().mockResolvedValue({ 
              count: 3, 
              error: null 
            }),
          };
        } else if (table === "market_stats") {
          return {
            select: vi.fn().mockResolvedValue({
              data: [
                { volume_24h: "999999999999999999", total_open_interest: "999999999999999999" },
                { volume_24h: "1", total_open_interest: "1" },
              ],
              error: null,
            }),
          };
        } else if (table === "trades") {
          return {
            select: vi.fn(() => ({
              gte: vi.fn().mockResolvedValue({ 
                count: 0, 
                error: null 
              }),
            })),
          };
        }
        return mockSupabase;
      });

      let marketsCalls = 0;
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "markets") {
          marketsCalls++;
          if (marketsCalls === 1) {
            return {
              select: vi.fn().mockResolvedValue({ 
                count: 3, 
                error: null 
              }),
            };
          } else {
            return {
              select: vi.fn().mockResolvedValue({
                data: [{ deployer: "Deployer11111111111111111111111111" }],
                error: null,
              }),
            };
          }
        } else if (table === "market_stats") {
          return {
            select: vi.fn().mockResolvedValue({
              data: [
                { volume_24h: "999999999999999999", total_open_interest: "999999999999999999" },
                { volume_24h: "1", total_open_interest: "1" },
              ],
              error: null,
            }),
          };
        } else if (table === "trades") {
          return {
            select: vi.fn(() => ({
              gte: vi.fn().mockResolvedValue({ 
                count: 0, 
                error: null 
              }),
            })),
          };
        }
        return mockSupabase;
      });

      const app = statsRoutes();
      const res = await app.request("/stats");

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.volume24h).toBe("1000000000000000000");
      expect(data.totalOpenInterest).toBe("1000000000000000000");
    });

    it("should handle zero values", async () => {
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "markets") {
          return {
            select: vi.fn().mockResolvedValue({ 
              count: 0, 
              error: null 
            }),
          };
        } else if (table === "market_stats") {
          return {
            select: vi.fn().mockResolvedValue({
              data: [],
              error: null,
            }),
          };
        } else if (table === "trades") {
          return {
            select: vi.fn(() => ({
              gte: vi.fn().mockResolvedValue({ 
                count: 0, 
                error: null 
              }),
            })),
          };
        }
        return mockSupabase;
      });

      let marketsCalls = 0;
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "markets") {
          marketsCalls++;
          if (marketsCalls === 1) {
            return {
              select: vi.fn().mockResolvedValue({ 
                count: 0, 
                error: null 
              }),
            };
          } else {
            return {
              select: vi.fn().mockResolvedValue({
                data: [],
                error: null,
              }),
            };
          }
        } else if (table === "market_stats") {
          return {
            select: vi.fn().mockResolvedValue({
              data: [],
              error: null,
            }),
          };
        } else if (table === "trades") {
          return {
            select: vi.fn(() => ({
              gte: vi.fn().mockResolvedValue({ 
                count: 0, 
                error: null 
              }),
            })),
          };
        }
        return mockSupabase;
      });

      const app = statsRoutes();
      const res = await app.request("/stats");

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.totalMarkets).toBe(0);
      expect(data.volume24h).toBe("0");
      expect(data.totalOpenInterest).toBe("0");
      expect(data.uniqueDeployers).toBe(0);
      expect(data.trades24h).toBe(0);
    });

    it("should handle null values in stats", async () => {
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "markets") {
          return {
            select: vi.fn().mockResolvedValue({ 
              count: 2, 
              error: null 
            }),
          };
        } else if (table === "market_stats") {
          return {
            select: vi.fn().mockResolvedValue({
              data: [
                { volume_24h: null, total_open_interest: null },
                { volume_24h: "1000000000", total_open_interest: "5000000000" },
              ],
              error: null,
            }),
          };
        } else if (table === "trades") {
          return {
            select: vi.fn(() => ({
              gte: vi.fn().mockResolvedValue({ 
                count: 100, 
                error: null 
              }),
            })),
          };
        }
        return mockSupabase;
      });

      let marketsCalls = 0;
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "markets") {
          marketsCalls++;
          if (marketsCalls === 1) {
            return {
              select: vi.fn().mockResolvedValue({ 
                count: 2, 
                error: null 
              }),
            };
          } else {
            return {
              select: vi.fn().mockResolvedValue({
                data: [{ deployer: "Deployer11111111111111111111111111" }],
                error: null,
              }),
            };
          }
        } else if (table === "market_stats") {
          return {
            select: vi.fn().mockResolvedValue({
              data: [
                { volume_24h: null, total_open_interest: null },
                { volume_24h: "1000000000", total_open_interest: "5000000000" },
              ],
              error: null,
            }),
          };
        } else if (table === "trades") {
          return {
            select: vi.fn(() => ({
              gte: vi.fn().mockResolvedValue({ 
                count: 100, 
                error: null 
              }),
            })),
          };
        }
        return mockSupabase;
      });

      const app = statsRoutes();
      const res = await app.request("/stats");

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.volume24h).toBe("1000000000");
      expect(data.totalOpenInterest).toBe("5000000000");
    });

    it("should handle database errors", async () => {
      mockSupabase.from.mockImplementation((table: string) => {
        return {
          select: vi.fn().mockResolvedValue({ 
            count: null, 
            data: null,
            error: new Error("Database error") 
          }),
        };
      });

      const app = statsRoutes();
      const res = await app.request("/stats");

      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.error).toBe("Failed to fetch platform statistics");
    });
  });
});
