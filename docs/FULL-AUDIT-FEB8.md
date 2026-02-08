# Full Architecture Audit — Feb 8, 2026

## Executive Summary

**Overall health: 6/10 — Solid foundations, several critical deployment bugs**

The Percolator Launch codebase is architecturally sound. The on-chain Rust program is well-engineered with formal verification (Kani), proper authorization checks, and a clean separation between the risk engine crate and the program wrapper. The TypeScript ABI layer (`packages/core`) is meticulously aligned with on-chain struct layouts. The frontend implements a complete 6-step market creation wizard.

**However, there are critical operational bugs that will cause failures in production:**

1. The backend server defaults to a **wrong program ID** (`EXsr...` instead of `8n1Y...`), meaning the crank/oracle services won't find any markets on devnet.
2. The crank service uses `callerIdx: 0` instead of `65535` (permissionless), which requires account[0] ownership — will fail for third-party markets.
3. Helius API keys are **hardcoded client-side** in plain text (rate-limit risk, not a security risk per se since they're read-only RPC keys).
4. The Supabase service role key is in `.env.local` which is gitignored, but the **anon key is exposed client-side by design** — Supabase RLS must be properly configured (unverified).
5. No post-creation crank is run, so new markets start with stale oracle state.

**Alignment with Toly's vision:** ~75%. The core percolator engine is faithfully implemented. The "one-click launch" UX exists but requires 6 separate wallet signatures. The vAMM matcher integration works. Missing: DEX oracle mode for live markets (only admin oracle tested), no liquidation bot, no on-chain event indexing.

---

## CRITICAL Issues (Must Fix Before Mainnet)

### C1: Backend Server Program ID Mismatch
- **File:** `packages/server/src/config.ts:5`
- **What:** Default programId is `EXsr2Tfz8ntWYP3vgCStdknFBoafvJQugJKAh4nFdo8f` — this is NOT the deployed devnet program (`8n1YAoHzZAAz2JkgASr7Yk9dokptDa9VzjbsRadu3MhL`).
- **Why it matters:** CrankService.discover() calls `getProgramAccounts` with the wrong program ID → finds zero markets → no cranking happens → oracle prices go stale → all trades/withdrawals fail with stale crank errors.
- **Fix:** Change default to `8n1YAoHzZAAz2JkgASr7Yk9dokptDa9VzjbsRadu3MhL` or require `PROGRAM_ID` env var on Railway.

### C2: Crank Service Uses callerIdx=0 (Not Permissionless)
- **File:** `packages/server/src/services/crank.ts:78`
- **What:** `encodeKeeperCrank({ callerIdx: 0, allowPanic: false })` — callerIdx=0 means "I own account at index 0, use that as my caller identity."
- **Why it matters:** The crank wallet (`2JaSzRY...`) doesn't own account[0] on user-created markets. The on-chain program will check `accounts[0].owner == signer` and reject. Every crank fails.
- **Fix:** Use `callerIdx: 65535` (0xFFFF = permissionless mode, matches `CRANK_NO_CALLER` constant). The frontend already does this correctly.

### C3: Helius API Keys Hardcoded in Client-Side Code
- **File:** `app/lib/config.ts:13,20` and `packages/server/src/config.ts:4`
- **What:** API key `e568033d-06d6-49d1-ba90-b3564c91851b` is hardcoded in source for both mainnet and devnet RPC URLs.
- **Why it matters:** Anyone can scrape this key from the frontend bundle. Helius rate-limits per API key. A malicious actor could exhaust your rate limits, causing all RPC calls to fail for all users. On mainnet this would be devastating.
- **Fix:** Move to `NEXT_PUBLIC_HELIUS_RPC_URL` env var (already partially done in launch route). Remove hardcoded keys. Use Helius's domain-restricted keys for frontend.

### C4: Oracle Authority Transfer Race Condition in CreateMarket
- **File:** `app/hooks/useCreateMarket.ts:198-211`
- **What:** In Step 3, SetOracleAuthority delegates to `cfg.crankWallet`. But the very next instruction in the same tx is PushOraclePrice signed by `wallet.publicKey`. If the SetOracleAuthority succeeds, the user is no longer the authority, but they're trying to push a price.
- **Why it matters:** The PushOraclePrice instruction checks that the signer matches `oracle_authority`. After SetOracleAuthority, the authority is the crank wallet, so the user's push will fail. The entire Step 3 transaction fails.
- **Fix:** Push the initial oracle price BEFORE setting the oracle authority to the crank wallet:
  1. PushOraclePrice (user is still authority)
  2. UpdateConfig
  3. KeeperCrank
  4. SetOracleAuthority (transfer to crank wallet last)

### C5: Missing Oracle Price Push Before Post-LP Crank
- **File:** `app/hooks/useCreateMarket.ts` — no post-LP-setup crank
- **What:** After Step 5 (deposit collateral + insurance), no final crank is run. MidTermDev's `setup-sov-v2.ts` does 3 cranks (Steps 7, 11, 12). Our wizard only does 1 crank in Step 3 (before LP creation).
- **Why it matters:** After LP creation, the engine needs a crank to recognize the LP's capital in its aggregates (c_tot, etc.). Without this, the first user trade may encounter stale engine state. The backend crank will eventually fix this, BUT only if C1 and C2 are fixed first.
- **Fix:** Add a final crank after Step 5 (or rely on the backend crank service, once it works).

---

## HIGH Issues (Should Fix Soon)

### H1: Slab Size Mismatch — Discovery Won't Find 256-Slot Markets
- **File:** `packages/core/src/solana/discovery.ts:39`
- **What:** `SLAB_TIERS.small.dataSize = 62_808` but the deployed devnet program uses `small` feature (256 slots). If the actual on-chain slab size differs even by 1 byte, `getProgramAccounts` with `dataSize` filter returns nothing.
- **Why it matters:** If the computed slab size doesn't exactly match what was allocated on-chain, market discovery fails silently.
- **Fix:** Verify that `62_808` exactly matches the deployed program's computed `SLAB_LEN` for 256 slots. The comment in discovery.ts even warns about this. Cross-check by querying the actual deployed slab account size.

### H2: OracleService Uses Collateral Mint for Price Lookup
- **File:** `packages/server/src/services/oracle.ts:105`
- **What:** `const mint = marketConfig.collateralMint.toBase58()` — fetches price for the collateral token, not the market's index token.
- **Why it matters:** For a "BONK perp" market, collateral would be USDC but the oracle needs BONK's price. If collateral IS the index token (like SOV's PERC token), this works by coincidence. For any USDC-collateralized market, it pushes USDC's price ($1) instead of the actual token price.
- **Fix:** Store the index token mint separately in the market config or Supabase, and use that for price lookups.

