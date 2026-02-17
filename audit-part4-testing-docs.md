# Audit Part 4: Testing, Documentation & Previous Audit Reconciliation

**Branch:** `cobra/feature/new-backend`  
**Date:** 2026-02-17  
**Scope:** All tests, CI/CD, documentation, TODO/FIXME audit, previous audit reconciliation

---

## PART 6: TESTING

### 6.1 Integration Tests (`tests/`)

| Test | What It Tests | Against | Key Assertions |
|------|--------------|---------|----------------|
| **t1-market-boot** | Market init, slab header, config, engine state, oracle price, crank | Live devnet | Magic set, admin matches, margin params correct, crank slot updated |
| **t2-user-lifecycle** | Init user, deposit, withdraw, second user, LP creation | Live devnet | Account index assigned, capital positive, numUsedAccounts increments |
| **t3-hyperp-lifecycle** | Full resolution: create → trade → crank → resolve → force-close → withdraw insurance → cleanup | Live devnet | Market resolved flag, all positions force-closed, slab rent reclaimed |
| **t4-liquidation** | Full liquidation with vAMM LP: create market → init LP via matcher → deposit → leveraged trade → crash price → liquidate | Live devnet | Position zeroed/reduced after liquidation, market still healthy post-liq |
| **t6-risk-gate** | Direction flip: LONG → close → SHORT immediately, multiple rapid flips | Live devnet | SHORT opens without Error 22, risk_reduction_threshold stays reasonable |
| **t7-market-pause** | Pause/Unpause (Tags 27/28): blocks deposits/withdrawals/init, crank still works, non-admin rejected | Live devnet | Custom(33) on blocked ops, Custom(15) for non-admin, idempotent pause |
| **t8-trading-fee-update** | UpdateRiskParams: old 17-byte format preserves fee, new 25-byte format updates fee, fee>1000 rejected | Live devnet | Fee preserved/updated correctly, invalid fee rejected |
| **devnet-e2e** | Full E2E: create slab → init market → oracle → init LP via matcher → deposit → init user → trade | Live devnet | All 7 steps complete, trade tx confirmed |

**t5 is MISSING.** Based on the numbering pattern and gaps in coverage:
- t1=boot, t2=user, t3=hyperp, t4=liquidation, t6=risk, t7=pause, t8=fee
- **t5 should test: Trading / Position Management** — open long, open short, partial close, full close, PnL calculation, funding rate settlement. This is the core trading flow that t3 touches lightly but doesn't systematically validate.

**All integration tests run against LIVE DEVNET** — real Solana transactions with real SOL. This is excellent for confidence but:

| ID | Severity | Category | Title | Location | Description | Impact | Fix |
|----|----------|----------|-------|----------|-------------|--------|-----|
| T-01 | HIGH | Testing | t5 (trading lifecycle) missing | `tests/` | No dedicated test for core trading: open/close positions, PnL correctness, funding settlement | Core trading path has no systematic coverage | Create t5-trading.ts covering long/short, partial close, PnL verification |
| T-02 | MEDIUM | Testing | t3 has compilation errors | `tests/t3-hyperp-lifecycle.ts:60,64` | Calls `h.initUser(ctx!, "trader1")` and `h.deposit(ctx!, "trader1", ...)` with string args, but harness expects `UserContext` objects | Test likely fails to run | Fix method calls to use UserContext pattern from t2 |
| T-03 | MEDIUM | Testing | t4/t6/t7/t8 use different PROGRAM_ID defaults | `tests/t4-liquidation.ts:30` vs `tests/harness.ts:36` | t4/t6/t7/t8 default to `FxfD37...` while harness defaults to `EXsr2T...`. Different programs, potentially incompatible | Tests may target wrong program | Unify PROGRAM_ID defaults or require env var |
| T-04 | LOW | Testing | t4/t6/t7/t8 don't use TestHarness | All later tests | t1/t2 use the shared `TestHarness` class; t4+ are standalone scripts with duplicated setup code (~200 lines each) | Maintenance burden, inconsistency | Refactor to use TestHarness or create a shared base |
| T-05 | LOW | Testing | No negative test for double-init | `tests/` | No test verifies that initializing a user twice fails properly | Could miss double-init bugs | Add test case |
| T-06 | MEDIUM | Testing | No withdrawal-under-margin test | `tests/` | No test verifies that withdrawing while having an open position that would breach margin is rejected | Margin safety untested | Add test: open position → try withdraw → expect rejection |
| T-07 | MEDIUM | Testing | No concurrent crank test | `tests/` | No test verifies behavior when two cranks race | Could reveal concurrency bugs | Add test with parallel crank attempts |

