# Percolator Architecture

Percolator is a high-performance perpetual futures trading engine built on Solana. The platform consists of three main services that work together to provide a complete trading experience.

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        PERCOLATOR PLATFORM                      │
└─────────────────────────────────────────────────────────────────┘

┌──────────────────┐         ┌──────────────────┐         ┌──────────────────┐
│                  │         │                  │         │                  │
│    Frontend      │◀───────▶│       API        │◀───────▶│     Indexer      │
│   (Next.js)      │         │      (Hono)      │         │   (Background)   │
│                  │         │                  │         │                  │
│  - User Interface│         │  - REST Endpoints│         │  - Event Indexing│
│  - Trading UI    │         │  - WebSocket     │         │  - Data Pipeline │
│  - Charts        │         │  - Rate Limiting │         │  - Cron Jobs     │
│  - Wallet Connect│         │  - Caching       │         │  - Monitoring    │
│                  │         │                  │         │                  │
└────────┬─────────┘         └────────┬─────────┘         └────────┬─────────┘
         │                            │                            │
         │                            │                            │
         ▼                            ▼                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                         SUPABASE (PostgreSQL)                   │
│                                                                  │
│  Tables:                                                         │
│  - markets              Market metadata and configuration        │
│  - market_stats         Aggregated market statistics             │
│  - trades               Historical trade records                 │
│  - oracle_prices        Oracle price updates                     │
│  - funding_history      Funding rate snapshots                   │
│  - oi_history           Open interest snapshots                  │
│  - insurance_history    Insurance fund snapshots                 │
│                                                                  │
│  Views:                                                          │
│  - markets_with_stats   Markets joined with latest stats         │
│                                                                  │
│  Functions:                                                      │
│  - RPC endpoints for complex queries                             │
│                                                                  │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
            ┌────────────────────────┐
            │    SOLANA BLOCKCHAIN   │
            │                        │
            │  - Percolator Program  │
            │  - Slab Accounts       │
            │  - User Accounts       │
            │  - Token Vaults        │
            │  - Oracle Feeds        │
            └────────────────────────┘
```

## Service Breakdown

### 1. Frontend (`packages/frontend`)

**Technology**: Next.js 14 (App Router), React, TailwindCSS, shadcn/ui

**Purpose**: User-facing web application for trading and market monitoring.

**Key Features**:
- Trading interface with order placement
- Real-time market data visualization
- Interactive price charts (TradingView style)
- Wallet integration (Phantom, Solflare, etc.)
- Position management
- Portfolio tracking

**Communication**:
- Consumes REST API from the API service
- Subscribes to WebSocket for real-time updates
- Directly interacts with Solana blockchain for wallet transactions

**Entry Point**: `packages/frontend/src/app/page.tsx`

---

### 2. API Service (`packages/api`)

**Technology**: Hono (lightweight web framework), TypeScript

**Purpose**: REST API server providing read access to market data and platform statistics.

**Key Features**:
- **RESTful Endpoints**: 20+ endpoints for markets, trades, prices, funding, etc.
- **WebSocket Server**: Real-time updates for trades and market data
- **Response Caching**: Intelligent caching with varying TTLs (10-60s)
- **Rate Limiting**: Per-IP rate limiting (100 req/min for reads, 20 for writes)
- **CORS Handling**: Configurable cross-origin resource sharing
- **Health Monitoring**: Service health checks for DB and RPC connectivity
- **API Documentation**: Swagger UI at `/docs`

**Data Sources**:
- **Supabase**: Primary data source for historical and aggregated data
- **Solana RPC**: On-chain data for real-time market details

**Entry Point**: `packages/api/src/index.ts`

**Port**: 3001 (default)

---

### 3. Indexer Service (`packages/indexer`)

**Technology**: TypeScript, Node.js

**Purpose**: Background service that continuously monitors the Solana blockchain and indexes data into Supabase.

**Key Responsibilities**:

1. **Event Indexing**:
   - Listen to program logs from Percolator contracts
   - Parse and decode trade events, liquidations, funding updates
   - Store events in Supabase for historical analysis

2. **Market Monitoring**:
   - Poll market slab accounts for state changes
   - Update market statistics (OI, funding, prices)
   - Track insurance fund balances

3. **Oracle Updates**:
   - Fetch oracle price updates
   - Store price history for charting

4. **Scheduled Jobs**:
   - Periodic cleanup of old data
   - Aggregate statistics calculation
   - Market health monitoring

5. **Data Pipeline**:
   - Validate and sanitize on-chain data
   - Transform data into queryable formats
   - Ensure data consistency

**Entry Point**: `packages/indexer/src/index.ts`

**Runs**: As a long-running background process (systemd, PM2, or Docker)

---

## Shared Package (`packages/shared`)

**Purpose**: Common utilities, types, and database access shared across all services.

**Contents**:
- **Database Client**: Supabase client initialization
- **RPC Connection**: Solana connection management
- **Type Definitions**: Shared TypeScript types
- **Utility Functions**: Sanitization, validation, logging
- **Core Logic**: Slab parsing, oracle resolution

**Used By**: API, Indexer, Frontend (for types)

---

## Core Package (`packages/core`)

**Purpose**: On-chain data parsing and interaction logic.

**Contents**:
- **Slab Parser**: Parse binary slab account data
- **Event Decoder**: Decode program logs and events
- **Oracle Router**: Multi-source price resolution (Pyth, Switchboard, etc.)
- **Account Layouts**: Binary layout definitions for on-chain accounts

**Used By**: Indexer (for parsing), API (for on-chain reads)

---

## Data Flow

### User Trades a Position

```
1. User (Frontend)
   │
   │ Sign transaction with wallet
   ▼
