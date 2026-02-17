# Percolator Launch — Comprehensive Platform Audit

**Branch:** `cobra/feature/new-backend`  
**Date:** 2026-02-17  
**Auditor:** Cobra (AI Agent)  
**Scope:** Full platform — on-chain program, SDK, frontend, backend, testing, devops, economic design

---

## 1. EXECUTIVE SUMMARY

Percolator Launch is a permissionless coin-margined perpetual futures protocol on Solana with a well-structured monorepo, comprehensive on-chain program (29 instructions), a newly split backend (api/keeper/indexer/shared), and a Next.js frontend. The codebase has undergone extensive auditing (70+ findings resolved across previous rounds) and shows strong engineering practices including Kani formal verification, compile-time safety guards, and Zod validation. **However, three critical issues block mainnet deployment: (1) Supabase service role key and other secrets are committed to git in `.env.vercel`, (2) the TypeScript liquidation price formula uses a linear approximation for a non-linear coin-margined system which can mislead traders, and (3) the `continue-on-error: true` on all CI test jobs means broken tests never block merges.**

**Top 5 Critical/High Issues:**
1. **CRITICAL: Secrets committed to git** — `.env.vercel` contains Supabase service role key, Discord webhook, Helius API key, Vercel OIDC tokens
2. **HIGH: Liquidation price formula approximation** — TS `computeLiqPrice` uses linear model for non-linear coin-margined PnL
3. **HIGH: CI tests all `continue-on-error: true`** — No test actually gates merges; merge gate is decorative
4. **HIGH: No RLS write policies** — Supabase tables have RLS enabled but no INSERT/UPDATE policies for service role; relies entirely on service role key secrecy (which is leaked)
5. **HIGH: Oracle staleness check in liquidation uses wall-clock, not slot** — `priceAge > 60n` checks unix timestamp but Hyperp markets store funding rate in `authorityTimestamp`, causing false staleness detection

**Top 5 Strengths:**
1. **Compile-time safety guards** — `compile_error!` macros prevent unsafe_close+mainnet, devnet+mainnet feature combos
2. **Kani formal verification** — Pure decision functions for all instruction authorization logic are formally verifiable
3. **Comprehensive error mapping** — All 34 error codes mapped to human-readable messages with instruction context
4. **Well-structured monorepo split** — Clean separation of keeper/api/indexer/shared with proper package boundaries
5. **O(1) risk metrics** — LP risk state maintained via engine aggregates instead of O(n) scans

**Mainnet Verdict:** ❌ NOT READY. Fix the 3 critical/high issues (leaked secrets, CI, liquidation formula). Estimated effort: 2-3 days of focused work for blocking issues.

---

## 2. PREVIOUS AUDIT STATUS

The previous audit files (`AUDIT-TRADE.md`, `AUDIT-PAGES.md`, `AUDIT-BACKEND.md`) were removed from the repo in commit `931b790` ("chore: remove accidental audit files from repo root"). Based on git history, 70+ findings were resolved across multiple audit rounds. Key fixes verified as present in current code:

| Previous Finding | Status | Evidence |
|---|---|---|
| Division-by-zero in PnL/format | ✅ FIXED | Guards in `computeMarkPnl` (capital===0, oracle===0) |
| Buffer bounds in slab parser | ✅ FIXED | Length checks in `parseAccount`, `parseEngine` |
| BigInt rendering crash | ✅ FIXED | `computePnlPercent` uses BigInt scaling, not Number() |
| SQL injection in queries | ✅ FIXED | Parameterized queries in `packages/shared/src/db/queries.ts` |
| WebSocket DoS | ✅ FIXED | Connection limits, heartbeat timeout in `packages/api/src/routes/ws.ts` |
| RPC validation | ✅ FIXED | `sanitizeSlabAddress` with base58 regex validation |
| Event listener leak | ✅ FIXED | Subscription tracking in shared events |
| Rate limiting | ✅ FIXED | Read (100/min) + Write (10/min) per IP |
| Priority fees | ✅ FIXED | 100k µLamports in `sendWithRetry` |
| Network mismatch validation | ✅ FIXED | Checked before transactions |
| Unused vamm.ts dead code | ✅ FIXED | Removed in cleanup commit |