### H3: No Authentication on Backend Market Registration
- **File:** `packages/server/src/routes/markets.ts:77-79`
- **What:** `POST /markets` accepts any `slabAddress` and registers it. No signature verification, no API key.
- **Why it matters:** Anyone can register fake markets, spam the discovery system, or overwrite legitimate market metadata.
- **Fix:** Require a signed message from the market admin, or at minimum verify the slab account exists on-chain and matches the claimed data.

### H4: Frontend POST /api/markets Has No Auth Either
- **File:** `app/app/api/markets/route.ts`
- **What:** The Next.js API route inserts directly into Supabase using the service role key (bypasses RLS). No authentication check.
- **Why it matters:** Anyone can POST to this endpoint and insert arbitrary rows into the `markets` table (slab_address, mint_address, etc.). Could poison the market browser with fake entries.
- **Fix:** Verify the deployer signature or at minimum check that the slab account exists on-chain with matching data.

### H5: No Liquidation Bot
- **What:** Neither the backend server nor any separate service runs liquidations.
- **Why it matters:** Undercollateralized accounts won't be liquidated, leading to bad debt that socializes losses to all users. The insurance fund exists but without active liquidation, it's not triggered.
- **Fix:** Add a liquidation scanner service that periodically checks all accounts' margin health and submits LiquidateAtOracle transactions. MidTermDev has test scripts for this (`t14-liquidation.ts`).

### H6: SetOraclePriceCap Not Called During Market Creation
- **File:** `app/hooks/useCreateMarket.ts` — no SetOraclePriceCap instruction
- **What:** The oracle price circuit breaker (`oracle_price_cap_e2bps`) defaults to 0 (disabled).
- **Why it matters:** Without a price cap, a compromised oracle authority (or buggy price feed) could set an extreme price in one update, triggering mass liquidations.
- **Fix:** Set a reasonable price cap during market creation (e.g., `10_000` = 1% max change per update, matching `DEFAULT_HYPERP_PRICE_CAP_E2BPS`).

---

## MEDIUM Issues (Should Fix Eventually)

### M1: Six Separate Wallet Signatures for Market Creation
- **File:** `app/hooks/useCreateMarket.ts`
- **What:** Steps 0-5 each send a separate transaction, requiring 6 wallet approvals.
- **Why it matters:** Terrible UX. Users may abandon mid-flow. "One-click launch" promise is broken — it's "six-click launch."
- **Fix:** Batch steps into fewer transactions. Steps 0+1 can't be merged (createAccount needs new keypair as signer), but Steps 2+3 could be one tx, and Steps 4+5 could be one tx. Best case: 3 signatures.

