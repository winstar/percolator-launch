# Percolator Launch — Part 3: Backend Services & DevOps Audit

**Branch:** `cobra/feature/new-backend`  
**Date:** 2026-02-17  
**Auditor:** Cobra (subagent)  
**Scope:** packages/server, packages/api, packages/keeper, packages/indexer, packages/shared, supabase/, .github/, Docker, env files

---

## Executive Summary

The backend has been well-refactored into a clean monorepo split (api/keeper/indexer/shared). The old `packages/server` is **dead code** — the Dockerfiles and docker-compose reference the new packages. However, there are **5 critical findings** including committed production secrets, timing-attack-vulnerable auth, and liquidation front-running risk. The CI/CD pipeline is essentially a rubber stamp with `continue-on-error` on every meaningful test job.

---

## PART 5: BACKEND SERVICES

### 5.1 Server Setup (packages/api)

| ID | Severity | Category | Title | Location | Description | Impact | Attack Scenario | Fix |
|----|----------|----------|-------|----------|-------------|--------|-----------------|-----|
| B-001 | 🟢 LOW | Server | CORS properly configured | api/src/index.ts:25-30 | Production requires explicit CORS_ORIGINS. Dev defaults to localhost only. Falls back to `null` for unknown origins. | Good. | N/A | N/A |
| B-002 | 🟢 LOW | Server | Graceful shutdown implemented | api/src/index.ts:100-130 | Closes WS server → HTTP server → exits. Handles SIGTERM/SIGINT. | Good. | N/A | Add shutdown timeout (e.g., 10s max) to prevent hanging. |
| B-003 | 🟢 LOW | Server | Global error handler exists | api/src/index.ts:96-98 | Catches unhandled errors, logs stack, returns 500. Does NOT leak stack to client. | Good. | N/A | N/A |
| B-004 | 🟡 MEDIUM | Server | Security headers good but missing CSP | api/src/index.ts:55-65 | Sets X-Content-Type-Options, X-Frame-Options, HSTS. Missing Content-Security-Policy. | XSS risk on /docs endpoint which serves inline HTML/JS. | Inject malicious script via Swagger UI CDN compromise. | Add CSP header: `script-src 'self' unpkg.com`. |
| B-005 | 🟡 MEDIUM | Server | Swagger UI loaded from unpkg CDN | api/src/routes/docs.ts:15-20 | Loads swagger-ui-dist from unpkg.com via `<script>` tags. No SRI hashes. | Supply chain attack via CDN compromise. | Attacker compromises unpkg → serves malicious swagger-ui → steals API keys from /docs users. | Pin version + add integrity hashes, or self-host. |

### 5.2 Services

#### a) CrankBot (packages/keeper/src/services/crank.ts)

| ID | Severity | Category | Title | Location | Description | Impact | Attack Scenario | Fix |
|----|----------|----------|-------|----------|-------------|--------|-----------------|-----|
| B-010 | 🟢 LOW | Crank | Error isolation is good | crank.ts:processBatched | Each market crank is wrapped in try/catch inside Promise.all. One failure does NOT block others. Batches of 3 with 2s gaps. | Good isolation. | N/A | N/A |
| B-011 | 🟡 MEDIUM | Crank | Performance ceiling with 43+ markets | crank.ts:crankAll | 43 markets / 3 per batch = 15 batches × 2s delay = 30s minimum per cycle. Crank interval is 10s. Cycles overlap-protected by `_cycling` flag but effective crank rate degrades. | Markets get stale. At 100+ markets, crank cycle exceeds 60s. | N/A — operational risk. | Increase batch size to 5-10. Use parallel connections. Consider priority-based scheduling. |
| B-012 | 🟢 LOW | Crank | Dead market cleanup | crank.ts:165-170 | Markets missing from 3 consecutive discoveries are removed. | Good hygiene. | N/A | N/A |
| B-013 | 🟡 MEDIUM | Crank | Discovery uses fallback (public devnet) RPC | crank.ts:discover():88 | `getProgramAccounts` hits `api.devnet.solana.com` which has aggressive rate limits. | Discovery may fail silently, missing new markets for minutes. | N/A. | Use Helius RPC with `getProgramAccounts` support (paid tier). |
| B-014 | 🟢 LOW | Crank | Inactive market demotion | crank.ts:isDue | After 10 consecutive failures, market moves to 60s interval instead of 10s. | Reduces wasted RPC calls. Good. | N/A | N/A |

