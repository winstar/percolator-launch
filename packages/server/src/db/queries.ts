import pool from './client.js';

// ============================================================================
// Market Stats Queries
// ============================================================================

export interface MarketStats {
  slab_address: string;
  warmup_period_slots: bigint | null;
  total_open_interest: string | null;
  net_lp_pos: string | null;
  lp_sum_abs: string | null;
  lp_max_abs: string | null;
  insurance_balance: string | null;
  insurance_fee_revenue: string | null;
  updated_at: Date;
}

/**
 * Update market stats with hidden features data
 */
export async function updateMarketStats(
  slabAddress: string,
  data: {
    warmupPeriodSlots?: bigint;
    totalOpenInterest?: string;
    netLpPos?: string;
    lpSumAbs?: string;
    lpMaxAbs?: string;
    insuranceBalance?: string;
    insuranceFeeRevenue?: string;
  }
): Promise<void> {
  const query = `
    INSERT INTO market_stats (
      slab_address,
      warmup_period_slots,
      total_open_interest,
      net_lp_pos,
      lp_sum_abs,
      lp_max_abs,
      insurance_balance,
      insurance_fee_revenue,
      updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
    ON CONFLICT (slab_address) 
    DO UPDATE SET
      warmup_period_slots = EXCLUDED.warmup_period_slots,
      total_open_interest = EXCLUDED.total_open_interest,
      net_lp_pos = EXCLUDED.net_lp_pos,
      lp_sum_abs = EXCLUDED.lp_sum_abs,
      lp_max_abs = EXCLUDED.lp_max_abs,
      insurance_balance = EXCLUDED.insurance_balance,
      insurance_fee_revenue = EXCLUDED.insurance_fee_revenue,
      updated_at = NOW()
  `;

  await pool.query(query, [
    slabAddress,
    data.warmupPeriodSlots ?? null,
    data.totalOpenInterest ?? null,
    data.netLpPos ?? null,
    data.lpSumAbs ?? null,
    data.lpMaxAbs ?? null,
    data.insuranceBalance ?? null,
    data.insuranceFeeRevenue ?? null,
  ]);
}

/**
 * Get market stats by slab address
 */
export async function getMarketStats(slabAddress: string): Promise<MarketStats | null> {
  const query = `
    SELECT 
      slab_address,
      warmup_period_slots,
      total_open_interest,
      net_lp_pos,
      lp_sum_abs,
      lp_max_abs,
      insurance_balance,
      insurance_fee_revenue,
      updated_at
    FROM market_stats
    WHERE slab_address = $1
  `;

  const result = await pool.query(query, [slabAddress]);
  return result.rows[0] || null;
}

// ============================================================================
// Insurance History Queries
// ============================================================================

export interface InsuranceHistoryEntry {
  id: bigint;
  market_slab: string;
  slot: bigint;
  timestamp: Date;
  balance: string;
  fee_revenue: string;
}

/**
 * Insert insurance history snapshot
 */
export async function insertInsuranceHistory(
  marketSlab: string,
  slot: bigint,
  balance: string,
  feeRevenue: string
): Promise<void> {
  const query = `
    INSERT INTO insurance_history (market_slab, slot, balance, fee_revenue, timestamp)
    VALUES ($1, $2, $3, $4, NOW())
    ON CONFLICT (market_slab, slot) DO NOTHING
  `;

  await pool.query(query, [marketSlab, slot, balance, feeRevenue]);
}

/**
 * Get insurance history for a market (last N hours)
 */
export async function getInsuranceHistory(
  marketSlab: string,
  hoursBack: number = 24
): Promise<InsuranceHistoryEntry[]> {
  const query = `
    SELECT id, market_slab, slot, timestamp, balance, fee_revenue
    FROM insurance_history
    WHERE market_slab = $1 
      AND timestamp > NOW() - INTERVAL '${hoursBack} hours'
    ORDER BY timestamp DESC
  `;

  const result = await pool.query(query, [marketSlab]);
  return result.rows;
}

/**
 * Get 24h fee growth for insurance fund
 */
