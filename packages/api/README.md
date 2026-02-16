# @percolator/api

REST API service for the Percolator perpetual futures trading platform. Provides read access to market data, trades, funding rates, and platform statistics.

## Features

- 📊 **Market Data** - Real-time market information and statistics
- 💰 **Price Feeds** - Current prices and historical data
- 📈 **Trade History** - Recent trades and volume analytics
- 💸 **Funding Rates** - Current and historical funding rate data
- 🔓 **Open Interest** - Total open interest tracking
- 🛡️ **Insurance Fund** - Insurance fund balance and history
- 📉 **Platform Stats** - Aggregated platform-wide statistics
- 🔌 **WebSocket** - Real-time updates (separate endpoint)

## Quick Start

### Prerequisites

- Node.js 18+
- Access to Solana RPC endpoint
- Supabase database credentials

### Installation

```bash
pnpm install
```

### Environment Variables

Create a `.env` file in the `packages/api` directory:

```env
# Server Configuration
API_PORT=3001
NODE_ENV=development

# Solana RPC
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
# Optional: Use a custom endpoint for better performance
# SOLANA_RPC_URL=https://your-rpc-endpoint.com

# Supabase Database
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key

# CORS Configuration
CORS_ORIGINS=http://localhost:3000,http://localhost:3001
# Production: CORS_ORIGINS=https://app.percolator.trade,https://percolator.trade

# Rate Limiting (optional)
RATE_LIMIT_READ=100  # requests per minute for GET endpoints
RATE_LIMIT_WRITE=20  # requests per minute for POST/PUT/DELETE endpoints

# Cache TTL (optional, seconds)
CACHE_TTL_MARKETS=30
CACHE_TTL_STATS=60
CACHE_TTL_FUNDING=30
```

### Running Locally

Development mode with auto-reload:

```bash
pnpm dev
```

Production build:

```bash
pnpm build
pnpm start
```

The API will be available at `http://localhost:3001`.

## API Documentation

### Interactive Documentation

Visit `/docs` for the full Swagger UI documentation:

```
http://localhost:3001/docs
```

### OpenAPI Specification

The OpenAPI 3.0 specification is available at:

```
http://localhost:3001/docs/openapi.yaml
```

## Endpoints Overview

### Health & Info

| Endpoint | Description |
|----------|-------------|
| `GET /` | API info and version |
| `GET /health` | Service health check |

### Markets

| Endpoint | Description |
|----------|-------------|
| `GET /markets` | List all markets with embedded stats |
| `GET /markets/stats` | Get stats for all markets |
| `GET /markets/:slab` | Get on-chain market details (10s cache) |
| `GET /markets/:slab/stats` | Get stats for a specific market |

### Prices

| Endpoint | Description |
|----------|-------------|
| `GET /prices/markets` | Current prices for all markets |
| `GET /prices/:slab` | Price history for a market (last 100 updates) |
| `GET /markets/:slab/prices` | Price history for charting (default 24h) |

### Trades

| Endpoint | Description |
|----------|-------------|
| `GET /markets/:slab/trades` | Recent trades for a market (max 200) |
| `GET /markets/:slab/volume` | 24h volume and trade count |
| `GET /trades/recent` | Recent trades across all markets |

### Funding Rates

| Endpoint | Description |
|----------|-------------|
| `GET /funding/global` | Current funding rates for all markets (60s cache) |
| `GET /funding/:slab` | Current funding rate + 24h history (30s cache) |
| `GET /funding/:slab/history` | Historical funding data (customizable range) |

### Open Interest

| Endpoint | Description |
|----------|-------------|
| `GET /open-interest/:slab` | Current OI + history (15s cache) |

### Insurance Fund

| Endpoint | Description |
|----------|-------------|
| `GET /insurance/:slab` | Insurance fund balance + history |

### Oracle

| Endpoint | Description |
|----------|-------------|
| `GET /oracle/resolve/:mint` | Resolve price sources for a token (5min cache) |

