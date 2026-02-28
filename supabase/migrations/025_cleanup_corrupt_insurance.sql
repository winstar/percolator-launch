-- Migration 025: Clean up corrupt insurance_fund and vault_balance values
-- Created: 2026-02-28
-- Purpose: Some markets have garbage insurance_fund values (up to 1e18) from
--          bad slab tier detection in earlier indexer versions. These cause the
--          /earn page to display ~$1T insurance instead of ~$1M.
--
-- Fix: Zero out insurance_fund, insurance_balance, and vault_balance values
--      that exceed a sane maximum (1e13 micro-USDC = $10M USD).
--      Real insurance funds on devnet are all < $200K.

UPDATE market_stats
SET insurance_fund = 0,
    insurance_balance = 0
WHERE insurance_fund > 1e13;

UPDATE market_stats
SET vault_balance = 0
WHERE vault_balance > 1e13;

DO $$
DECLARE
  ins_count INTEGER;
  vault_count INTEGER;
BEGIN
  SELECT count(*) INTO ins_count FROM market_stats WHERE insurance_fund = 0;
  SELECT count(*) INTO vault_count FROM market_stats WHERE vault_balance = 0;
  RAISE NOTICE 'Migration 025: Cleaned corrupt insurance_fund and vault_balance values';
END $$;
