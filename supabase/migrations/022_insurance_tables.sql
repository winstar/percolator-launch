-- Create insurance-related tables referenced by InsuranceLPService

-- Insurance snapshots table
-- Stores periodic snapshots of insurance fund state
CREATE TABLE IF NOT EXISTS insurance_snapshots (
  id BIGSERIAL PRIMARY KEY,
  slab_address TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Insurance fund metrics
  total_deposits BIGINT NOT NULL DEFAULT 0,
  total_shares BIGINT NOT NULL DEFAULT 0,
  share_price_e6 BIGINT NOT NULL DEFAULT 0,
  net_pnl BIGINT NOT NULL DEFAULT 0,
  
  -- Market context
  total_open_interest BIGINT NOT NULL DEFAULT 0,
  total_volume_24h BIGINT NOT NULL DEFAULT 0,
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insurance LP events table
-- Stores deposit/withdrawal/liquidation events
CREATE TABLE IF NOT EXISTS insurance_lp_events (
  id BIGSERIAL PRIMARY KEY,
  slab_address TEXT NOT NULL,
  event_type TEXT NOT NULL, -- 'deposit', 'withdraw', 'liquidation'
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Event details
  lp_account_idx INTEGER,
  owner TEXT,
  amount BIGINT NOT NULL DEFAULT 0,
  shares BIGINT NOT NULL DEFAULT 0,
  share_price_e6 BIGINT NOT NULL DEFAULT 0,
  
  -- Transaction reference
  signature TEXT,
  slot BIGINT,
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for insurance_snapshots
CREATE INDEX IF NOT EXISTS idx_insurance_snapshots_slab ON insurance_snapshots(slab_address);
CREATE INDEX IF NOT EXISTS idx_insurance_snapshots_timestamp ON insurance_snapshots(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_insurance_snapshots_slab_timestamp ON insurance_snapshots(slab_address, timestamp DESC);

-- Indexes for insurance_lp_events
CREATE INDEX IF NOT EXISTS idx_insurance_lp_events_slab ON insurance_lp_events(slab_address);
CREATE INDEX IF NOT EXISTS idx_insurance_lp_events_type ON insurance_lp_events(event_type);
CREATE INDEX IF NOT EXISTS idx_insurance_lp_events_owner ON insurance_lp_events(owner);
CREATE INDEX IF NOT EXISTS idx_insurance_lp_events_timestamp ON insurance_lp_events(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_insurance_lp_events_signature ON insurance_lp_events(signature);
CREATE INDEX IF NOT EXISTS idx_insurance_lp_events_slab_timestamp ON insurance_lp_events(slab_address, timestamp DESC);

-- Enable Row Level Security
ALTER TABLE insurance_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurance_lp_events ENABLE ROW LEVEL SECURITY;

-- RLS policies: Read access for anon, write access for service_role only
CREATE POLICY "insurance_snapshots_select_anon"
  ON insurance_snapshots FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "insurance_snapshots_insert_service_only"
  ON insurance_snapshots FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "insurance_lp_events_select_anon"
  ON insurance_lp_events FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "insurance_lp_events_insert_service_only"
  ON insurance_lp_events FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Comments for documentation
COMMENT ON TABLE insurance_snapshots IS 'Periodic snapshots of insurance fund state per market';
COMMENT ON TABLE insurance_lp_events IS 'Insurance LP deposit/withdrawal/liquidation events';

COMMENT ON COLUMN insurance_snapshots.slab_address IS 'Market orderbook address (Base58)';
COMMENT ON COLUMN insurance_snapshots.total_deposits IS 'Total capital deposited in insurance fund';
COMMENT ON COLUMN insurance_snapshots.total_shares IS 'Total insurance LP shares outstanding';
COMMENT ON COLUMN insurance_snapshots.share_price_e6 IS 'Current share price (6 decimal precision)';
COMMENT ON COLUMN insurance_snapshots.net_pnl IS 'Net PnL of insurance fund (from liquidations etc)';

COMMENT ON COLUMN insurance_lp_events.event_type IS 'Event type: deposit, withdraw, or liquidation';
COMMENT ON COLUMN insurance_lp_events.lp_account_idx IS 'Insurance LP account index in slab';
COMMENT ON COLUMN insurance_lp_events.amount IS 'Amount of capital (deposits/withdrawals) or PnL (liquidations)';
COMMENT ON COLUMN insurance_lp_events.shares IS 'Number of shares minted/burned';
COMMENT ON COLUMN insurance_lp_events.signature IS 'Transaction signature (Base58)';