export async function get24hFeeGrowth(marketSlab: string): Promise<string | null> {
  const query = `
    WITH ordered AS (
      SELECT fee_revenue, 
             ROW_NUMBER() OVER (ORDER BY timestamp DESC) as rn
      FROM insurance_history
      WHERE market_slab = $1
        AND timestamp > NOW() - INTERVAL '24 hours'
    )
    SELECT 
      (SELECT fee_revenue FROM ordered WHERE rn = 1) -
      (SELECT fee_revenue FROM ordered ORDER BY rn DESC LIMIT 1) as growth
  `;

  const result = await pool.query(query, [marketSlab]);
  return result.rows[0]?.growth ?? null;
}

// ============================================================================
// Open Interest History Queries
// ============================================================================

export interface OIHistoryEntry {
  id: bigint;
  market_slab: string;
  slot: bigint;
  timestamp: Date;
  total_oi: string;
  net_lp_pos: string;
  lp_sum_abs: string;
  lp_max_abs: string;
}

/**
 * Insert OI history snapshot
 */
export async function insertOIHistory(
  marketSlab: string,
  slot: bigint,
  totalOI: string,
  netLpPos: string,
  lpSumAbs: string,
  lpMaxAbs: string
): Promise<void> {
  const query = `
    INSERT INTO oi_history (market_slab, slot, total_oi, net_lp_pos, lp_sum_abs, lp_max_abs, timestamp)
    VALUES ($1, $2, $3, $4, $5, $6, NOW())
    ON CONFLICT (market_slab, slot) DO NOTHING
  `;

  await pool.query(query, [marketSlab, slot, totalOI, netLpPos, lpSumAbs, lpMaxAbs]);
}

/**
 * Get OI history for a market (last N hours)
 */
export async function getOIHistory(
  marketSlab: string,
  hoursBack: number = 24
): Promise<OIHistoryEntry[]> {
  const query = `
    SELECT id, market_slab, slot, timestamp, total_oi, net_lp_pos, lp_sum_abs, lp_max_abs
    FROM oi_history
    WHERE market_slab = $1 
      AND timestamp > NOW() - INTERVAL '${hoursBack} hours'
    ORDER BY timestamp DESC
  `;

  const result = await pool.query(query, [marketSlab]);
  return result.rows;
}

// ============================================================================
// Insurance Fund Health View
// ============================================================================

export interface InsuranceFundHealth {
  slab_address: string;
  insurance_balance: string;
  insurance_fee_revenue: string;
  total_open_interest: string;
  health_ratio: number | null;
}

/**
 * Get insurance fund health metrics
 */
export async function getInsuranceFundHealth(slabAddress: string): Promise<InsuranceFundHealth | null> {
  const query = `
    SELECT 
      slab_address,
      insurance_balance,
      insurance_fee_revenue,
      total_open_interest,
      CASE 
        WHEN total_open_interest > 0 THEN 
          (insurance_balance::numeric / total_open_interest::numeric)
        ELSE NULL
      END AS health_ratio
    FROM market_stats
    WHERE slab_address = $1
  `;

  const result = await pool.query(query, [slabAddress]);
  return result.rows[0] || null;
}

// ============================================================================
// Open Interest Imbalance View
// ============================================================================

export interface OIImbalance {
  slab_address: string;
  total_open_interest: string;
  net_lp_pos: string;
  lp_sum_abs: string;
  lp_max_abs: string;
  long_oi: string;
  short_oi: string;
  imbalance_percent: number;
}

/**
 * Get open interest imbalance metrics
 */
export async function getOIImbalance(slabAddress: string): Promise<OIImbalance | null> {
  const query = `
    SELECT 
      slab_address,
      total_open_interest,
      net_lp_pos,
      lp_sum_abs,
      lp_max_abs,
      ((total_open_interest::numeric - net_lp_pos::numeric) / 2) AS long_oi,
      ((total_open_interest::numeric + net_lp_pos::numeric) / 2) AS short_oi,
      CASE 
        WHEN total_open_interest::numeric > 0 THEN 
          (net_lp_pos::numeric * 100.0 / total_open_interest::numeric)
        ELSE 0
      END AS imbalance_percent
    FROM market_stats
    WHERE slab_address = $1
  `;

  const result = await pool.query(query, [slabAddress]);
  return result.rows[0] || null;
}
