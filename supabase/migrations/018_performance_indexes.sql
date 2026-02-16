-- Migration 018: Performance Indexes
-- Optimizes query performance for frequently-accessed data patterns

-- Market stats lookups by slab (already primary key, but ensure index exists)
CREATE INDEX IF NOT EXISTS idx_market_stats_slab ON market_stats(slab_address);

-- Funding history queries (by market, ordered by time)
CREATE INDEX IF NOT EXISTS idx_funding_history_market_time ON funding_history(market_slab, timestamp DESC);

-- Trades by market (for trade history pages)
CREATE INDEX IF NOT EXISTS idx_trades_market_time ON trades(slab_address, timestamp DESC);

-- Trades by signature (for duplicate detection)
CREATE INDEX IF NOT EXISTS idx_trades_signature ON trades(tx_signature);

-- Oracle prices by market and time
CREATE INDEX IF NOT EXISTS idx_oracle_prices_market_time ON oracle_prices(slab_address, timestamp DESC);

-- Markets by deployer (for "my markets" queries)
CREATE INDEX IF NOT EXISTS idx_markets_deployer ON markets(deployer);

-- Bug reports by status
CREATE INDEX IF NOT EXISTS idx_bug_reports_status ON bug_reports(status);

COMMENT ON INDEX idx_funding_history_market_time IS 'Optimizes funding history queries by market and time range';
COMMENT ON INDEX idx_trades_market_time IS 'Optimizes trade history queries by market';
COMMENT ON INDEX idx_trades_signature IS 'Optimizes duplicate trade detection by signature';
COMMENT ON INDEX idx_oracle_prices_market_time IS 'Optimizes oracle price history queries';
COMMENT ON INDEX idx_markets_deployer IS 'Optimizes "my markets" queries by deployer address';
COMMENT ON INDEX idx_bug_reports_status IS 'Optimizes bug report filtering by status';