**Regressions:** None detected. All previously fixed issues remain resolved.

---

## 3. NEW FINDINGS

| ID | Severity | Category | Title | Location | Remediation |
|---|---|---|---|---|---|
| PA-C1 | CRITICAL | Security | Secrets committed to git | `.env.vercel:1-5` | Rotate ALL keys immediately, add to `.gitignore`, use `git filter-branch` |
| PA-C2 | CRITICAL | Security | Supabase service role key in repo | `.env.vercel:5`, `.env.local:5` | Rotate key in Supabase dashboard, remove file from git history |
| PA-H1 | HIGH | Math | Liq price formula linear approximation | `packages/core/src/math/trading.ts:38-54` | Implement exact non-linear solver |
| PA-H2 | HIGH | CI/CD | All CI tests `continue-on-error: true` | `.github/workflows/test.yml` | Remove `continue-on-error` from critical jobs |
| PA-H3 | HIGH | Security | Discord webhook URL committed | `.env.vercel.preview` | Rotate webhook, move to Vercel env vars |
| PA-H4 | HIGH | Security | Helius API key committed | `.env.vercel.preview` | Rotate key, move to env vars |
| PA-H5 | HIGH | Backend | Liquidation staleness check wrong for Hyperp | `packages/keeper/src/services/liquidation.ts:83-90` | Check `is_hyperp` mode before staleness validation |
| PA-H6 | HIGH | Backend | No CRANK_KEYPAIR validation for empty string | `packages/shared/src/config.ts:8` | Fail fast if empty in production |
| PA-M1 | MEDIUM | On-chain | Tags 11-13 overloaded vs README claims | `program/src/percolator.rs:1220-1260` | Update docs: Tag 11=SetRiskThreshold, 12=UpdateAdmin, 13=CloseSlab (not reserved) |
| PA-M2 | MEDIUM | Testing | t5 integration test missing | `tests/` | Create t5 for insurance LP lifecycle |
| PA-M3 | MEDIUM | Frontend | No cleanup in useEffect for WebSocket subscriptions | Multiple hooks | Add cleanup returns |
| PA-M4 | MEDIUM | Backend | API auth key not required in dev mode | `packages/api/src/middleware/auth.ts:12-15` | OK for dev, but log warning |
| PA-M5 | MEDIUM | Security | Rate limiter uses X-Forwarded-For (spoofable) | `packages/api/src/middleware/rate-limit.ts:26-29` | Use trusted proxy headers or connection IP |
| PA-M6 | MEDIUM | Frontend | No retry on WebSocket reconnection with exponential backoff | `app/hooks/useLivePrice.ts` | Add exponential backoff |
| PA-M7 | MEDIUM | Backend | `processBatched` swallows errors silently | `packages/keeper/src/services/crank.ts:38-52` | Errors are logged but crankAll() doesn't surface them |
| PA-M8 | MEDIUM | Economic | Insurance LP JIT deposit/withdraw attack | On-chain `DepositInsuranceLP` | Add time-lock or minimum holding period |
| PA-M9 | MEDIUM | On-chain | Resolved market crank PnL uses `saturating_add` | `program/src/percolator.rs:3464` | Could hide bad debt silently; consider checked_add |
| PA-M10 | MEDIUM | Docs | README says "packages/server" but monolith was deleted | `README.md` project structure | Update to reflect new api/keeper/indexer/shared split |
| PA-L1 | LOW | Backend | Old `packages/server/` referenced in README env vars | `README.md` | Update documentation |
| PA-L2 | LOW | Code Quality | `packages/core` has `package-lock.json` alongside pnpm workspace | `packages/core/package-lock.json` | Remove, use pnpm only |
| PA-L3 | LOW | Frontend | `app/app/components/ui/CodeBlock.tsx` duplicates root `app/components/ui/CodeBlock.tsx` | Both files | Remove duplicate |
| PA-L4 | LOW | Testing | Frontend tests use `continue-on-error: true` | `.github/workflows/test.yml` | Remove once tests stabilize |
| PA-L5 | LOW | Docs | `SECURITY.md` exists but not comprehensive | `SECURITY.md` | Add responsible disclosure policy, scope, rewards |
| PA-I1 | INFO | Defense | Consider program upgrade authority transfer to multisig before mainnet | Deployment | Use Squads multisig |
| PA-I2 | INFO | Defense | Add Sentry DSN to backend services env validation | `packages/shared/src/validation.ts` | Optional but recommended for prod |
| PA-I3 | INFO | Optimization | Slab detection tries 4 known tiers sequentially | `packages/core/src/solana/slab.ts:detectLayout` | Consider lookup table |

