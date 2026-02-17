-- Migration 007: Hidden Features (PNL Warmup, Insurance Fund, Open Interest)
-- Created: 2026-02-14
-- Purpose: Expose on-chain data for warmup, insurance, and OI tracking

-- ============================================================================
-- 1. Extend market_stats table with new fields
-- ============================================================================

-- PNL Warmup
ALTER TABLE market_stats 
ADD COLUMN IF NOT EXISTS warmup_period_slots BIGINT;

-- Open Interest aggregates
ALTER TABLE market_stats 
ADD COLUMN IF NOT EXISTS total_open_interest NUMERIC;

ALTER TABLE market_stats 
ADD COLUMN IF NOT EXISTS net_lp_pos NUMERIC;

ALTER TABLE market_stats 
ADD COLUMN IF NOT EXISTS lp_sum_abs NUMERIC;

ALTER TABLE market_stats 
ADD COLUMN IF NOT EXISTS lp_max_abs NUMERIC;

-- Insurance Fund
ALTER TABLE market_stats 
ADD COLUMN IF NOT EXISTS insurance_balance NUMERIC;

ALTER TABLE market_stats 
ADD COLUMN IF NOT EXISTS insurance_fee_revenue NUMERIC;

-- Add comment explaining new fields
COMMENT ON COLUMN market_stats.warmup_period_slots IS 'PNL warmup period in slots (from RiskParams)';
COMMENT ON COLUMN market_stats.total_open_interest IS 'Sum of abs(position_size) across all accounts';
COMMENT ON COLUMN market_stats.net_lp_pos IS 'Net LP position (sum of LP position_size, signed)';
COMMENT ON COLUMN market_stats.lp_sum_abs IS 'Sum of abs(position_size) for LP accounts only';
COMMENT ON COLUMN market_stats.lp_max_abs IS 'Maximum abs(position_size) among LP accounts';
COMMENT ON COLUMN market_stats.insurance_balance IS 'Insurance fund balance';
COMMENT ON COLUMN market_stats.insurance_fee_revenue IS 'Accumulated fees in insurance fund';

-- ============================================================================
-- 2. Insurance Fund History Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS insurance_history (
  id BIGSERIAL PRIMARY KEY,
  market_slab TEXT NOT NULL REFERENCES market_stats(slab_address),
  slot BIGINT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  balance NUMERIC NOT NULL,
  fee_revenue NUMERIC NOT NULL,
  -- Prevent duplicate entries for same slot
  UNIQUE(market_slab, slot)
);

-- Index for efficient time-series queries
CREATE INDEX IF NOT EXISTS idx_insurance_history_slab_time 
  ON insurance_history(market_slab, timestamp DESC);

-- Index for slot-based queries
CREATE INDEX IF NOT EXISTS idx_insurance_history_slab_slot 
  ON insurance_history(market_slab, slot DESC);

COMMENT ON TABLE insurance_history IS 'Time-series tracking of insurance fund balance and fee revenue';

-- ============================================================================
-- 3. Open Interest History Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS oi_history (
  id BIGSERIAL PRIMARY KEY,
  market_slab TEXT NOT NULL REFERENCES market_stats(slab_address),
  slot BIGINT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  total_oi NUMERIC NOT NULL,
  net_lp_pos NUMERIC NOT NULL,
  lp_sum_abs NUMERIC NOT NULL,
  lp_max_abs NUMERIC NOT NULL,
  -- Prevent duplicate entries for same slot
  UNIQUE(market_slab, slot)
);

-- Index for efficient time-series queries
CREATE INDEX IF NOT EXISTS idx_oi_history_slab_time 
  ON oi_history(market_slab, timestamp DESC);

-- Index for slot-based queries
CREATE INDEX IF NOT EXISTS idx_oi_history_slab_slot 
  ON oi_history(market_slab, slot DESC);

COMMENT ON TABLE oi_history IS 'Time-series tracking of open interest and LP aggregate metrics';

-- ============================================================================
-- 4. Views for Analytics
-- ============================================================================

