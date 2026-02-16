import { describe, it, expect, vi, beforeEach } from "vitest";
import { healthRoutes } from "../../src/routes/health.js";

// Mock @percolator/shared
vi.mock("@percolator/shared", () => ({
  getConnection: vi.fn(),
  getSupabase: vi.fn(),
}));

const { getConnection, getSupabase } = await import("@percolator/shared");

describe("health routes", () => {
  let mockConnection: any;
  let mockSupabase: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockConnection = {
      getSlot: vi.fn(),
    };

    mockSupabase = {
      from: vi.fn(() => mockSupabase),
      select: vi.fn(() => mockSupabase),
    };

    vi.mocked(getConnection).mockReturnValue(mockConnection);
    vi.mocked(getSupabase).mockReturnValue(mockSupabase);
  });

  it("should return 200 with healthy status when RPC and DB work", async () => {
    mockConnection.getSlot.mockResolvedValue(123456789);
    mockSupabase.select.mockResolvedValue({ count: 5, error: null });

    const app = healthRoutes();
    const res = await app.request("/health");

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("healthy");
    expect(data.service).toBe("api");
    expect(data.checks.rpc).toBe("ok (slot: 123456789)");
    expect(data.checks.database).toBe("ok (5 markets)");
  });

  it("should return 503 with degraded when RPC fails", async () => {
    mockConnection.getSlot.mockRejectedValue(new Error("RPC connection failed"));
    mockSupabase.select.mockResolvedValue({ count: 5, error: null });

    const app = healthRoutes();
    const res = await app.request("/health");

    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.status).toBe("degraded");
    expect(data.service).toBe("api");
    expect(data.checks.rpc).toBe("error");
    expect(data.checks.database).toBe("ok (5 markets)");
  });

  it("should return 503 with degraded when DB fails", async () => {
    mockConnection.getSlot.mockResolvedValue(123456789);
    // Need to make the promise reject, not resolve with an error
    mockSupabase.select.mockRejectedValue(new Error("DB error"));

    const app = healthRoutes();
    const res = await app.request("/health");

    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.status).toBe("degraded");
    expect(data.service).toBe("api");
    expect(data.checks.rpc).toBe("ok (slot: 123456789)");
    expect(data.checks.database).toBe("error");
  });

  it("should return 503 when both RPC and DB fail", async () => {
    mockConnection.getSlot.mockRejectedValue(new Error("RPC error"));
    mockSupabase.select.mockRejectedValue(new Error("DB error"));

    const app = healthRoutes();
    const res = await app.request("/health");

    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.status).toBe("degraded");
    expect(data.service).toBe("api");
    expect(data.checks.rpc).toBe("error");
    expect(data.checks.database).toBe("error");
  });

  it("should include service name in response", async () => {
    mockConnection.getSlot.mockResolvedValue(100);
    mockSupabase.select.mockResolvedValue({ count: 0, error: null });

    const app = healthRoutes();
    const res = await app.request("/health");

    const data = await res.json();
    expect(data.service).toBe("api");
  });

  it("should handle 0 markets count", async () => {
    mockConnection.getSlot.mockResolvedValue(123456789);
    mockSupabase.select.mockResolvedValue({ count: 0, error: null });

    const app = healthRoutes();
    const res = await app.request("/health");

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.checks.database).toBe("ok (0 markets)");
  });
});