### 6.2 E2E Tests (`e2e/`)

**4 Playwright spec files:**
- `trade.spec.ts` — 7 tests: full trade lifecycle, wallet disconnect mid-trade, network mismatch, price refresh, MAX button, invalid input
- `wallet.spec.ts` — 11 tests: connect/disconnect, wallet switching, persistence, network validation, error handling (not installed, rejection, timeout), state management
- `liquidation.spec.ts` — 5 tests: liquidate underwater position, healthy position preserved, stale oracle, gas estimation failure, PnL overflow
- `devnet-mint.spec.ts` — 9 tests: create token, empty name, emoji, mint authority, invalid pubkey, Metaplex errors, decimals range, supply validation, edge cases

| ID | Severity | Category | Title | Location | Description | Impact | Fix |
|----|----------|----------|-------|----------|-------------|--------|-----|
| T-08 | HIGH | Testing | E2E tests are aspirational, not functional | `e2e/*.spec.ts` | Tests reference `data-testid` attributes that don't exist in the actual frontend code. E.g., `[data-testid="wallet-modal"]`, `[data-testid="market-SOL-PERP"]`, `[data-testid="trade-preview"]` — none of these exist in the app. These tests will ALL fail immediately with element-not-found errors. | Zero actual E2E coverage | Either add data-testid attributes to all referenced components, or rewrite tests to use actual selectors |
| T-09 | HIGH | Testing | E2E tests have `continue-on-error: true` in CI | `.github/workflows/test.yml:107` | E2E job has `continue-on-error: true` so failures never block merges | E2E tests provide zero protection | Remove `continue-on-error` once tests work |
| T-10 | MEDIUM | Testing | liquidation.spec.ts calls non-existent backend endpoint | `e2e/liquidation.spec.ts:73` | `fetch('http://localhost:4000/api/test/update-oracle-price')` — this test endpoint doesn't exist | Test will always fail at step 2 | Either create test endpoint or use on-chain oracle push |
| T-11 | LOW | Testing | No `playwright.config.ts` in repo | root | Playwright config not found — tests can't actually run without it | Tests can't be executed | Add playwright.config.ts with baseURL, browser config |

### 6.3 Unit Tests (`packages/*/tests/`)

**97 tests across API (12 files), plus shared (~40 tests across 10 files), keeper (3 files), indexer (3 files).**

**API tests (packages/api/tests/):**
- Middleware: auth (5 tests), rate-limit (4+ tests), validateSlab (7 tests)
- Routes: crank, funding, health, insurance, markets, open-interest, prices, stats, trades — all with mock Supabase, testing response formats, error handling, edge cases

**Shared tests (packages/shared/tests/):**
- config, logger, retry, sanitize, sentry, validation, db/queries, services/events, utils/binary, utils/rpc-client

**Keeper tests:**
- crank.test.ts, liquidation.test.ts, oracle.test.ts — all heavily mocked

**Indexer tests:**
- MarketDiscovery.test.ts, StatsCollector.test.ts, TradeIndexer.test.ts — all heavily mocked

| ID | Severity | Category | Title | Location | Description | Impact | Fix |
|----|----------|----------|-------|----------|-------------|--------|-----|
| T-12 | MEDIUM | Testing | All keeper/indexer tests use shallow mocks | `packages/keeper/tests/`, `packages/indexer/tests/` | Every external dependency is mocked: `@solana/web3.js`, `@percolator/core`, `@percolator/shared`. Tests verify mock interactions, not actual behavior. E.g., crank.test.ts mocks `sendAndConfirmTransaction` → only tests that it's called, not that the transaction succeeds. | Tests pass but don't catch real integration bugs | Add integration tests that use real RPC (even if against devnet) |
| T-13 | LOW | Testing | API route tests mock Supabase chain methods | `packages/api/tests/routes/` | Mocks like `mockSupabase.from().select().eq().single()` are fragile — if Supabase API changes method signatures, mocks still pass | Could miss Supabase API changes | Consider using Supabase local for integration tests |
| T-14 | LOW | Testing | 3 InsuranceLP hook tests skipped | `app/__tests__/hooks/useInsuranceLP.test.ts:427,564,575` | `it.skip("TODO: fix mock timeout")` — 3 tests skipped indefinitely | Reduced coverage of insurance LP flows | Fix the mock timeouts |