-- Insurance Fund Health View
CREATE OR REPLACE VIEW insurance_fund_health AS
SELECT 
  m.slab_address,
  m.insurance_balance,
  m.insurance_fee_revenue,
  m.total_open_interest,
  -- Health ratio: insurance_balance / total_risk (where total_risk = total_open_interest)
  CASE 
    WHEN m.total_open_interest > 0 THEN m.insurance_balance / m.total_open_interest
    ELSE NULL
  END AS health_ratio,
  -- 24h fee accumulation (latest value - value 24h ago)
  COALESCE(
    m.insurance_fee_revenue - LAG(m.insurance_fee_revenue) OVER (
      PARTITION BY m.slab_address 
      ORDER BY m.updated_at
    ), 
    0
  ) AS fee_growth_24h
FROM market_stats m
ORDER BY m.slab_address;

COMMENT ON VIEW insurance_fund_health IS 'Insurance fund metrics with health ratio and accumulation rate';

-- Open Interest Imbalance View
CREATE OR REPLACE VIEW oi_imbalance AS
SELECT 
  m.slab_address,
  m.total_open_interest,
  m.net_lp_pos,
  m.lp_sum_abs,
  m.lp_max_abs,
  -- Long OI = (total_oi + net_lp_pos) / 2
  -- Short OI = (total_oi - net_lp_pos) / 2
  -- Because: total_oi = long_oi + short_oi and net_lp_pos = short_oi - long_oi (LP is counterparty)
  (m.total_open_interest - m.net_lp_pos) / 2 AS long_oi,
  (m.total_open_interest + m.net_lp_pos) / 2 AS short_oi,
  -- Imbalance percentage
  CASE 
    WHEN m.total_open_interest > 0 THEN 
      (m.net_lp_pos * 100.0 / m.total_open_interest)
    ELSE 0
  END AS imbalance_percent
FROM market_stats m
ORDER BY m.slab_address;

COMMENT ON VIEW oi_imbalance IS 'Open interest breakdown with long/short split and imbalance metrics';

-- ============================================================================
-- 5. Historical Data Cleanup (Optional: Keep last 30 days)
-- ============================================================================

-- Function to cleanup old history data (run via cron if needed)
CREATE OR REPLACE FUNCTION cleanup_old_history(days_to_keep INTEGER DEFAULT 30)
RETURNS TABLE(insurance_deleted BIGINT, oi_deleted BIGINT) AS $$
DECLARE
  ins_count BIGINT;
  oi_count BIGINT;
BEGIN
  -- Delete insurance history older than days_to_keep
  DELETE FROM insurance_history 
  WHERE timestamp < NOW() - (days_to_keep || ' days')::INTERVAL;
  
  GET DIAGNOSTICS ins_count = ROW_COUNT;
  
  -- Delete OI history older than days_to_keep
  DELETE FROM oi_history 
  WHERE timestamp < NOW() - (days_to_keep || ' days')::INTERVAL;
  
  GET DIAGNOSTICS oi_count = ROW_COUNT;
  
  RETURN QUERY SELECT ins_count, oi_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_old_history IS 'Delete history records older than specified days (default 30)';

-- ============================================================================
-- 6. RLS policies for new tables
-- ============================================================================

ALTER TABLE insurance_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE oi_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read insurance_history" ON insurance_history FOR SELECT USING (true);
CREATE POLICY "Public read oi_history" ON oi_history FOR SELECT USING (true);

-- ============================================================================
-- 7. Grants (Adjust based on your RLS policies)
-- ============================================================================

-- Grant read access to authenticated users (adjust as needed)
-- GRANT SELECT ON insurance_history TO authenticated;
-- GRANT SELECT ON oi_history TO authenticated;
-- GRANT SELECT ON insurance_fund_health TO authenticated;
-- GRANT SELECT ON oi_imbalance TO authenticated;

-- ============================================================================
-- Migration Complete
-- ============================================================================

-- Verify migration
DO $$
BEGIN
  RAISE NOTICE 'Migration 007 completed successfully';
  RAISE NOTICE 'New tables: insurance_history, oi_history';
  RAISE NOTICE 'New views: insurance_fund_health, oi_imbalance';
  RAISE NOTICE 'Extended market_stats with 7 new columns';
END $$;
