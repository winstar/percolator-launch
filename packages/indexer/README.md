# @percolator/indexer

Standalone indexing service for Percolator markets — reads on-chain data and writes to Supabase.

## Architecture

**NO public API** except webhook receiver endpoint. This is a background service that:

1. **Discovers markets** — Polls for new Percolator markets across all program IDs
2. **Collects stats** — Reads on-chain slab data every 30s and populates `market_stats`, `oracle_prices`, `oi_history`, `insurance_history`, `funding_history` tables
3. **Indexes trades** — Primary mode is Helius webhooks, with backup polling every 5 minutes
4. **Tracks insurance LP** — Monitors insurance fund balance and LP supply for APY calculations
5. **Manages webhooks** — Auto-registers Helius webhooks for real-time trade notifications

## Services

- **MarketDiscovery** — Discovers markets from on-chain programs (replaces CrankService dependency)
- **StatsCollector** — Reads slab data and populates stats tables
- **TradeIndexerPolling** — Backup/backfill trade indexer (primary is webhook-driven)
- **InsuranceLPService** — Tracks insurance fund and LP metrics
- **HeliusWebhookManager** — Manages Helius webhook registration

## Key Design Decisions

1. **MarketProvider interface** — Services depend on `MarketProvider` instead of `CrankService`, allowing different discovery strategies
2. **No OracleService dependency** — Uses on-chain prices directly from `marketConfig.authorityPriceE6`
3. **Shared utilities** — All DB queries, config, and utility functions imported from `@percolator/shared`
4. **Minimal HTTP surface** — Only `/health` and `/webhook/trades` endpoints

## Environment Variables

- `INDEXER_PORT` — HTTP server port (default: 3002)
- All other config from `@percolator/shared` (RPC, Supabase, Helius, etc.)

## Usage

```bash
# Development
pnpm dev

# Production
pnpm build
pnpm start
```

## Integration

This package is designed to run as a separate process from the API server:

- **API server** (`packages/server`) — Handles user requests, crank operations, real-time data
- **Indexer** (`packages/indexer`) — Background data collection, no user-facing API

Both share `@percolator/shared` for DB access and utilities.