### Detailed Findings

#### PA-C1: Secrets Committed to Git (CRITICAL)

**Description:** The file `.env.vercel` is tracked in git and contains production secrets:
- `SUPABASE_SERVICE_ROLE_KEY` — Full admin access to Supabase database
- `INDEXER_API_KEY` — API mutation authentication key
- `VERCEL_OIDC_TOKEN` — Vercel deployment token

**Impact:** Anyone with repo access (public or private) can:
1. Read/write/delete ALL Supabase data (markets, trades, users)
2. Call mutation API endpoints (register fake markets, manipulate data)
3. Impersonate Vercel deployments

**Attack Scenario:** Attacker clones repo → reads `.env.vercel` → uses service role key to DELETE FROM markets → all frontend data disappears.

**Fix:**
```bash
# 1. Add to .gitignore
echo ".env.vercel" >> .gitignore
echo ".env.local" >> .gitignore

# 2. Remove from git history
git filter-branch --force --index-filter \
  'git rm --cached --ignore-unmatch .env.vercel .env.local .env.vercel.preview' \
  --prune-empty -- --all

# 3. Rotate ALL keys in Supabase, Vercel, Discord, Helius dashboards
# 4. Move secrets to Vercel dashboard env vars (encrypted at rest)
```

#### PA-C2: Supabase Service Role Key Exposure (CRITICAL)

**Description:** The Supabase service role key `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` in `.env.vercel` bypasses ALL Row Level Security policies. Combined with the fact that RLS write policies only exist via service role (no explicit INSERT/UPDATE policies for anon users), this key is the sole authentication barrier.

**Impact:** Complete database compromise. Attacker can insert fake trades, modify market stats, delete all data.

**Fix:** Rotate the key immediately via Supabase dashboard → Settings → API → Regenerate service_role key. Update all deployed services with the new key via environment variables (not files in git).

#### PA-H1: Liquidation Price Formula Linear Approximation (HIGH)

**Description:** The TypeScript `computeLiqPrice` in `packages/core/src/math/trading.ts:38-54` uses a linear formula:
```typescript
const liq = entryPrice - (capitalPerUnitE6 * 10000n) / (10000n + maintenanceMarginBps);
```

However, coin-margined PnL is non-linear: `pnl = (oracle - entry) * abs_pos / oracle`. The denominator changes with oracle price, creating a hyperbolic relationship. The on-chain liquidation condition is:

```
equity = capital + (oracle - entry) * abs_pos / oracle
equity < abs_pos * oracle / 1e6 * maint_bps / 10000
```

Solving for oracle yields a quadratic, not linear, equation. The linear approximation underestimates liquidation price for longs at high leverage (showing lower liq price than reality) and overestimates for shorts.

**Impact:** Traders see incorrect liquidation prices. At 20x leverage, the error can be 2-5%, meaning a trader thinks they're safe when they're actually within liquidation range.

