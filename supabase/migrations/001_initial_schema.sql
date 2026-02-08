-- Percolator Launch — Initial Database Schema
-- Run against Supabase project: ygvbajglkrwkbjdjyhxi

-- Markets table — registered on-chain markets
CREATE TABLE IF NOT EXISTS markets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slab_address TEXT UNIQUE NOT NULL,
  mint_address TEXT NOT NULL,
  symbol TEXT NOT NULL DEFAULT 'UNKNOWN',
  name TEXT NOT NULL DEFAULT 'Unknown Token',
  decimals INTEGER NOT NULL DEFAULT 6,
  deployer TEXT NOT NULL,
  oracle_authority TEXT,
  initial_price_e6 TEXT,
  max_leverage INTEGER DEFAULT 10,
  trading_fee_bps INTEGER DEFAULT 10,
  lp_collateral TEXT,
  matcher_context TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Market stats — latest on-chain stats (updated by crank/indexer)
CREATE TABLE IF NOT EXISTS market_stats (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slab_address TEXT UNIQUE NOT NULL REFERENCES markets(slab_address) ON DELETE CASCADE,
  last_price NUMERIC,
  price_change_24h NUMERIC,
  volume_24h NUMERIC DEFAULT 0,
  open_interest NUMERIC DEFAULT 0,
  num_traders INTEGER DEFAULT 0,
  vault_balance NUMERIC DEFAULT 0,
  insurance_balance NUMERIC DEFAULT 0,
  last_crank_slot BIGINT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trades table — trade history (populated by indexer or frontend)
CREATE TABLE IF NOT EXISTS trades (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slab_address TEXT NOT NULL REFERENCES markets(slab_address) ON DELETE CASCADE,
  trader TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('long', 'short')),
  size NUMERIC NOT NULL,
  price NUMERIC NOT NULL,
  fee NUMERIC DEFAULT 0,
  tx_signature TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Oracle prices — historical price data
CREATE TABLE IF NOT EXISTS oracle_prices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slab_address TEXT NOT NULL REFERENCES markets(slab_address) ON DELETE CASCADE,
  price_e6 TEXT NOT NULL,
  source TEXT DEFAULT 'admin',
  timestamp BIGINT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- View: markets with latest stats
CREATE OR REPLACE VIEW markets_with_stats AS
SELECT
  m.*,
  s.last_price,
  s.price_change_24h,
  s.volume_24h,
  s.open_interest,
  s.num_traders,
  s.vault_balance,
  s.insurance_balance,
  s.last_crank_slot
FROM markets m
LEFT JOIN market_stats s ON m.slab_address = s.slab_address;

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_markets_mint ON markets(mint_address);
CREATE INDEX IF NOT EXISTS idx_markets_deployer ON markets(deployer);
CREATE INDEX IF NOT EXISTS idx_trades_slab ON trades(slab_address, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_oracle_prices_slab ON oracle_prices(slab_address, timestamp DESC);

-- RLS policies (enable row-level security)
ALTER TABLE markets ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE oracle_prices ENABLE ROW LEVEL SECURITY;

-- Public read access for all tables
CREATE POLICY "Public read access" ON markets FOR SELECT USING (true);
CREATE POLICY "Public read access" ON market_stats FOR SELECT USING (true);
CREATE POLICY "Public read access" ON trades FOR SELECT USING (true);
CREATE POLICY "Public read access" ON oracle_prices FOR SELECT USING (true);

-- Only service role can insert/update (enforced by using service role key server-side)
-- Anon key can only read via the policies above
