# Deployment Guide

**Last updated:** 2026-02-24

---

## Program IDs

### Devnet

| Program | ID | Slab Size |
|---------|----|-----------|
| Percolator (Small) | `FxfD37s1AZTeWfFQps9Zpebi2dNQ9QSSDtfMKdbsfKrD` | 256 slots |
| Percolator (Medium) | `FwfBKZXbYr4vTK23bMFkbgKq3npJ3MSDxEaKmq9Aj4Qn` | 1024 slots |
| Percolator (Large) | `g9msRSV3sJmmE3r5Twn9HuBsxzuuRGTjKCVTKudm9in` | 4096 slots |
| Matcher | `GTRgyTDfrMvBubALAqtHuQwT8tbGyXid7svXZKtWfC9k` | — |

### Mainnet

| Program | ID | Notes |
|---------|-----|-------|
| Percolator | `GM8zjJ8LTBMv9xEsverh6H6wLyevgMHEJXcEzyY3rY24` | — |
| Matcher | `DHP6DtwXP1yJsz8YzfoeigRFPB979gzmumkmCxDLSkUX` | — |

---

## Authority Wallets

| Role | Pubkey | Notes |
|------|--------|-------|
| Upgrade Authority (devnet) | `FF7K...` | Shared across all 5 devnet programs (3 wrappers + matcher + stake). See PR #353. |
| Crank Wallet (devnet) | `2JaSzRYrf44fPpQBtRJfnCEgThwCmvpFd3FCXi45VXxm` | Keeper bot keypair |

> **⚠️ Important:** PR #348 was reverted (PR #350) because it deployed using the QA wallet (`GRMMNs...`) as upgrade authority. The correct authority wallets (`FF7K...`) were restored in PR #353.

---

## Configuration

### Environment Variables

See `app/.env.example` for the full list. Key deployment variables:

| Variable | Description | Required |
|----------|-------------|----------|
| `NEXT_PUBLIC_DEFAULT_NETWORK` | `devnet` or `mainnet` | Yes |
| `NEXT_PUBLIC_PROGRAM_ID` / `PROGRAM_ID` | Override program ID | No (uses network default) |
| `NEXT_PUBLIC_HELIUS_API_KEY` | Helius RPC key (client) | Yes (prod) |
| `HELIUS_API_KEY` | Helius RPC key (server) | Yes (prod) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key | Yes (backend) |
| `CRANK_KEYPAIR` | Base58 crank keypair | Yes (keeper) |
| `API_AUTH_TOKEN` | Auth for POST routes | Optional |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry error tracking | Recommended |

### Network Detection

Program IDs resolve via `packages/core/src/config/program-ids.ts`:
1. `PROGRAM_ID` env var override (highest priority)
2. Network-specific default from `PROGRAM_IDS[network]`
3. Devnet fallback (safest default)

### Mainnet Safety Gate

A network validation guard (`networkValidation.ts`, PR #356) prevents accidental mainnet operations:
- Validates network config is explicitly set
- Blocks misconfigured mainnet deployments

---

## Build Features (Cargo)

The Rust program supports compile-time features:

| Feature | Purpose | Usage |
|---------|---------|-------|
| `default` | Standard build | `cargo build-sbf` |
| `mainnet` | Enables mainnet guards | Production only |
| `devnet` | Relaxes oracle staleness | Dev/test only — **NEVER** with mainnet |
| `small` | MAX_ACCOUNTS=256 (~0.68 SOL) | Wrapper small |
| `test` | MAX_ACCOUNTS=64 (~0.17 SOL) | Testing only |
| `no-entrypoint` | Library mode (for CPI) | SDK consumers |

---

## Deployment Procedures

### Frontend (Next.js App)

Deployed via Vercel (auto-deploy on `main` push):
1. Merge PR to `main`
2. Vercel builds automatically
3. Verify at https://percolatorlaunch.com

### Backend Services (Docker)

Three containerized services deployed via GitHub Actions → GHCR:

| Service | Package | Description |
|---------|---------|-------------|
| `api` | `packages/api` | Hono REST + WebSocket (read-only, stateless) |
| `keeper` | `packages/keeper` | Crank, Oracle, Liquidation services |
| `indexer` | `packages/indexer` | Market discovery, stats, trade indexing |

**Deploy workflow:** `.github/workflows/deploy.yml` (manual dispatch)
```bash
# Trigger via GitHub Actions UI or CLI
gh workflow run deploy.yml -f environment=production
```

Images tagged: `{branch}-{sha}`, `{branch}`, `latest` (main only).

### On-Chain Program Deployment

```bash
# Build for specific tier
cargo build-sbf --features small    # 256-slot wrapper
cargo build-sbf --features default  # 1024-slot (medium)
cargo build-sbf                     # 4096-slot (large)

# Deploy to devnet
solana program deploy \
  --program-id <PROGRAM_ID> \
  --upgrade-authority <AUTHORITY_KEYPAIR> \
  --url devnet \
  target/deploy/percolator_prog.so

# For mainnet, use --features mainnet and --url mainnet-beta
```

### Multi-Tier Market Deployment Script

```bash
# Deploy markets across all 3 slab tiers
npx tsx app/scripts/deploy-all-tiers.ts
```

This creates token mints, initializes markets on each tier, deposits, sets oracle, cranks, and executes test trades.

---

## Post-Deployment Checklist

- [ ] Verify program IDs match `packages/core/src/config/program-ids.ts`
- [ ] Verify upgrade authority is correct (NOT QA wallet)
- [ ] Run E2E tests: `pnpm test:e2e`
- [ ] Check keeper crank is running: monitor logs for crank cycles
- [ ] Verify Sentry errors are clean
- [ ] Check market initialization on explorer
- [ ] For mainnet: verify network validation guard is active