**Attack Scenario:** Trader opens 20x long at $1.00 entry, sees liq price $0.95 but actual liq is $0.97. Price drops to $0.96, trader doesn't close, gets liquidated unexpectedly.

**Fix:** Implement the exact coin-margined liquidation price:
```typescript
// For longs: solve capital + (oracle - entry) * abs_pos / oracle = abs_pos * oracle * maint / (1e6 * 10000)
// Rearranging: oracle^2 * (abs_pos * maint / (1e6 * 10000)) - oracle * (capital + abs_pos) + abs_pos * entry = 0
// Use quadratic formula
```

#### PA-H5: Liquidation Staleness Check Wrong for Hyperp Markets (HIGH)

**Description:** In `packages/keeper/src/services/liquidation.ts:83-90`:
```typescript
const priceAge = cfg.authorityTimestamp > 0n ? now - cfg.authorityTimestamp : now;
if (priceAge > 60n) { ... return []; }
```

For Hyperp markets, `authorityTimestamp` stores the funding rate (bps per slot), NOT a unix timestamp. This means `now - fundingRate` produces a massive number, causing ALL Hyperp markets to be skipped for liquidation scanning.

**Impact:** Undercollateralized positions on Hyperp markets are never liquidated by the automated scanner.

**Fix:** Check if the market is Hyperp mode (indexFeedId is all zeros) and skip the staleness check, or use a different timestamp field.

---

## 4. PRODUCTION READINESS SCORECARD

| # | Area | Score (1-5) | Notes |
|---|---|---|---|
| 1 | On-chain Program Logic | 4 | Solid, Kani-verified, compile-time guards |
| 2 | On-chain Math Safety | 4 | checked_mul/checked_div, saturating ops, overflow guards |
| 3 | Account Validation | 5 | Every instruction validates signers, owners, PDAs, writable |
| 4 | Oracle Security | 4 | Circuit breaker, staleness (mainnet), authority checks |
| 5 | Insurance LP Design | 4 | Pro-rata, anti-drain threshold, PDA-gated mint |
| 6 | TypeScript SDK | 4 | ABI matches on-chain, slab parser handles all tiers |
| 7 | SDK Math | 3 | Liq price formula approximation needs fix |
| 8 | Frontend UX | 4 | Error boundaries, loading states, skeleton loaders |
| 9 | Frontend Security | 3 | No CSP headers, relies on backend for auth |
| 10 | Transaction Handling | 4 | Priority fees, retry, signature polling |
| 11 | Backend Architecture | 4 | Clean service split, event bus, structured logging |
| 12 | Backend Security | 2 | Secrets leaked, rate limit spoofable |
| 13 | API Design | 4 | REST + WebSocket, Zod validation, OpenAPI docs |
| 14 | Database Design | 3 | RLS enabled but relies on leaked service key |
| 15 | Secrets Management | 1 | Service role key in git — critical failure |
| 16 | CI/CD Pipeline | 2 | All tests `continue-on-error` — decorative |
| 17 | Unit Test Coverage | 4 | 365+ tests across 4 packages |
| 18 | Integration Tests | 4 | 32/32 on-chain tests passing (t1-t8, minus t5) |
| 19 | E2E Tests | 3 | Playwright configured but `continue-on-error` |
| 20 | Monitoring | 3 | Sentry configured, health endpoints, but no alerting |
| 21 | Documentation | 4 | Comprehensive README, arch docs, API docs |
| 22 | Economic Design | 3 | JIT deposit attack vector not mitigated |
| 23 | Deployment | 4 | Dockerfiles, Railway, Vercel configured |
| 24 | Disaster Recovery | 2 | No documented runbook, no backup strategy |

**Overall: 3.3/5 — Not production-ready for mainnet with real funds.**

---

## 5. MAINNET CHECKLIST

