-- Fix RLS write policies to require service_role instead of anon
-- This ensures only backend services can write data, not anonymous users

-- Drop existing INSERT/UPDATE policies on critical tables
DROP POLICY IF EXISTS "markets_insert" ON markets;
DROP POLICY IF EXISTS "markets_update" ON markets;
DROP POLICY IF EXISTS "market_stats_insert" ON market_stats;
DROP POLICY IF EXISTS "market_stats_update" ON market_stats;
DROP POLICY IF EXISTS "trades_insert" ON trades;
DROP POLICY IF EXISTS "oracle_prices_insert" ON oracle_prices;
DROP POLICY IF EXISTS "oracle_prices_update" ON oracle_prices;

-- Markets: Only service_role can insert/update
CREATE POLICY "markets_insert_service_only"
  ON markets FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "markets_update_service_only"
  ON markets FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Market stats: Only service_role can insert/update
CREATE POLICY "market_stats_insert_service_only"
  ON market_stats FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "market_stats_update_service_only"
  ON market_stats FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Trades: Only service_role can insert
CREATE POLICY "trades_insert_service_only"
  ON trades FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Oracle prices: Only service_role can insert/update
CREATE POLICY "oracle_prices_insert_service_only"
  ON oracle_prices FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "oracle_prices_update_service_only"
  ON oracle_prices FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Add INSERT policies for history tables (if they exist and don't have policies)
DO $$
BEGIN
  -- Insurance history
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'insurance_history') THEN
    EXECUTE 'DROP POLICY IF EXISTS "insurance_history_insert" ON insurance_history';
    EXECUTE 'CREATE POLICY "insurance_history_insert_service_only"
      ON insurance_history FOR INSERT
      TO service_role
      WITH CHECK (true)';
  END IF;

  -- OI history
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'oi_history') THEN
    EXECUTE 'DROP POLICY IF EXISTS "oi_history_insert" ON oi_history';
    EXECUTE 'CREATE POLICY "oi_history_insert_service_only"
      ON oi_history FOR INSERT
      TO service_role
      WITH CHECK (true)';
  END IF;

  -- Funding history
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'funding_history') THEN
    EXECUTE 'DROP POLICY IF EXISTS "funding_history_insert" ON funding_history';
    EXECUTE 'CREATE POLICY "funding_history_insert_service_only"
      ON funding_history FOR INSERT
      TO service_role
      WITH CHECK (true)';
  END IF;
END
$$;

-- Keep SELECT policies for anon (read-only public access)
-- These should already exist, but ensure they're in place
DO $$
BEGIN
  -- Markets SELECT
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'markets' AND policyname = 'markets_select_anon'
  ) THEN
    EXECUTE 'CREATE POLICY "markets_select_anon"
      ON markets FOR SELECT
      TO anon
      USING (true)';
  END IF;

  -- Market stats SELECT
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'market_stats' AND policyname = 'market_stats_select_anon'
  ) THEN
    EXECUTE 'CREATE POLICY "market_stats_select_anon"
      ON market_stats FOR SELECT
      TO anon
      USING (true)';
  END IF;

  -- Trades SELECT
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'trades' AND policyname = 'trades_select_anon'
  ) THEN
    EXECUTE 'CREATE POLICY "trades_select_anon"
      ON trades FOR SELECT
      TO anon
      USING (true)';
  END IF;

  -- Oracle prices SELECT
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'oracle_prices' AND policyname = 'oracle_prices_select_anon'
  ) THEN
    EXECUTE 'CREATE POLICY "oracle_prices_select_anon"
      ON oracle_prices FOR SELECT
      TO anon
      USING (true)';
  END IF;
END
$$;