#### b) Oracle (packages/keeper/src/services/oracle.ts)

| ID | Severity | Category | Title | Location | Description | Impact | Attack Scenario | Fix |
|----|----------|----------|-------|----------|-------------|--------|-----------------|-----|
| B-020 | 🟢 LOW | Oracle | Dual-source with cross-validation | oracle.ts:fetchPrice | DexScreener + Jupiter in parallel. Rejects if >10% divergence. | Good defense against single-source manipulation. | N/A | N/A |
| B-021 | 🟢 LOW | Oracle | Historical deviation check (30%) | oracle.ts:fetchPrice:190 | Rejects prices that move >30% from last known. | Prevents flash crash liquidations from bad oracle data. | N/A | N/A |
| B-022 | 🟡 MEDIUM | Oracle | No circuit breaker / degraded mode | oracle.ts | If both DexScreener and Jupiter fail, falls back to cached price (60s max) or on-chain price. No alerting, no circuit breaker flag. | Stale prices used silently. Liquidations may execute on bad data if cache is <60s old. | Both APIs go down → cached price from 59s ago used → market moves 5% in 59s → bad liquidation. | Add `priceSourceDegraded` flag. Emit event. Consider widening maintenance margin when degraded. |
| B-023 | 🟢 LOW | Oracle | Request deduplication | oracle.ts:BM2 | In-flight request dedup prevents thundering herd to external APIs. | Good. | N/A | N/A |
| B-024 | 🟢 LOW | Oracle | API timeout protection | oracle.ts:API_TIMEOUT_MS | 10s abort controller on DexScreener/Jupiter. | Prevents hanging. | N/A | N/A |

#### c) PriceEngine / WebSocket (packages/api/src/routes/ws.ts)