### M2: No Market Recovery from Partial Creation
- **File:** `app/hooks/useCreateMarket.ts:116-123`
- **What:** The retry mechanism stores `slabAddress` but not the slab keypair. If Step 0 succeeds but Step 2 fails, the slab is created but empty. Retry from Step 2 works, but retry from Step 0 creates a duplicate slab (wasting SOL).
- **Why it matters:** Users lose SOL on failed partial creations and get confused by orphaned slab accounts.
- **Fix:** Store the slab keypair in sessionStorage (or better, derive it deterministically from wallet pubkey + nonce).

### M3: PriceEngine Has No Active Subscriptions on Startup
- **File:** `packages/server/src/services/PriceEngine.ts:41-42`
- **What:** `start()` calls `connect()` but there are no slabs to subscribe to initially. The engine connects to WebSocket, has nothing to do, and sits idle.
- **Why it matters:** Not harmful, but the PriceEngine only becomes useful once `subscribeToSlab` is called. Currently nothing calls it — the crank/oracle services use their own price fetching.
- **Fix:** Either wire PriceEngine into the lifecycle manager (auto-subscribe when markets are discovered) or remove PriceEngine if it's unused. Currently it's dead code in the server.

### M4: Supabase Tables Not Verified
- **What:** The code references tables: `markets`, `market_stats`, `markets_with_stats` (view), `trades`, `oracle_prices`. No migration files or schema definition in the repo.
- **Why it matters:** If Supabase tables don't exist or have wrong columns, all DB operations silently fail. The market browser would show nothing.
- **Fix:** Add a `supabase/migrations/` directory with SQL schema definitions. Add a health check that verifies table existence.

### M5: vAMM Mode Set to 0 (Passive) in CreateMarket
- **File:** `app/hooks/useCreateMarket.ts:257`
- **What:** `vammData[off] = 0; off += 1; // mode 0 = passive` — mode 0 means the matcher acts as a passive LP (no impact pricing).
- **Why it matters:** In passive mode, the LP just takes the other side at a fixed spread. No price impact means large orders don't move the market, which is unrealistic and potentially exploitable. MidTermDev also uses mode 0, so this matches upstream, but for mainnet you likely want mode 1 (vAMM with impact).
- **Fix:** Consider offering mode 1 as an option in the launch wizard, especially for higher-liquidity markets.

### M6: DexScreener Rate Limiting Not Handled
- **Files:** `packages/server/src/services/oracle.ts`, `packages/server/src/services/lifecycle.ts`, `app/hooks/useDexPoolSearch.ts`
- **What:** Multiple components fetch from DexScreener API without rate limiting or caching coordination.
- **Why it matters:** DexScreener rate limits aggressively. With multiple markets, the oracle service could get blocked, causing all price pushes to fail.
- **Fix:** Centralize DexScreener calls through a single cached service with rate limiting.

### M7: Frontend Config Uses localStorage for Network Selection
- **File:** `app/lib/config.ts:4-7`
- **What:** Network ("mainnet"/"devnet") is stored in `localStorage` and used to select the entire config including program IDs.
- **Why it matters:** A user could manually set `localStorage.percolator_network = "mainnet"` on the devnet deployment, causing the frontend to point at mainnet program IDs with devnet wallet balances. Confusion at best, lost funds at worst.
- **Fix:** Derive network from `NEXT_PUBLIC_DEFAULT_NETWORK` env var only. Remove localStorage override or add clear visual indicators.

---

## LOW Issues (Nice to Have)

### L1: Unused Code — DEX Oracle in Launch Route
- **File:** `app/app/api/launch/route.ts:131-138`
- **What:** The oracle feed is derived from the pool address bytes, but this doesn't correspond to any actual on-chain oracle mechanism. The feed ID stored in the slab must match the oracle account passed to crank/trade, and a DEX pool pubkey != a Pyth feed ID.
- **Fix:** If DEX oracle mode is intended, the feed ID should be the pool address (which is correct for the on-chain DEX oracle readers). Clarify documentation.

### L2: eslint-disable Comments
- **File:** `app/app/api/markets/route.ts:45`
- **What:** `// eslint-disable-next-line @typescript-eslint/no-explicit-any` used to bypass type safety.
- **Fix:** Type the Supabase client properly using generated types.

### L3: Missing Error Display in Trade Hook
- **File:** `app/hooks/useTrade.ts:34`
- **What:** The `error` state is set but the hook re-throws the error. Callers need to handle both.
- **Fix:** Either set error OR re-throw, not both.

### L4: Server Health Route Not Implemented
- **File:** `packages/server/src/routes/health.ts` — not audited but referenced
- **Fix:** Ensure `/health` returns crank service status, last successful crank time, and DB connectivity.

