# @percolator/api

Public-facing REST + WebSocket API service for the Percolator Launch platform.

## Overview

This package provides a read-only API service that serves the frontend. Unlike `@percolator/server` (which has CrankService, OracleService, and mutation endpoints), this API is stateless and purely reads from:
- **Supabase** (for historical data, stats, and aggregated info)
- **On-chain** (for real-time slab reads via `fetchSlab`)
- **EventBus** (for WebSocket price/trade updates published by the indexer)

## Architecture

- **No services**: No CrankService, OracleService, LiquidationService, or PriceEngine
- **No keypair**: This service doesn't sign transactions or crank markets
- **Stateless**: All data comes from Supabase or on-chain reads
- **Event-driven WS**: WebSocket server listens to `eventBus` events published by the indexer

## Routes

### Health
- `GET /health` — Public health check (RPC + Supabase status)

### Markets
- `GET /markets` — List all markets from DB
- `GET /markets/stats` — All market stats from DB
- `GET /markets/:slab` — Single market details (on-chain read)
- `GET /markets/:slab/stats` — Single market stats from DB

### Trades
- `GET /markets/:slab/trades` — Recent trades for a market
- `GET /markets/:slab/volume` — 24h volume for a market
- `GET /markets/:slab/prices` — Price history for charts
- `GET /trades/recent` — Global recent trades

### Prices
- `GET /prices/markets` — List all markets with latest prices
- `GET /prices/:slab` — Current price + 24h stats
- `GET /prices/:slab/history` — Price history from DB

### Funding
- `GET /funding/:slab` — Current funding rate + 24h history
- `GET /funding/:slab/history` — Historical funding data
- `GET /funding/global` — Current funding rates for all markets

### Crank (Read-Only)
- `GET /crank/status` — All markets crank status from DB
- `GET /crank/:slab/status` — Single market crank status from DB

### Oracle Router
- `GET /oracle/resolve/:mint` — Resolve oracle sources for a token (cached 5min)

### WebSocket
- Connect to `/` (WebSocket upgrade)
- Send `{ type: "subscribe", slabAddress: "..." }` to subscribe to price/trade updates
- Send `{ type: "unsubscribe", slabAddress: "..." }` to unsubscribe

## Environment Variables

```bash
# API port
API_PORT=3001

# CORS allowed origins (comma-separated)
ALLOWED_ORIGINS=https://percolatorlaunch.com,http://localhost:3000

# API auth key (optional, for future mutation endpoints)
API_AUTH_KEY=your-secret-key

# Supabase (from @percolator/shared)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-key

# Solana RPC (from @percolator/shared)
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com

# WebSocket limits (optional)
MAX_WS_CONNECTIONS=500
```

## Development

```bash
# Install dependencies
pnpm install

# Run in dev mode (hot reload)
pnpm dev

# Build
pnpm build

# Run in production
pnpm start
```

## Differences from @percolator/server

| Feature | @percolator/server | @percolator/api |
|---------|-------------------|-----------------|
| CrankService | ✅ Has active cranking | ❌ Read-only status from DB |
| OracleService | ✅ In-memory price engine | ❌ Reads from DB |
| LiquidationService | ✅ Active liquidations | ❌ Not present |
| Mutations | ✅ POST /markets, POST /crank | ❌ No mutations |
| Keypair | ✅ Has keeper keypair | ❌ No keypair |
| WebSocket | ✅ With PriceEngine | ✅ Relays eventBus only |
| Data source | ✅ In-memory + DB | ❌ DB + on-chain only |

## Notes

- This service is designed to be horizontally scalable (stateless)
- For dev/testing, it can run in the same process as the indexer (shares eventBus via memory)
- For production, use Redis pub/sub to relay events between indexer and API instances
- All price/trade updates come from the indexer publishing to `eventBus`