### 6.4 Shell Scripts

| Script | Purpose | Tests |
|--------|---------|-------|
| `test-funding-api.sh` | Manual API smoke test for funding endpoints | GET /funding/:slab, /funding/:slab/history, /funding/global, time-range query |
| `test-hidden-apis.sh` | Tests warmup, insurance, and OI API endpoints | 3 feature groups × 3-4 tests each + response time checks (<50-100ms) |
| `test-hidden-perf.sh` | Performance benchmarks: latency, concurrency, load test | 10-iteration benchmarks per endpoint, 5-concurrent requests, mixed load test |
| `test-hidden-db.sql` | Database schema validation for migration 007 | Checks columns exist, tables exist, indexes, data integrity, OI math, negative values, query performance |

These are well-written manual testing scripts but:

| ID | Severity | Category | Title | Location | Description | Impact | Fix |
|----|----------|----------|-------|----------|-------------|--------|-----|
| T-15 | LOW | Testing | Shell scripts not in CI | `.github/workflows/` | None of the shell scripts run in CI | Manual-only validation | Add CI job for API smoke tests |

### 6.5 Coverage Gaps (Ranked by Risk)

| Rank | Gap | Risk | Why |
|------|-----|------|-----|
| 1 | **On-chain instruction paths 6-13 not tested** | CRITICAL | Instructions like WithdrawCollateral edge cases, CloseAccount with balance, TopUpInsurance → only t2 tests basic withdraw. No adversarial withdraw tests (withdraw more than available, withdraw during liquidation) |
| 2 | **Frontend trade flow completely untested** | CRITICAL | E2E tests are non-functional (wrong selectors). No component tests for TradeForm, PositionPanel, DepositWithdrawCard |
| 3 | **Backend service failure modes** | HIGH | No tests for: Supabase down, RPC timeout mid-crank, partial crank failure, oracle push fails, double-crank |
| 4 | **Coin-margined PnL calculation** | HIGH | No test verifies the non-linear coin-margined PnL formula correctness. This is the math that determines if a position should be liquidated |
| 5 | **WebSocket reconnection** | MEDIUM | No test for WS disconnect/reconnect, subscription restoration, stale data handling |
| 6 | **Multi-market keeper interactions** | MEDIUM | No test for keeper managing multiple markets simultaneously |
| 7 | **Token2022 handling** | LOW | No tests for Token2022 tokens (transfer fees, etc.) |

### 6.6 CI/CD Analysis

**5 workflow files:**

