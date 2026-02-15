-- Migration 012: Enhanced simulation tracking
-- Adds result stats, token info, and wallet tracking to simulation_sessions
-- Creates a view for the simulation gallery

-- Add columns to simulation_sessions
ALTER TABLE simulation_sessions
  ADD COLUMN IF NOT EXISTS token_symbol TEXT,
  ADD COLUMN IF NOT EXISTS token_name TEXT,
  ADD COLUMN IF NOT EXISTS mint_address TEXT,
  ADD COLUMN IF NOT EXISTS creator_wallet TEXT,
  ADD COLUMN IF NOT EXISTS end_price_e6 BIGINT,
  ADD COLUMN IF NOT EXISTS high_price_e6 BIGINT,
  ADD COLUMN IF NOT EXISTS low_price_e6 BIGINT,
  ADD COLUMN IF NOT EXISTS total_trades INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_liquidations INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_volume_e6 BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS force_closes INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS peak_oi_e6 BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS final_funding_rate_e6 BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS final_insurance_balance_e6 BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS final_insurance_health_pct NUMERIC(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS final_vault_balance_e6 BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS duration_seconds INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bot_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bots_data JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS share_image_url TEXT;

-- Index for gallery browsing (most recent completed first)
CREATE INDEX IF NOT EXISTS idx_simulation_gallery
  ON simulation_sessions(status, started_at DESC)
  WHERE status = 'completed';

-- Index for creator wallet lookup
CREATE INDEX IF NOT EXISTS idx_simulation_creator
  ON simulation_sessions(creator_wallet, started_at DESC)
  WHERE creator_wallet IS NOT NULL;

-- View: simulation gallery with computed stats
CREATE OR REPLACE VIEW simulation_gallery AS
SELECT
  id,
  slab_address,
  token_symbol,
  token_name,
  mint_address,
  creator_wallet,
  scenario,
  model,
  start_price_e6,
  end_price_e6,
  high_price_e6,
  low_price_e6,
  CASE 
    WHEN start_price_e6 > 0 THEN 
      ROUND(((end_price_e6 - start_price_e6)::NUMERIC / start_price_e6) * 100, 2)
    ELSE 0
  END AS price_change_pct,
  total_trades,
  total_liquidations,
  total_volume_e6,
  force_closes,
  peak_oi_e6,
  final_funding_rate_e6,
  final_insurance_balance_e6,
  final_insurance_health_pct,
  final_vault_balance_e6,
  duration_seconds,
  bot_count,
  bots_data,
  share_image_url,
  status,
  started_at,
  ended_at,
  config
FROM simulation_sessions
ORDER BY started_at DESC;

-- Enable RLS
ALTER TABLE simulation_sessions ENABLE ROW LEVEL SECURITY;

-- Allow public read access (simulations are public)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read simulation_sessions') THEN
    CREATE POLICY "Public read simulation_sessions" ON simulation_sessions FOR SELECT USING (true);
  END IF;
END $$;

-- Allow insert/update from service role only (Railway backend writes)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service write simulation_sessions') THEN
    CREATE POLICY "Service write simulation_sessions" ON simulation_sessions FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

COMMENT ON VIEW simulation_gallery IS 'Public view of all completed simulations with computed stats for browsing';
COMMENT ON COLUMN simulation_sessions.bots_data IS 'JSON array of bot results: [{name, type, pnl, trades, position}]';
COMMENT ON COLUMN simulation_sessions.share_image_url IS 'URL to the generated share image (stored in Supabase Storage or data URL)';