### Crank

| Endpoint | Description |
|----------|-------------|
| `GET /crank/status` | Last crank slot for all markets |

### Platform Stats

| Endpoint | Description |
|----------|-------------|
| `GET /stats` | Platform-wide aggregated statistics (60s cache) |

## Response Caching

The API implements intelligent response caching to optimize performance:

- `/markets` - 30s TTL
- `/markets/:slab` - 10s TTL
- `/stats` - 60s TTL
- `/funding/global` - 60s TTL
- `/funding/:slab` - 30s TTL
- `/open-interest/:slab` - 15s TTL
- `/oracle/resolve/:mint` - 5min TTL

## Rate Limiting

Default rate limits (per IP):

- **Read endpoints** (GET): 100 requests/minute
- **Write endpoints** (POST/PUT/DELETE): 20 requests/minute

Rate limit headers are included in all responses:
- `X-RateLimit-Limit` - Request limit
- `X-RateLimit-Remaining` - Remaining requests
- `X-RateLimit-Reset` - Reset timestamp

## Error Handling

All errors return JSON with the following structure:

```json
{
  "error": "Error message",
  "details": "Additional context (optional)",
  "hint": "Resolution hint (optional)"
}
```

Common HTTP status codes:
- `200` - Success
- `400` - Bad request (invalid parameters)
- `404` - Resource not found
- `500` - Internal server error
- `503` - Service unavailable (health check failed)

## Architecture

The API service is one of three core services in the Percolator platform:

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Frontend  │────▶│     API     │────▶│   Indexer   │
│   (Next.js) │     │   (Hono)    │     │ (Background)│
└─────────────┘     └─────────────┘     └─────────────┘
                           │                     │
                           ▼                     ▼
                    ┌─────────────┐     ┌─────────────┐
                    │   Supabase  │     │   Solana    │
                    │  (Postgres) │     │     RPC     │
                    └─────────────┘     └─────────────┘
```

See [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md) for detailed architecture documentation.

## Development

### Project Structure

```
packages/api/
├── src/
│   ├── routes/          # API route handlers
│   │   ├── health.ts    # Health check
│   │   ├── markets.ts   # Market endpoints
│   │   ├── trades.ts    # Trade endpoints
│   │   ├── prices.ts    # Price endpoints
│   │   ├── funding.ts   # Funding rate endpoints
│   │   ├── open-interest.ts
│   │   ├── insurance.ts
│   │   ├── crank.ts
│   │   ├── oracle-router.ts
│   │   ├── stats.ts
│   │   ├── docs.ts      # Swagger UI
│   │   └── ws.ts        # WebSocket
│   ├── middleware/      # Express middleware
│   │   ├── cache.ts
│   │   ├── rate-limit.ts
│   │   └── validateSlab.ts
│   └── index.ts         # Server entry point
├── openapi.yaml         # OpenAPI 3.0 spec
├── package.json
└── tsconfig.json
```

### Testing

```bash
# Run tests
pnpm test

# Test with coverage
pnpm test:coverage

# Lint
pnpm lint
```

### Building

```bash
# Build TypeScript
pnpm build

# Clean build artifacts
pnpm clean
```

## Deployment

### Docker

Build and run with Docker:

```bash
docker build -t percolator-api .
docker run -p 3001:3001 --env-file .env percolator-api
```

### Docker Compose

Run the entire stack:

```bash
docker-compose up -d
```

### Production Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Configure `CORS_ORIGINS` with production domains
- [ ] Use a reliable Solana RPC endpoint (not public mainnet)
- [ ] Set up proper monitoring and logging
- [ ] Configure rate limiting appropriately
- [ ] Enable HTTPS (via reverse proxy)
- [ ] Set up database connection pooling
- [ ] Configure health check monitoring

## Contributing

1. Follow the existing code style
2. Add tests for new features
3. Update OpenAPI spec for new endpoints
4. Update this README for significant changes

## License

MIT
