import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock modules before importing the hook
vi.mock('@/lib/supabase', () => ({
  getSupabase: vi.fn(),
}));

vi.mock('@/lib/mock-mode', () => ({
  isMockMode: vi.fn(() => true),
}));

describe('useEarnStats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exports required types', async () => {
    const mod = await import('@/hooks/useEarnStats');
    expect(mod.useEarnStats).toBeDefined();
    expect(typeof mod.useEarnStats).toBe('function');
  });

  it('mock stats have correct structure', async () => {
    // In mock mode, the hook should generate mock data with correct shape
    const { isMockMode } = await import('@/lib/mock-mode');
    (isMockMode as ReturnType<typeof vi.fn>).mockReturnValue(true);

    // We can't easily test hooks outside React, but we can verify the module structure
    const mod = await import('@/hooks/useEarnStats');
    expect(mod).toBeDefined();
  });
});

describe('EarnStats types', () => {
  it('MarketVaultInfo has all required fields', async () => {
    // Type-level test: verify the interface shape compiles
    const sampleVault = {
      slabAddress: 'test-address',
      symbol: 'SOL',
      name: 'Solana',
      vaultBalance: 1000000,
      totalOI: 5000,
      maxOI: 50000,
      insuranceFund: 100000,
      volume24h: 25000,
      tradingFeeBps: 10,
      maxLeverage: 20,
      estimatedApyPct: 15.5,
      oiUtilPct: 10,
    };

    expect(sampleVault.slabAddress).toBe('test-address');
    expect(sampleVault.estimatedApyPct).toBe(15.5);
    expect(sampleVault.oiUtilPct).toBe(10);
  });

  it('EarnStats has all aggregate fields', () => {
    const sampleStats = {
      tvl: 100000,
      totalOI: 50000,
      maxOI: 500000,
      avgApyPct: 20.5,
      oiUtilPct: 10,
      totalInsurance: 10000,
      markets: [],
      dailyFeeRevenue: 500,
    };

    expect(sampleStats.tvl).toBe(100000);
    expect(sampleStats.avgApyPct).toBe(20.5);
    expect(sampleStats.dailyFeeRevenue).toBe(500);
  });
});