| ID | Severity | Category | Title | Location | Description | Impact | Attack Scenario | Fix |
|----|----------|----------|-------|----------|-------------|--------|-----------------|-----|
| B-030 | 🟢 LOW | WS | Connection limits enforced | ws.ts:MAX_WS_CONNECTIONS=1000 | Global 1000, per-IP 5, per-slab 100. | Good DoS protection. | N/A | N/A |
| B-031 | 🔴 HIGH | WS | IP spoofing via X-Forwarded-For | ws.ts:getClientIp / rate-limit.ts:getClientIp | Both `getClientIp` functions trust `X-Forwarded-For` header blindly. No trusted proxy validation. | Rate limits and per-IP WS limits completely bypassable. | Attacker sets `X-Forwarded-For: random-ip` on each request → unlimited connections and requests. | Only trust X-Forwarded-For from known proxy IPs (Railway's proxy). Or use `X-Real-IP` from Railway only. |
| B-032 | 🟢 LOW | WS | Heartbeat with pong timeout | ws.ts:BH2 | Ping every 30s, 10s pong timeout. Dead clients cleaned up. | Good. | N/A | N/A |
| B-033 | 🟢 LOW | WS | Price update batching | ws.ts:PRICE_BATCH_INTERVAL_MS=500 | Batches price updates per-slab every 500ms. Overwrites stale pending updates. | Good bandwidth optimization. | N/A | N/A |
| B-034 | 🟡 MEDIUM | WS | Auth secret hardcoded as default | ws.ts:WS_AUTH_SECRET | `WS_AUTH_SECRET = process.env.WS_AUTH_SECRET \|\| "percolator-ws-secret-change-in-production"`. If env not set, hardcoded secret used. | Anyone can generate valid WS auth tokens. | Generate token with known secret → bypass auth. | Require WS_AUTH_SECRET in production (validate at startup). |
| B-035 | 🟡 MEDIUM | WS | HMAC token timestamp not bound to slab | ws.ts:verifyWsToken | Token format: `slab:timestamp:hmac`. But the slab from the token is never checked against subscriptions. | Token for slab A can be used to subscribe to slab B. | Generate token for any slab → subscribe to all. | Bind token to requested slab or use session-scoped tokens. |
| B-036 | 🟢 LOW | WS | No Helius Geyser WS in new architecture | N/A | The new backend does NOT use Helius Geyser WebSocket for live streaming. Price updates come from StatsCollector polling (30s) + eventBus. Original question about "PriceEngine: Helius Geyser WS" — this doesn't exist in the new code. | Prices are NOT real-time. 30s polling lag. | N/A | Consider adding Helius WS for sub-second price updates if needed. |

#### d) Liquidation (packages/keeper/src/services/liquidation.ts)

| ID | Severity | Category | Title | Location | Description | Impact | Attack Scenario | Fix |
|----|----------|----------|-------|----------|-------------|--------|-----------------|-----|
| B-040 | 🔴 CRITICAL | Liquidation | Front-runnable by MEV/Jito | liquidation.ts:liquidate | Liquidation tx is sent via standard `sendRawTransaction`. No Jito bundle protection. Liquidation creates extractable value (liquidation reward). | MEV searchers can front-run liquidation txs, stealing the liquidation reward. | Searcher monitors mempool → sees liquidation tx → submits same liquidation with higher priority fee via Jito → keeper pays gas, gets nothing. | Use Jito bundle API (`sendBundle`) for liquidation txs. Or add tip to validator via Jito. |
| B-041 | 🟢 LOW | Liquidation | Anyone can liquidate (permissionless) | liquidation.ts | The on-chain program's `liquidate_at_oracle` instruction only requires a signer (caller). No keeper whitelist. | This is actually good — permissionless liquidation means the protocol doesn't rely solely on the keeper. | N/A | Document this as a feature. Consider adding liquidation incentives for third-party liquidators. |
| B-042 | 🟢 LOW | Liquidation | Oracle staleness check (60s) | liquidation.ts:BC2 | Skips liquidation if oracle price is >60s stale. | Prevents bad liquidations on stale data. | N/A | N/A |
| B-043 | 🟢 LOW | Liquidation | Double-verification before submit | liquidation.ts:Bug3 | Re-reads slab data, re-verifies undercollateralization before submitting tx. | Prevents race condition liquidations. | N/A | N/A |
| B-044 | 🟡 MEDIUM | Liquidation | Overflow protection incomplete | liquidation.ts:BH5 | Uses `MAX_SAFE_INTEGER` (JS Number) as BigInt overflow cap. But `Number.MAX_SAFE_INTEGER` as bigint is only 2^53, while i128 goes to 2^127. | For very large positions, PnL calculation silently caps at wrong value. Could miss valid liquidation or liquidate wrongly. | Create position with size near i128 max → PnL calculation incorrect → escape liquidation. | Use proper i128 max: `(1n << 127n) - 1n`. |
| B-045 | 🟡 MEDIUM | Liquidation | Multi-IX atomic tx: push price + crank + liquidate | liquidation.ts:liquidate | Good: all 3 instructions in single tx ensures atomic execution. But compute budget is fixed at 400k CU. 3 instructions may exceed this. | Transaction fails with "compute budget exceeded" for complex markets. | N/A. | Profile actual CU usage. Set to 600k-800k for liquidation txs. |

#### e) TradeIndexer (packages/indexer/src/services/TradeIndexer.ts)

| ID | Severity | Category | Title | Location | Description | Impact | Attack Scenario | Fix |
|----|----------|----------|-------|----------|-------------|--------|-----------------|-----|
| B-050 | 🟢 LOW | Indexer | Dual indexing: webhook + polling | TradeIndexer.ts + webhook.ts | Primary: Helius webhook (real-time). Backup: polling every 5min. | Good redundancy. | N/A | N/A |
| B-051 | 🟢 LOW | Indexer | Duplicate handling | queries.ts:insertTrade | Ignores Postgres 23505 (unique constraint on tx_signature). | Webhook + polling won't double-count. | N/A | N/A |
| B-052 | 🟢 LOW | Indexer | Backfill on startup | TradeIndexer.ts:backfill | Fetches last 100 signatures per market on first run. | Catches trades missed during downtime. | N/A | N/A |
| B-053 | 🟡 MEDIUM | Indexer | No gap detection | TradeIndexer.ts | Uses `until` parameter (last seen signature) but if signatures are missed between cycles, there's no mechanism to detect the gap. | Trades can be permanently missed if webhook fails AND polling gaps align. | N/A. | Add periodic full reconciliation (compare on-chain trade count vs DB count). |

#### f) InsuranceLPService (packages/indexer/src/services/InsuranceLPService.ts)

| ID | Severity | Category | Title | Location | Description | Impact | Attack Scenario | Fix |
|----|----------|----------|-------|----------|-------------|--------|-----------------|-----|
| B-060 | 🟢 LOW | Insurance | APY calculation from redemption rate growth | InsuranceLPService.ts:computeTrailingAPY | Compares current redemption_rate_e6 to oldest snapshot in window. Annualizes the growth. | Simple but effective. | N/A | N/A |
| B-061 | 🟡 MEDIUM | Insurance | VaR not actually calculated | InsuranceLPService.ts | Despite the task description mentioning "VaR-based yield", there is NO VaR calculation anywhere. The service simply reads on-chain insurance balance and LP supply. Yield = redemption rate growth. | No risk-adjusted yield metric. The "VaR" claim in docs is misleading. | N/A. | Either implement VaR or update documentation to accurately describe the yield mechanism. |
| B-062 | 🟢 LOW | Insurance | Yield source | InsuranceLPService.ts | Yield comes from insurance fund fee revenue (trading fees + liquidation fees routed to insurance). LP tokens represent pro-rata claim on the fund. | Clear and correct mechanism. | N/A | N/A |

#### g) Lifecycle / Market State Machine

| ID | Severity | Category | Title | Location | Description | Impact | Attack Scenario | Fix |
|----|----------|----------|-------|----------|-------------|--------|-----------------|-----|
| B-070 | 🟡 MEDIUM | Lifecycle | No explicit state machine in backend | N/A | Markets have `status` column with values `active\|paused\|resolved` (DB constraint). But there's no backend service managing transitions. StatsCollector auto-registers as `active`. No transition to `paused` or `resolved` ever happens in code. | Markets can never be paused or resolved through the backend. Status field is decorative. | N/A. | Implement lifecycle service or admin API for market state transitions. |

#### h) vAMM

| ID | Severity | Category | Title | Location | Description | Impact | Attack Scenario | Fix |
|----|----------|----------|-------|----------|-------------|--------|-----------------|-----|
| B-075 | ℹ️ INFO | vAMM | No vAMM in backend | N/A | The vAMM lives entirely on-chain (in the Rust program). The backend doesn't interact with it directly — trades are submitted by users, cranked by keeper. | N/A. | N/A | N/A |

#### i) Events (packages/shared/src/services/events.ts)

| ID | Severity | Category | Title | Location | Description | Impact | Attack Scenario | Fix |
|----|----------|----------|-------|----------|-------------|--------|-----------------|-----|
| B-080 | 🟢 LOW | Events | Max listeners set to 100 | events.ts:setMaxListeners(100) | Prevents unchecked growth. Subscribe returns unsubscribe function. | Good. | N/A | N/A |
| B-081 | 🟡 MEDIUM | Events | Subscription tracking doesn't prevent leaks | events.ts:subscriptions Map | Tracks count per event type, but the `subscribe()` return value (unsubscribe fn) must be called by consumers. If consumers forget, listeners accumulate. No automatic cleanup. | Memory leak over long-running sessions if services don't clean up. | N/A. | Add WeakRef-based tracking or periodic listener audit logging. |

### 5.3 Middleware

| ID | Severity | Category | Title | Location | Description | Impact | Attack Scenario | Fix |
|----|----------|----------|-------|----------|-------------|--------|-----------------|-----|
| B-090 | 🔴 HIGH | Auth | Timing attack on API key comparison | api/src/middleware/auth.ts:18 | `provided !== apiAuthKey` uses JavaScript's `!==` which short-circuits on first byte mismatch. | API key can be brute-forced byte-by-byte by measuring response timing. | Send requests with incrementally correct key prefixes, measure response time variance → extract full key in ~256*N requests where N=key length. | Use `crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(apiAuthKey))`. |
| B-091 | 🔴 HIGH | Auth | Rate limit bypassable via X-Forwarded-For | api/src/middleware/rate-limit.ts:getClientIp | Trusts X-Forwarded-For without proxy validation. | All rate limits (100 read/min, 10 write/min) are completely bypassable. | Set random X-Forwarded-For header per request → unlimited API access. | See B-031 fix. |
| B-092 | 🟢 LOW | Validation | validateSlab is solid | api/src/middleware/validateSlab.ts | Sanitizes input, validates base58, validates as Solana PublicKey. | Good defense in depth. | N/A | N/A |

### 5.4 Architecture: New vs Old Packages

| ID | Severity | Category | Title | Location | Description | Impact | Attack Scenario | Fix |
|----|----------|----------|-------|----------|-------------|--------|-----------------|-----|
| B-100 | 🟡 MEDIUM | Architecture | packages/server is dead code | packages/server/ | The old monolithic server. docker-compose.yml references `packages/api/Dockerfile`, `packages/keeper/Dockerfile`, `packages/indexer/Dockerfile`. The root `Dockerfile` and `Dockerfile.server` still reference `packages/server`. | Confusion. Two Dockerfiles point to dead code. | N/A. | Delete `packages/server/`, `Dockerfile`, and `Dockerfile.server`. |
| B-101 | 🟢 LOW | Architecture | Clean separation of concerns | packages/* | API (HTTP+WS), Keeper (crank+oracle+liquidation), Indexer (discovery+stats+trades+insurance), Shared (config+db+utils). | Good microservice boundaries. | N/A | N/A |

### 5.5 Database

| ID | Severity | Category | Title | Location | Description | Impact | Attack Scenario | Fix |
|----|----------|----------|-------|----------|-------------|--------|-----------------|-----|
| B-110 | 🟡 MEDIUM | Database | RLS write policies are `WITH CHECK (true)` | supabase/schema.sql:90-96 | Insert/update policies for markets, market_stats, trades, oracle_prices all use `WITH CHECK (true)` — anyone with the anon key can write. | Data integrity — anyone can insert fake markets, trades, or price data. | Call Supabase REST API directly with anon key → insert fake trade records → manipulate volume/stats display. | Change write policies to require service_role or add check conditions. |
| B-111 | 🟢 LOW | Database | Migrations numbered correctly | supabase/migrations/ | 001-020, sequential. One `.skip` file (020). README exists. | Good. | N/A | N/A |
| B-112 | 🟡 MEDIUM | Database | Schema drift: schema.sql vs migrations | supabase/schema.sql vs migrations | `schema.sql` defines `open_interest` (singular) and `num_traders` on market_stats, but migrations add `open_interest_long`, `open_interest_short`, `total_open_interest`, etc. The view in migration 010 references `volume_total`, `open_interest_long`, `open_interest_short` which don't exist in schema.sql. | Confusing. New devs won't know which is canonical. | N/A. | Regenerate schema.sql from current DB state. Mark it as reference-only. |
| B-113 | 🟡 MEDIUM | Database | No write RLS for insurance_history, oi_history, funding_history | migrations 007, 009 | These tables have RLS enabled with SELECT policies but NO INSERT policies. Service role key bypasses RLS, so the backend works. But if anon key is used, inserts would fail. | Inconsistent RLS model. | N/A. | Add explicit INSERT policies for service_role. |
| B-114 | 🟢 LOW | Database | Performance indexes comprehensive | migration 018 | Covers all major query patterns: trades by market/sig, oracle prices, funding history, deployer lookup. | Good. | N/A | N/A |
| B-115 | 🟡 MEDIUM | Database | insurance_snapshots, insurance_lp_events tables referenced but never created | InsuranceLPService.ts:117, 162 | Code inserts into `insurance_snapshots` and reads from `insurance_lp_events` but no migration creates these tables. | InsuranceLPService will throw errors on every poll cycle. | N/A. | Create migration for these tables. |

### 5.6 Secrets

| ID | Severity | Category | Title | Location | Description | Impact | Attack Scenario | Fix |
|----|----------|----------|-------|----------|-------------|--------|-----------------|-----|
| B-120 | 🔴 CRITICAL | Secrets | Production secrets committed to git | .env.vercel, .env.vercel.preview, .env.local | **SUPABASE_SERVICE_ROLE_KEY** committed in plaintext across 3 files. This key bypasses ALL RLS policies. Also: Vercel OIDC tokens, Discord webhook URL, Helius API key, INDEXER_API_KEY. | Full database read/write access. Anyone with repo access can read/modify/delete all data. | Clone repo → extract service role key → call Supabase REST API → delete all markets and trades. | **IMMEDIATE:** Rotate ALL exposed keys. Add `.env.vercel*` and `.env.local` to `.gitignore`. Use `git filter-branch` or BFG to remove from history. |
| B-121 | 🔴 CRITICAL | Secrets | INDEXER_API_KEY is trivially guessable | .env.vercel:1 | `INDEXER_API_KEY="BOOM4356437HGVT-launch-key"` — not a random secret, looks hand-typed. Used for webhook auth? | Weak API key. | N/A. | Generate cryptographically random key: `openssl rand -hex 32`. |
| B-122 | 🟡 MEDIUM | Secrets | Keypair loading from env variable | shared/src/utils/solana.ts:loadKeypair | Accepts JSON array or base58 string from `CRANK_KEYPAIR` env var. | Keypair in env is standard practice for Railway. But if env leaks (logs, error messages), private key exposed. | Error message includes env dump → private key leaked. | Ensure error handlers never log env vars. Consider using Solana CLI keyfile path instead. |
| B-123 | 🟡 MEDIUM | Secrets | .env.example doesn't list all needed vars | .env.example | Missing: `API_AUTH_KEY`, `WS_AUTH_SECRET`, `WS_AUTH_REQUIRED`, `CORS_ORIGINS`, `SENTRY_DSN`, `WEBHOOK_URL`, `HELIUS_WEBHOOK_SECRET`, `API_PORT`, `INDEXER_PORT`, `MAX_WS_CONNECTIONS`. | New devs won't know what to configure. | N/A. | Update .env.example with all vars. |

---

## PART 7: DEVOPS

### 7.1 Deployment

| ID | Severity | Category | Title | Location | Description | Impact | Attack Scenario | Fix |
|----|----------|----------|-------|----------|-------------|--------|-----------------|-----|
| D-001 | 🟢 LOW | Deploy | Docker Compose for local dev | docker-compose.yml | Clean 3-service setup: api, indexer, keeper. Uses .env file. `unless-stopped` restart policy. | Good. | N/A | N/A |
| D-002 | ℹ️ INFO | Deploy | Railway for production | Inferred from env vars | `NEXT_PUBLIC_API_URL` points to `percolator-api-*.up.railway.app`. | Standard Railway deployment. | N/A | N/A |
| D-003 | ℹ️ INFO | Deploy | Program is upgradeable (implied) | build-program.yml | Builds with `cargo-build-sbf`, no `--immutable` flag. Program authority not audited (on-chain). | If upgrade authority is compromised, program can be replaced. | N/A — on-chain concern, not backend. | Verify upgrade authority is multisig. Consider making immutable for mainnet. |

### 7.2 Docker

| ID | Severity | Category | Title | Location | Description | Impact | Attack Scenario | Fix |
|----|----------|----------|-------|----------|-------------|--------|-----------------|-----|
| D-010 | 🟢 LOW | Docker | Multi-stage builds | packages/*/Dockerfile | All 3 new Dockerfiles use builder → runner pattern with alpine. | Good. Minimal image size. | N/A | N/A |
| D-011 | 🟡 MEDIUM | Docker | Running as root | packages/keeper/Dockerfile, packages/indexer/Dockerfile | API Dockerfile: no USER directive (runs as root). Keeper: no USER. Indexer: no USER. Only the OLD `Dockerfile` has `USER node`. | Container escape risk. | Exploit in node → root access to container → potential host escape. | Add `USER node` to all production Dockerfiles. |
| D-012 | 🟢 LOW | Docker | No secrets baked in | packages/*/Dockerfile | Env vars injected via docker-compose `.env` or Railway. No COPY of .env files. | Good. | N/A | N/A |
| D-013 | 🟡 MEDIUM | Docker | Base images not pinned to digest | packages/*/Dockerfile | `FROM node:22-alpine` without SHA256 digest. | Supply chain attack if `node:22-alpine` tag is compromised. | N/A — low probability. | Pin: `FROM node:22-alpine@sha256:...`. |
| D-014 | 🟢 LOW | Docker | API has HEALTHCHECK | packages/api/Dockerfile | `HEALTHCHECK` directive with curl to /health. | Good for orchestrator health monitoring. | N/A | Add HEALTHCHECK to keeper and indexer too. |

### 7.3 .env.example

| ID | Severity | Category | Title | Location | Description | Impact | Attack Scenario | Fix |
|----|----------|----------|-------|----------|-------------|--------|-----------------|-----|
| D-020 | 🟡 MEDIUM | Config | .env.example incomplete | .env.example | See B-123. Missing 10+ env vars needed by the new packages. | N/A. | N/A. | Update. |

### 7.4 Monitoring

| ID | Severity | Category | Title | Location | Description | Impact | Attack Scenario | Fix |
|----|----------|----------|-------|----------|-------------|--------|-----------------|-----|
| D-030 | 🟢 LOW | Monitoring | /health checks RPC + DB | api/src/routes/health.ts | Returns `ok`, `degraded`, or `down` with per-check detail. 503 if fully down. | Good for Railway health checks. | N/A | N/A |
| D-031 | 🟡 MEDIUM | Monitoring | Keeper and Indexer have minimal health | keeper/src/index.ts, indexer/src/index.ts | Keeper: no health endpoint. Indexer: `/health` returns static `{ status: "ok" }` without checking anything. | Railway/Docker can't detect if keeper is actually cranking or if indexer is connected. | Keeper silently stops cranking → no alert → markets go stale → positions can't be liquidated. | Add `/health` to keeper (check last crank time, connection). Make indexer health check Supabase + RPC. |
| D-032 | 🟢 LOW | Monitoring | Structured logging | shared/src/logger.ts | JSON in production, pretty in dev. Includes timestamp, level, service, context. | Good for log aggregation. | N/A | N/A |
| D-033 | 🟢 LOW | Monitoring | Sentry integration | shared/src/sentry.ts | Captures exceptions with tags, breadcrumbs. 10% trace sampling. | Good. | N/A | N/A |
| D-034 | 🟡 MEDIUM | Monitoring | No alerting on critical failures | N/A | Sentry captures errors but no PagerDuty/Slack/Discord integration for critical events (keeper down, liquidation failures, oracle degradation). | SRE at 3am won't know the crank bot died. | N/A. | Add webhook alerts for: crank failures >5 consecutive, liquidation failures, oracle degradation, DB connection loss. |

### 7.5 CI/CD

| ID | Severity | Category | Title | Location | Description | Impact | Attack Scenario | Fix |
|----|----------|----------|-------|----------|-------------|--------|-----------------|-----|
| D-040 | 🔴 HIGH | CI/CD | Tests don't actually gate merges | .github/workflows/test.yml | `continue-on-error: true` on: unit tests (server), unit tests (frontend), integration tests, e2e tests, security audit, security tests, coverage check. **Only core unit tests and type-check actually block.** | Merge gate is a rubber stamp. Broken code can merge to main. | N/A. | Remove `continue-on-error` from all test jobs. If tests don't exist yet, create stub tests that pass. |
| D-041 | 🟡 MEDIUM | CI/CD | Fuzz tests are informational only | build-program.yml:94 | `continue-on-error: true` on fuzz tests. | Fuzz findings won't block merge. | N/A. | Expected for fuzz tests (they're non-deterministic). OK. |
| D-042 | 🟡 MEDIUM | CI/CD | pr-check.yml duplicates test.yml | .github/workflows/ | Both workflows trigger on PR to main. pr-check builds all packages + frontend. test.yml runs tests. Redundant CI minutes. | Wasted CI time. | N/A. | Consolidate into one workflow. |
| D-043 | 🟡 MEDIUM | CI/CD | test.yml uses Node 20, pr-check uses Node 22 | .github/workflows/ | Inconsistent Node versions between workflows. Production uses Node 22 (Dockerfiles). | Tests may pass on Node 20 but fail on Node 22 (or vice versa). | N/A. | Standardize on Node 22 everywhere. |
| D-044 | 🟢 LOW | CI/CD | Deploy workflow is manual | deploy.yml | `workflow_dispatch` only. Builds Docker images, pushes to GHCR. | Good — no accidental deploys. | N/A | N/A |