- [ ] **BLOCKER: Rotate ALL leaked secrets** (Supabase, Discord, Helius, Vercel OIDC, API key)
- [ ] **BLOCKER: Remove `.env.vercel` from git history** via `git filter-branch` or BFG
- [ ] **BLOCKER: Fix CI pipeline** — remove `continue-on-error` from at least unit tests and type check
- [ ] **BLOCKER: Fix Hyperp liquidation staleness check** in keeper service
- [ ] Fix `computeLiqPrice` for exact coin-margined formula (or add prominent "approximate" disclaimer)
- [ ] Transfer program upgrade authority to multisig (Squads)
- [ ] Add explicit Supabase RLS INSERT/UPDATE policies (don't rely solely on service role key)
- [ ] Deploy with `--features mainnet` (confirms no devnet/unsafe_close features)
- [ ] Set `API_AUTH_KEY` in production (currently allows all requests if unset)
- [ ] Add rate limiting at infrastructure level (Cloudflare/Railway) — app-level X-Forwarded-For is spoofable
- [ ] Create t5 integration test for insurance LP lifecycle
- [ ] Set up alerting (PagerDuty/Opsgenie) for crank failures, liquidation failures, health check failures
- [ ] Document disaster recovery runbook (what to do if crank stops, oracle goes stale, insurance drains)
- [ ] Add insurance LP time-lock (minimum holding period) to prevent JIT attacks
- [ ] Formal audit by a professional security firm (Trail of Bits, OtterSec, etc.) for the on-chain program

---

## 6. PRIORITIZED ACTION PLAN

### Phase 1: Before Mainnet (1-3 days) — BLOCKERS

| Priority | Action | Effort | Owner |
|---|---|---|---|
| P0 | Rotate ALL leaked secrets (Supabase, Helius, Discord, Vercel) | 1h | Admin |
| P0 | Remove `.env.vercel`, `.env.local`, `.env.vercel.preview` from git history | 2h | Dev |
| P0 | Add all env files to `.gitignore` properly | 15m | Dev |
| P0 | Remove `continue-on-error: true` from CI unit test + type check jobs | 30m | Dev |
| P0 | Fix Hyperp market liquidation staleness check | 1h | Dev |
| P1 | Fix `computeLiqPrice` to exact coin-margined formula | 4h | Dev |
| P1 | Transfer program upgrade authority to multisig | 2h | Admin |
| P1 | Set `API_AUTH_KEY` in all production environments | 30m | Admin |
| P1 | Add explicit Supabase RLS write policies | 2h | Dev |

### Phase 2: Before Public Launch (1-2 weeks)

| Priority | Action | Effort |
|---|---|---|
| P2 | Professional security audit of on-chain program | 2-4 weeks |
| P2 | Add infrastructure-level rate limiting (Cloudflare) | 4h |
| P2 | Create t5 integration test (insurance LP) | 8h |
| P2 | Add insurance LP time-lock (anti-JIT) | 4h |
| P2 | Set up alerting (PagerDuty) for crank/liquidation failures | 4h |
| P2 | Write disaster recovery runbook | 4h |
| P2 | Add CSP headers to frontend | 2h |
| P2 | Update README to reflect new backend architecture | 2h |

### Phase 3: Post-Launch Hardening

| Priority | Action | Effort |
|---|---|---|
| P3 | Bug bounty program (Immunefi) | Ongoing |
| P3 | Add circuit breaker for rapid OI growth (anti-manipulation) | 8h |
| P3 | Implement MEV protection (private mempool or Jito bundles) | 8h |
| P3 | Add position size limits per-user | 4h |
| P3 | Implement wash trading detection | 8h |
| P3 | Coverage gates in CI (≥80% minimum) | 2h |
| P3 | Add state bloat protection (max markets per deployer) | 4h |

---

*End of audit. Total files reviewed: ~120 source files across program, SDK, frontend, backend, tests, CI, and documentation.*