### L5: No TypeScript Tests for Core ABI Against On-Chain
- **What:** `packages/core/test/` has unit tests for encoding, but no integration test that actually sends a transaction to devnet and verifies it succeeds.
- **Fix:** The `tests/t1-market-boot.ts` etc. exist at the repo root, but they should be wired into CI.

### L6: `.keys/` Directory Contains Deployer Keypair
- **File:** `.keys/deployer.json`, `.keys/program.json`
- **What:** Secret keys in the repo directory (hopefully gitignored).
- **Fix:** Verify `.gitignore` covers `.keys/`. Consider using Solana's default keypair location instead.

---

## Feature Gap Analysis

### What MidTermDev Has That We Don't
| Feature | MidTermDev | Percolator Launch | Gap |
|---------|-----------|-------------------|-----|
| Test suite depth | 22 test files (t1-t22) | 3 test files (t1-t3) | **Large** — missing: liquidation, funding, edge cases, adversarial, stress |
| Liquidation testing | t14-liquidation.ts, check-liquidation.ts | None | **Critical** |
| Funding rate testing | t15-funding.ts, check-funding.ts, update-funding-config.ts | None | **High** |
| Determinism testing | t9-determinism.ts | None | Medium |
| Adversarial testing | t10-adversarial.ts, audit-timing-attacks.ts, audit-deep-redteam.ts | None | **High** |
| Admin burn | burn-admin.ts | Not implemented | Medium |
| Market resolution | force-close-all.ts | On-chain exists, no frontend/script | Medium |
| Live trading script | t21-live-trading.ts, t22-devnet-stress.ts | e2e-devnet-test.ts (basic) | Medium |
| Bug recovery scripts | bug-recovery-overhaircut.ts, verify-fixes.ts | None | Low |

### What Toly's Vision Requires That We Haven't Built
1. **Permissionless market creation by anyone** — ✅ Implemented (frontend wizard)
2. **One-click launch** — ⚠️ Six clicks currently
3. **Any Solana token** — ✅ Works for SPL tokens with DEX liquidity
4. **Perpetual futures trading** — ✅ Core engine supports this
5. **Automatic LP via vAMM** — ✅ Matcher + vAMM implemented
6. **DEX-based oracle pricing** — ⚠️ On-chain support exists (PumpSwap, Raydium, Meteora readers), but frontend only creates admin-oracle markets
7. **Funding rate mechanism** — ✅ Inventory-based funding implemented
8. **Risk management** — ✅ Margin checks, liquidation engine, insurance fund
9. **Scalable market discovery** — ✅ getProgramAccounts with dataSize filter
10. **Background services (crank, oracle)** — ⚠️ Implemented but broken (C1, C2)

---

## Architecture Assessment

### What's Sound
- **On-chain program** is excellent. Clean instruction decoding, proper account validation, Kani formal verification, comprehensive authorization model with pure `verify::` module. The risk engine separation (engine crate vs wrapper program) is well-done.
- **Core TypeScript ABI** is precise. Every encoder matches the on-chain decoder byte-for-byte. The account specs are carefully ordered. The slab parser handles variable-size slabs correctly.
- **Frontend hooks** follow good patterns — separation of concerns, proper error handling, retry support.

### What Needs Rethinking
1. **Backend architecture is redundant.** The Railway Hono server duplicates functionality that the Next.js API routes already provide. The PriceEngine is unused. Consider whether you need a separate backend at all — the crank could be a standalone worker (like MidTermDev's scripts).
2. **Oracle strategy is unclear.** Admin oracle works for demos but doesn't scale. For mainnet, each market needs a reliable price source. The DEX oracle readers exist on-chain but the frontend/backend don't support creating DEX-oracle markets.
3. **No event indexing.** Trades, liquidations, and funding payments are only visible by parsing slab account data. There's no transaction log indexer. This makes the trade history feed unreliable.
4. **Database schema is undocumented.** Supabase tables are assumed to exist but never defined in code. Any schema change breaks silently.

### Recommended Priority Order
1. **Fix C1 + C2** (30 min) — Backend crank will immediately start working
2. **Fix C4** (15 min) — Reorder oracle authority instructions
3. **Fix C3** (30 min) — Move API keys to env vars
4. **Fix H2** (1 hr) — Oracle service needs to use index token, not collateral
5. **Fix H3/H4** (2 hr) — Add basic authentication to market registration
6. **Add liquidation service** (4 hr) — Critical for mainnet safety
7. **Reduce tx count** (2 hr) — Better UX for market creation
8. **Add CI tests** (4 hr) — Wire up existing test suite