### 7.6 Disaster Recovery

| ID | Severity | Category | Title | Location | Description | Impact | Attack Scenario | Fix |
|----|----------|----------|-------|----------|-------------|--------|-----------------|-----|
| D-050 | 🔴 HIGH | DR | Supabase goes down = total API failure | Entire backend | All routes depend on Supabase. No local cache fallback for reads. Health endpoint returns 503. | Complete platform outage. No trading data, no market list, no prices. | N/A. | Add read-through cache for critical data (market list, recent prices). Return cached data when DB is down. |
| D-051 | 🔴 CRITICAL | DR | Key compromise plan doesn't exist | N/A | Supabase service role key is already committed to git (B-120). No documented rotation procedure. No key management. | If key is compromised, attacker has full DB access with no way to quickly rotate. | Already happened — keys are in git history. | **IMMEDIATE:** 1) Rotate all keys. 2) Document rotation procedure. 3) Set up secrets manager. 4) Add git-secrets pre-commit hook. |
| D-052 | 🟡 MEDIUM | DR | Railway goes down = no keeper | N/A | If Railway is down, keeper stops. No redundant keeper deployment. | Markets go stale. Liquidations don't execute. Users can't be liquidated → protocol insolvency risk. | N/A. | Run backup keeper on separate infra (e.g., Fly.io, dedicated VPS). Or document manual crank procedure. |
| D-053 | 🟡 MEDIUM | DR | No database backups documented | N/A | Supabase has automatic backups (Pro plan), but no documented restore procedure. No tested backup/restore. | Data loss if Supabase backup fails or corruption occurs. | N/A. | Document and test restore procedure. Set up periodic pg_dump to separate storage. |