2. Solana Blockchain
   │
   │ Execute Percolator program
   │ Emit trade event logs
   ▼
3. Indexer
   │
   │ Listen to program logs
   │ Parse trade event
   │ Insert into trades table
   ▼
4. Supabase (Database)
   │
   │ Store trade record
   │ Update market_stats
   ▼
5. API Service
   │
   │ WebSocket push to connected clients
   │ Cache invalidation
   ▼
6. Frontend
   │
   │ Update UI with new trade
   │ Refresh positions
   └─▶ User sees confirmation
```

### User Views Market Data

```
1. User (Frontend)
   │
   │ Request market data
   ▼
2. API Service
   │
   │ Check cache (30s TTL)
   │ If miss, query Supabase
   ▼
3. Supabase (Database)
   │
   │ Return markets_with_stats view
   ▼
4. API Service
   │
   │ Cache response
   │ Return JSON
   ▼
5. Frontend
   │
   │ Render market list
   └─▶ User sees markets
```

### Indexer Updates Market Stats

```
1. Indexer (Cron Job - every 10s)
   │
   │ Fetch all market slab accounts
   ▼
2. Solana RPC
   │
   │ Return account data
   ▼
3. Indexer
   │
   │ Parse slab data (packages/core)
   │ Extract: OI, funding, price, insurance
   ▼
4. Supabase (Database)
   │
   │ Upsert market_stats
   │ Insert funding_history
   │ Insert oi_history
   │
   │ (cached data now stale)
   ▼
5. API Service
   │
   │ Cache expires naturally (TTL)
   │ Next request gets fresh data
   └─▶ Frontend sees updated data
```

---

## Database Schema (Simplified)

```sql
-- Core market metadata
markets (
  slab_address TEXT PRIMARY KEY,
  symbol TEXT,
  name TEXT,
  mint_address TEXT,
  deployer TEXT,
  created_at TIMESTAMP,
  ...
)

-- Real-time aggregated stats (updated by indexer)
market_stats (
  slab_address TEXT PRIMARY KEY,
  total_open_interest TEXT,
  funding_rate TEXT,
  last_price TEXT,
  volume_24h TEXT,
  updated_at TIMESTAMP,
  ...
)

-- Historical trades
trades (
  id UUID PRIMARY KEY,
  slab_address TEXT,
  side TEXT,
  price_e6 TEXT,
  size TEXT,
  timestamp TIMESTAMP,
  signature TEXT
)

-- Oracle price updates
oracle_prices (
  slab_address TEXT,
  price_e6 TEXT,
  timestamp TIMESTAMP,
  source TEXT
)

-- Funding rate history
funding_history (
  market_slab TEXT,
  slot TEXT,
  rate_bps_per_slot INT,
  net_lp_pos TEXT,
  timestamp TIMESTAMP,
  ...
)

-- Open interest snapshots
oi_history (
  market_slab TEXT,
  total_oi TEXT,
  net_lp_pos TEXT,
  timestamp TIMESTAMP
)

-- Insurance fund snapshots
insurance_history (
  market_slab TEXT,
  balance TEXT,
  fee_revenue TEXT,
  timestamp TIMESTAMP
)

-- Optimized view for market listing
VIEW markets_with_stats AS
  SELECT m.*, ms.*
  FROM markets m
  LEFT JOIN market_stats ms ON m.slab_address = ms.slab_address;
```

---

## Environment Configuration

### Common Environment Variables

```bash
# Solana RPC
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com

# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx  # Indexer only

# Node Environment
NODE_ENV=production
```

### API Service Specific

```bash
API_PORT=3001
CORS_ORIGINS=https://app.percolator.trade
RATE_LIMIT_READ=100
RATE_LIMIT_WRITE=20
```

### Indexer Service Specific

```bash
INDEXER_POLL_INTERVAL=10000  # 10s
INDEXER_BATCH_SIZE=50
```

### Frontend Specific

```bash
NEXT_PUBLIC_API_URL=https://api.percolator.trade
NEXT_PUBLIC_WS_URL=wss://api.percolator.trade
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
```

---

## Running Locally

### Prerequisites

```bash
# Install dependencies
pnpm install

