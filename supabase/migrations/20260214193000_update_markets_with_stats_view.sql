-- Migration 008: Update markets_with_stats view to include hidden features columns
-- This fixes "Cannot read properties of undefined (reading 'totalOi')" errors

CREATE OR REPLACE VIEW markets_with_stats AS
SELECT
  m.*,
  s.last_price,
  s.mark_price,
  s.index_price,
  s.volume_24h,
  s.volume_total,
  s.open_interest_long,
  s.open_interest_short,
  s.insurance_fund,
  s.total_accounts,
  s.funding_rate,
  -- New columns from migration 007 (hidden features)
  s.total_open_interest,
  s.net_lp_pos,
  s.lp_sum_abs,
  s.lp_max_abs,
  s.insurance_balance,
  s.insurance_fee_revenue,
  s.warmup_period_slots,
  s.updated_at as stats_updated_at
FROM markets m
LEFT JOIN market_stats s ON m.slab_address = s.slab_address;

COMMENT ON VIEW markets_with_stats IS 'Combined view of markets with their latest stats including hidden transparency features';