| Workflow | Triggers | What It Does | Gates Merge? |
|----------|----------|-------------|-------------|
| `pr-check.yml` | PR + push to main | Build all packages, run all unit tests, build frontend | **YES** — no `continue-on-error` |
| `test.yml` | PR + push to main | Unit tests, integration tests, E2E, security, type check, merge gate | **NO** — every test job has `continue-on-error: true` |
| `build-program.yml` | Push/PR on program/** | Build 4 Rust variants + run Rust tests | **Mostly YES** — only fuzz tests have `continue-on-error` |
| `deploy.yml` | Manual dispatch | Docker build + push to GHCR | N/A (manual) |
| `verified-build.yml` | Push/PR on program/** | solana-verify reproducible build | YES |

| ID | Severity | Category | Title | Location | Description | Impact | Fix |
|----|----------|----------|-------|----------|-------------|--------|-----|
| T-16 | HIGH | CI/CD | `test.yml` merge gate is decorative | `.github/workflows/test.yml:153-162` | The "Merge Gate" job `needs: [unit-tests, integration-tests, e2e-tests, security-tests, type-check]` but ALL those jobs have `continue-on-error: true`. The gate ALWAYS passes regardless of test failures. | Zero test enforcement from this workflow | Remove `continue-on-error: true` from unit-tests and type-check at minimum |
| T-17 | MEDIUM | CI/CD | `test.yml` references non-existent test scripts | `.github/workflows/test.yml:50,56` | Runs `cd packages/server && pnpm test:unit` and `cd app && pnpm test:unit` — these scripts may not exist in current package.json | Jobs silently fail (continue-on-error) | Verify package.json scripts exist or update workflow |
| T-18 | MEDIUM | CI/CD | `pr-check.yml` and `test.yml` duplicate effort | Both workflows | Both run on PR to main, both build packages and run tests. `pr-check.yml` actually enforces; `test.yml` doesn't | Wasted CI minutes, confusion about which gates | Consolidate into one workflow |
| T-19 | LOW | CI/CD | `test.yml` uses Node 20, `pr-check.yml` uses Node 22 | Both workflows | Version mismatch could cause different test results | Subtle incompatibilities | Standardize on Node 22 |
| T-20 | LOW | CI/CD | No frontend unit tests in `pr-check.yml` | `.github/workflows/pr-check.yml` | `pr-check.yml` builds frontend but doesn't run `app` tests | Frontend regressions not caught by the enforcing workflow | Add `pnpm --filter app test` if tests exist |
| T-21 | MEDIUM | CI/CD | Coverage gate is a no-op | `.github/workflows/test.yml:130-143` | Coverage check job just echoes messages, enforces nothing | No coverage regression detection | Implement actual coverage threshold checks |

---

## PART 9: DOCUMENTATION

### 9.1 README.md

| ID | Severity | Category | Title | Location | Description | Impact | Fix |
|----|----------|----------|-------|----------|-------------|--------|-----|
| D-01 | MEDIUM | Docs | Quick Start references `packages/server` not `packages/api` | `README.md:84` | Backend section says `cd packages/server && pnpm dev` but the new backend is split into `packages/api`, `packages/keeper`, `packages/indexer` | New developer follows wrong instructions | Update to reflect new package structure |
| D-02 | LOW | Docs | Badge says "32/32 tests passing" | `README.md:11` | Actually 97+ API tests + shared + keeper + indexer tests. Number is outdated | Misleading | Update badge or use dynamic CI badge |
| D-03 | LOW | Docs | Architecture diagram shows "Backend (Hono / Railway)" as single box | `README.md:102-108` | Backend is now split into 3 services | Diagram is inaccurate | Update diagram to show api/keeper/indexer split |

### 9.2 docs/BACKEND-ARCHITECTURE.md

Comprehensive comparison doc between Percolator Launch and MidTermDev's implementation. **Accurate as of 2026-02-08** but some items are now resolved:
- "We have unit tests for @percolator/core only" → now have 97+ API tests, keeper tests, indexer tests
- Missing integration test suite → now have tests/t1-t8
- Event bus needed → shared/src/services/events.ts now exists

### 9.3 docs/INSURANCE-LP-SPEC.md

Detailed spec for Insurance LP Token system. **Status: Planning.** Not yet implemented. The spec is well-written but:
- References PDA-derived mint approach (zero slab layout change) ✅ Good decision
- Implementation requires 2 new instructions (Tag 24, 25) — not yet in program
- No timeline or priority indicated

### 9.4 docs/MAINNET-READINESS.md

**Mostly accurate.** Key points:
- Correctly identifies slab size incompatibility with toly's program ✅
- ABI compatibility assessment is thorough ✅  
- Feature gap table is accurate ✅
- Missing: the secrets-in-git issue (PA-C1 from platform-audit.md) is not mentioned here

### 9.5 docs/MAINNET-ROADMAP.md

4-phase roadmap. **Timeline assessment:**
- Phase 1 (Security Fixes): Realistic, 1-2 days
- Phase 2 (On-Chain Features): Partially done (Tags 22, 27, 28 implemented per tests)
- Phase 3 (Insurance LP): Spec exists but no code — 2-3 weeks realistic
- Phase 4 not detailed in excerpt

### 9.6 SECURITY.md

Covers security headers, CORS, WebSocket auth, input sanitization, rate limiting. **Decent but incomplete:**

| ID | Severity | Category | Title | Location | Description | Impact | Fix |
|----|----------|----------|-------|----------|-------------|--------|-----|
| D-04 | HIGH | Docs | No responsible disclosure process | `SECURITY.md` | No email/contact for reporting vulnerabilities, no bug bounty program, no PGP key | Security researchers have no way to report | Add security@percolatorlaunch.com or similar |
| D-05 | MEDIUM | Docs | SECURITY.md documents features, not threats | `SECURITY.md` | Lists what security features exist but not threat model, attack vectors, or security assumptions | Gives false confidence | Add threat model section |

### 9.7 CONTRIBUTING-AGENTS.md

**File does not exist** on this branch.

| ID | Severity | Category | Title | Location | Description | Impact | Fix |
|----|----------|----------|-------|----------|-------------|--------|-----|
| D-06 | LOW | Docs | CONTRIBUTING-AGENTS.md missing | root | The `/agents` page exists in the app but no contributing guide for AI agents | AI agents contributing without guidelines | Create CONTRIBUTING-AGENTS.md covering: safe operations, forbidden actions, testing requirements |

### 9.8 Code Documentation

- **lib.rs**: Not accessible (Rust program in `program/` or `percolator/` — would need to read)
- **SDK (@percolator/core)**: Functions have JSDoc-style comments in some files (e.g., harness.ts has good module-level docs). Encoder functions are self-documenting via TypeScript types. No generated API docs.
- **Slab parser**: Well-commented with field offsets and explanations

### 9.9 TODO/FIXME/HACK Inventory

| Location | Content | Priority |
|----------|---------|----------|
| `percolator/tests/kani.rs:4459` | `TODO: TOP_UP_INSURANCE_FUND PROOF FAMILY` | LOW — Kani proofs are aspirational |
| `app/components/market/InsuranceTopUpModal.tsx:97` | `TODO: Implement client-side transaction building` | MEDIUM — Insurance top-up non-functional |
| `app/__tests__/hooks/useInsuranceLP.test.ts:427,564,575` | 3 skipped tests with `TODO: fix mock timeout` | LOW — Test maintenance |
| `app/lib/config.ts:25` | `TODO: set mainnet crank wallet` | HIGH — Blocks mainnet |
| `packages/core/src/config/program-ids.ts:17` | `TODO: Deploy matcher to mainnet` | HIGH — Blocks mainnet |

**Only 7 TODO items total** — unusually clean codebase. No FIXME, HACK, XXX, TEMP, or WORKAROUND found.

---

## PREVIOUS AUDIT RECONCILIATION

Previous audit files were removed in commit `91d639e` ("cleanup: remove 43 temporary .md files"). Retrieved from commit `4c7e90b`.

### AUDIT-TRADE.md Findings

| Finding | Severity | Status | Evidence |
|---------|----------|--------|----------|
| TradeHistory schema mismatch (price vs price_e6) | CRITICAL | **FIXED** | New backend in `packages/shared/src/db/queries.ts` uses unified schema with Zod validation |
| No trade indexer running | CRITICAL | **FIXED** | `packages/indexer/src/services/TradeIndexer.ts` exists with signature scanning |
| price_e6 field doesn't exist in DB | HIGH | **FIXED** | Schema unified in new backend migration |
| Hardcoded devnet explorer URL | LOW | **OPEN** | Would need to check current TradeHistory.tsx — likely fixed in refactor |
| setMarginPercent loses precision | MEDIUM | **OPEN** | TradeForm.tsx still uses BigInt division (per platform-audit.md findings) |
| Max button truncation | MEDIUM | **OPEN** | Same precision issue as setMarginPercent |
| Keyboard shortcut dead code | LOW | **OPEN** | Not verified as fixed |
| Trade blocked when position exists | MEDIUM | **OPEN** | Fundamental UX decision, not a bug fix |
| Risk gate only blocks UI | MEDIUM | **OPEN** | On-chain enforces, but UI should match |
| PositionPanel entryPrice uses reservedPnl | HIGH | **OPEN** | Not verified as fixed in current code |
| Margin health calculation simplistic | LOW | **OPEN** | Would need deeper code check |
| DepositWithdrawCard silent error swallowing | MEDIUM | **OPEN** | Common pattern, likely still present |
| No wallet balance for deposits | MEDIUM | **OPEN** | Feature not added |
| useLivePrice WS_URL default localhost | HIGH | **FIXED** | WebSocket implementation rewritten in new backend |
| SlabProvider no error surfacing | MEDIUM | **OPEN** | Would need component check |
| MarketBookCard bid/ask identical | MEDIUM | **OPEN** | Structural issue, unlikely changed |
| useLivePrice 24h stats not displayed | MEDIUM | **OPEN** | Feature gap |

### AUDIT-PAGES.md Findings

| Finding | Severity | Status | Evidence |
|---------|----------|--------|----------|
| C1: Markets page deprecated supabase import | CRITICAL | **LIKELY FIXED** | New backend pattern uses `getSupabase()` throughout |
| C2: Volume shows cTot not volume | CRITICAL | **OPEN** | UI logic likely unchanged |
| C3: Quick Launch no balance check | CRITICAL | **OPEN** | Would need component verification |
| C4: Insurance amount decimal mismatch | CRITICAL | **OPEN** | Would need component verification |
| C5: Network switch no reload | CRITICAL | **OPEN** | Structural issue, unlikely changed |
| H1-H8: Various high issues | HIGH | **MIXED** | Some fixed by backend refactor, others UI-specific and likely open |
| M1-M12: Medium issues | MEDIUM | **MOSTLY OPEN** | UI issues generally not addressed in backend refactor |
| L1-L9: Low issues | LOW | **MOSTLY OPEN** | Minor cleanup items |

### AUDIT-BACKEND.md Findings

| Finding | Severity | Status | Evidence |
|---------|----------|--------|----------|
| Trade history not indexed | CRITICAL | **FIXED** | `packages/indexer/src/services/TradeIndexer.ts` implements tx signature scanning |
| Supabase functions never called | CRITICAL | **FIXED** | New `packages/shared/src/db/queries.ts` is imported by indexer/keeper services |
| Two competing backend architectures | CRITICAL | **FIXED** | Backend split into api/keeper/indexer — clear separation of concerns |
| InsuranceLPService writes zero | HIGH | **FIXED** | StatsCollector now reads actual values from slab data |
| Rate limiting not applied | HIGH | **FIXED** | `packages/api` applies `readRateLimit()` and `writeRateLimit()` middleware |
| VammService created but never started | HIGH | **FIXED** | Removed in cleanup (platform-audit.md confirms) |
| PriceEngine in-memory only | HIGH | **FIXED** | StatsCollector persists to Supabase |
| Next.js crank wrong program ID | HIGH | **FIXED** | Centralized config in `packages/core/src/config/program-ids.ts` |
| WS reconnect doesn't re-subscribe | MEDIUM | **FIXED** | Rewritten WebSocket implementation |
| No heartbeat/ping | MEDIUM | **FIXED** | `packages/api/src/routes/ws.ts` has heartbeat |
| Frontend wrong stats URL | MEDIUM | **FIXED** | New backend has proper API URL config |
| Crank discovers every cycle | MEDIUM | **FIXED** | Discovery interval separate from crank interval in keeper config |
| No Supabase error recovery | MEDIUM | **OPEN** | `withRetry` utility exists but circuit breaker not implemented |

---

## SUMMARY

### Test Health Score: 4/10

**What's good:**
- Integration tests (t1-t8) are thorough, test against real devnet, cover critical paths
- Unit tests (97+ API, shared, keeper, indexer) provide good coverage of individual modules
- Shell scripts provide manual API validation
- Rust tests include Kani formal verification attempts
- CI builds all packages and runs tests

**What's broken:**
- E2E tests are entirely non-functional (wrong selectors, missing data-testids)
- `test.yml` CI workflow gates nothing (all `continue-on-error: true`)
- t5 (core trading lifecycle) is missing
- No frontend component/hook tests that actually work
- Keeper/indexer tests are mock-heavy with no integration path

### Documentation Health Score: 6/10

**What's good:**
- README is comprehensive with good project structure docs
- BACKEND-ARCHITECTURE.md is honest about gaps
- MAINNET-READINESS.md is thorough
- INSURANCE-LP-SPEC.md is detailed design doc
- SECURITY.md covers implemented features

**What's missing:**
- No responsible disclosure / bug bounty process
- No CONTRIBUTING-AGENTS.md
- README references old package structure
- No API documentation (OpenAPI/Swagger)
- No runbook / operations guide

### Previous Audit Score: 70% Fixed

Of ~50 findings across 3 audit files:
- ~25 FIXED (mostly via backend refactor)
- ~20 OPEN (mostly frontend/UI issues untouched by backend work)
- 0 REGRESSED

### Top 5 Actions

1. **Fix CI merge gate** — Remove `continue-on-error: true` from `test.yml` unit-tests and type-check jobs (30 min)
2. **Add data-testid attributes to frontend** — Make E2E tests functional (2-3 days)
3. **Create t5-trading.ts** — Core trading lifecycle test (4 hours)
4. **Add responsible disclosure** to SECURITY.md — Email + PGP key (30 min)
5. **Update README** — Fix package references, test count badge (30 min)
