# @percolator/keeper

Keeper service for the Percolator protocol — handles cranking, oracle price pushing, and liquidations.

## Overview

This is a **standalone service** (not a public API server) that runs 24/7 with a Solana keypair to:
- **Crank markets**: Settle pending orders and update market state
- **Push oracle prices**: Update on-chain prices for admin-oracle markets
- **Scan for liquidations**: Monitor accounts and liquidate undercollateralized positions

## Structure

```
packages/keeper/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # Entry point
│   └── services/
│       ├── crank.ts          # Market cranking service
│       ├── oracle.ts         # Oracle price pushing service
│       └── liquidation.ts    # Liquidation scanner service
└── dist/                     # Compiled output
```

## Services

### CrankService
- Discovers markets across configured program IDs
- Cranks markets on a configurable interval (active/inactive markets have different intervals)
- Tracks market health and removes dead markets after 3 consecutive discovery misses

### OracleService
- Fetches prices from DexScreener and Jupiter APIs
- Cross-validates prices between sources
- Pushes prices on-chain for admin-oracle markets

### LiquidationService
- Scans all markets for undercollateralized accounts
- Executes liquidations with proper price push + crank + liquidate sequence
- Uses mark-to-market PnL for accurate health checks

## Scripts

```bash
# Build
pnpm build

# Development (watch mode)
pnpm dev

# Production
pnpm start
```

## Environment Variables

Required:
- `CRANK_KEYPAIR`: Base58 private key for the keeper wallet (must be oracle authority for admin-oracle markets)

Optional (from `@percolator/shared` config):
- `RPC_URL`: Solana RPC endpoint
- `FALLBACK_RPC_URL`: Fallback RPC for discovery
- `PROGRAM_ID`: Default program ID
- Various interval/timing configurations

## Dependencies

- `@percolator/core`: Core protocol types and utilities
- `@percolator/shared`: Shared config, utilities, and event bus
- `@solana/web3.js`: Solana SDK
- `dotenv`: Environment variable loading

## Notes

- **No HTTP server**: This service has no public API
- **No routes**: All operations are internal cron-style jobs
- **Graceful shutdown**: Handles SIGTERM/SIGINT for clean stops
- Imports from `@percolator/shared` instead of local `utils/` files