# Set up environment variables
cp .env.example .env
# Edit .env with your credentials
```

### Development Mode (All Services)

```bash
# Terminal 1: API Service
cd packages/api
pnpm dev

# Terminal 2: Indexer Service
cd packages/indexer
pnpm dev

# Terminal 3: Frontend
cd packages/frontend
pnpm dev
```

Access:
- Frontend: http://localhost:3000
- API: http://localhost:3001
- API Docs: http://localhost:3001/docs

### Docker Compose (Recommended)

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop all services
docker-compose down
```

The `docker-compose.yml` file orchestrates all three services with proper networking and dependencies.

---

## Deployment

### Production Architecture

```
                        ┌─────────────┐
                        │   Cloudflare│
                        │   (CDN/WAF) │
                        └──────┬──────┘
                               │
                   ┌───────────┴───────────┐
                   │                       │
              HTTPS│                       │HTTPS
                   ▼                       ▼
         ┌──────────────┐         ┌──────────────┐
         │   Frontend   │         │   API Server │
         │  (Vercel)    │         │  (Railway)   │
         └──────────────┘         └──────┬───────┘
                                         │
                          ┌──────────────┴──────────────┐
                          │                             │
                          ▼                             ▼
                   ┌─────────────┐             ┌──────────────┐
                   │  Supabase   │             │   Indexer    │
                   │ (Postgres)  │             │ (Background) │
                   └─────────────┘             │  (Railway)   │
                                               └──────────────┘
```

### Deployment Checklist

- [ ] **Frontend**: Deploy to Vercel
  - Set environment variables for API URLs
  - Configure custom domain
  - Enable preview deployments

- [ ] **API Service**: Deploy to Railway/Render/Fly.io
  - Set production environment variables
  - Configure health check endpoint (`/health`)
  - Set up auto-scaling (if needed)
  - Enable HTTPS

- [ ] **Indexer**: Deploy as background worker
  - Use systemd, PM2, or Docker
  - Configure restart policy
  - Set up logging and monitoring
  - Enable alerts for failures

- [ ] **Database**: Supabase
  - Configure connection pooling
  - Set up backups
  - Enable row-level security (if needed)
  - Monitor query performance

- [ ] **Monitoring**:
  - Set up Sentry/LogRocket for error tracking
  - Configure uptime monitoring (UptimeRobot, etc.)
  - Set up alerts for API downtime
  - Monitor database performance

---

## Security Considerations

1. **API Rate Limiting**: Prevents abuse and DoS attacks
2. **CORS Configuration**: Restricts API access to trusted origins
3. **Input Validation**: All user inputs sanitized and validated
4. **Database Access**: Read-only access for API, write access for indexer
5. **Secrets Management**: Environment variables, never hardcoded
6. **HTTPS Only**: Production API must use HTTPS
7. **Wallet Security**: Never store private keys, use client-side signing

---

## Performance Optimizations

1. **Response Caching**: Reduces database load (30-60s TTLs)
2. **Database Indexing**: Indexes on frequently queried columns
3. **Connection Pooling**: Reuse database connections
4. **Batch Processing**: Indexer processes events in batches
5. **WebSocket**: Reduces polling overhead for real-time data
6. **Compression**: gzip/brotli for API responses
7. **CDN**: Frontend assets served via CDN

---

## Monitoring & Observability

### Key Metrics to Track

**API Service**:
- Request rate (req/min)
- Response time (p50, p95, p99)
- Error rate (4xx, 5xx)
- Cache hit rate

**Indexer**:
- Events indexed per minute
- Processing lag (blockchain vs database)
- Error rate
- Database write throughput

**Database**:
- Query performance (slow query log)
- Connection pool usage
- Table sizes
- Index efficiency

### Logging

All services use structured logging with the `createLogger` utility from `@percolator/shared`:

```typescript
import { createLogger } from "@percolator/shared";
const logger = createLogger("api:markets");

logger.info("Market fetched", { slab, cached: true });
logger.error("Failed to fetch market", { slab, error: err.message });
```

---

## Troubleshooting

### API Service Not Responding

1. Check health endpoint: `GET /health`
2. Verify RPC connectivity (check RPC endpoint status)
3. Verify Supabase connectivity (check credentials)
4. Review logs for errors

### Indexer Not Updating Data

1. Check indexer process is running
2. Verify RPC endpoint is accessible
3. Check Supabase write permissions
4. Review logs for parsing errors

### Stale Data in Frontend

1. Check cache TTL settings in API
2. Verify indexer is running and updating stats
3. Clear browser cache
4. Check WebSocket connection status

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines on:
- Code style and conventions
- Adding new endpoints
- Database migrations
- Testing requirements

---

## License

MIT