---

## Summary by Severity

| Severity | Count | Key Issues |
|----------|-------|------------|
| 🔴 CRITICAL | 3 | Production secrets in git (B-120), no key rotation plan (D-051), weak API key (B-121) |
| 🔴 HIGH | 4 | Timing attack on auth (B-090), rate limit bypass (B-091/B-031), tests don't gate merges (D-040), no DB fallback (D-050) |
| 🟡 MEDIUM | 22 | Missing CSP, crank performance ceiling, oracle degradation silent, WS auth defaults, Docker root user, incomplete .env.example, schema drift, missing tables, no alerting, etc. |
| 🟢 LOW | 20 | Good patterns: error isolation, graceful shutdown, dual oracle sources, duplicate handling, structured logging, Sentry |
| ℹ️ INFO | 3 | vAMM is on-chain only, Railway deployment, upgradeable program |

## Top 5 Immediate Actions

1. **ROTATE ALL KEYS NOW** — Supabase service role key, Helius API key, Discord webhook, Vercel OIDC tokens are all in git history. Rotate immediately. Add `.env.vercel*` `.env.local` to `.gitignore`. Run BFG repo cleaner.

2. **Fix timing attack on auth** — Replace `!==` with `crypto.timingSafeEqual` in `api/src/middleware/auth.ts`.

3. **Fix rate limit bypass** — Validate X-Forwarded-For against trusted proxy list in both rate-limit.ts and ws.ts.

4. **Remove `continue-on-error` from CI** — Tests should actually block merges.

5. **Add keeper health monitoring** — Health endpoint + alerting for crank failures. This is your 3am SRE scenario.
