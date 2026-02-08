# Percolator Launch — Production Readiness Audit

**Date:** 2026-02-08  
**Auditor:** Automated deep audit  
**Scope:** Full codebase review — trading flow, ABI, slab parser, frontend, backend, security, edge cases

---

## 1. Trading Flow — End to End

### ✅ Trade Instruction (useTrade.ts)
- Correctly builds TradeCpi instruction with signed i128 for size
- Supports both LONG (positive size) and SHORT (negative size)
- Auto-pushes oracle price + crank for admin oracle markets when user is authority
- Properly derives LP PDA and oracle account

### ✅ Deposit (useDeposit.ts)
- Clean implementation, correct account ordering
- Proper ATA derivation for user

### ✅ Withdraw (useWithdraw.ts)
- Includes auto-crank for admin oracle markets (essential — withdrawal needs fresh price)
- Correct vault PDA derivation, oracle account handling

### ✅ InitUser (useInitUser.ts)
- Simple, correct. Default 1_000_000 fee payment

### ✅ CreateMarket (useCreateMarket.ts) — 6-step wizard
- Step 0: Create slab account (with rent calculation)
- Step 1: Create vault ATA
- Step 2: InitMarket (with all risk params)
- Step 3: Oracle setup + UpdateConfig + pre-LP crank
- Step 4: Create matcher context + InitVamm + InitLP (atomic)
- Step 5: Deposit LP collateral + TopUp insurance
- Supports retry from any step (stores slabAddress in state)
- Registers market in Supabase post-creation (non-fatal on failure)

### ✅ Close Position (PositionPanel.tsx)
- Users close by sending opposite trade (e.g., LONG → trade negative size)
- Confirmation dialog with PnL estimate
- Works via same `useTrade` hook

### ✅ TradeForm Component
- Handles both LONG and SHORT with direction toggle
- Leverage slider (1x to max based on initialMarginBps)
- Margin percentage presets (25/50/75/100%)
- Shows: position size, notional value, est. fee, est. liq price
- Balance validation (prevents exceeding capital)

### ⚠️ Issue: No partial close
- Users must close entire position to reopen. The TradeForm blocks new trades when position exists.
- **Fix:** Allow trading when position is open (reduce/flip). The on-chain program supports it — only the UI blocks it.
- **Priority:** Medium (post-launch OK, but limits UX)

### ⚠️ Issue: Trade doesn't auto-crank for non-authority users
- `useTrade` only auto-cranks if `userIsAuthority`. Regular users rely on the crank service being active.
- If crank is stale (beyond `maxCrankStalenessSlots`), trades will fail on-chain.
- **Fix:** Either always bundle a crank IX (like the crank service does), or show clear "market stale" error.
- **Priority:** High — users will get confusing errors if crank is down

### ⚠️ Issue: PnL calculation uses `reservedPnl` as entry price fallback
- `PositionPanel.tsx` line: `const entryPriceE6 = account.reservedPnl > 0n ? account.reservedPnl : account.entryPrice;`
- Rust comment says `reserved_pnl` is `u64` for "trade entry price", but the Rust `entry_price` field is "last oracle mark price at which position was settled" (NOT trade entry).
- So `reservedPnl` IS the correct entry price for display. Naming is just confusing.
- **Status:** Working correctly despite confusing field names.

---

## 2. Slab Parser Accuracy

### ✅ Header parsing (72 bytes)
- Magic, version, bump, flags, admin, nonce, lastThrUpdateSlot — all correct
- Matches Rust `SlabHeader` layout exactly (verified: `RESERVED_OFF = 48` compile-time assertion)

### ✅ Config parsing (320 bytes at offset 72)
- All fields match Rust `MarketConfig` struct in correct order
- collateral_mint(32) + vault_pubkey(32) + index_feed_id(32) + max_staleness_secs(8) + conf_filter_bps(2) + vault_authority_bump(1) + invert(1) + unit_scale(4) + funding params + threshold params + oracle authority + circuit breaker
- i128/u128 reading correctly handles SBF 8-byte alignment

### ✅ Engine parsing (offset 392)
- All field offsets verified against Rust `RiskEngine` struct
- vault(16) + insurance_fund(32) + params(144) + current_slot(8) + funding_index(16) + ... all match
- LP aggregate fields (netLpPos, lpSumAbs, lpMaxAbs, lpMaxAbsSweep) correctly positioned

### ✅ Account parsing (240 bytes each)
- Field order matches Rust: account_id(8) + capital(16) + kind(1+7pad) + pnl(16) + reserved_pnl(8) + warmup(8) + warmup_slope(16) + position_size(16) + entry_price(8) + funding_index(16) + matcher_program(32) + matcher_context(32) + owner(32) + fee_credits(16) + last_fee_slot(8) = 240 ✓

### ✅ detectLayout works for small/medium/large tiers
- small (256 slots, 62808 bytes) ✓
- medium (1024 slots, 248760 bytes) ✓  
- large (4096 slots, 992568 bytes) ✓

### ❌ detectLayout FAILS for micro tier (64 slots, 16320 bytes)
- `slabLayout(64)` computes accountsOff=576, giving expected size=16328
- Actual on-chain size is 16320 (accountsOff=568, 8 bytes less)
- The `postBitmap = 24` constant in `slabLayout()` doesn't account for the smaller alignment padding in the micro tier
- **Impact:** Micro-tier slabs will fail to parse accounts correctly — `parseAccount`, `parseAllAccounts`, `parseUsedIndices` will all read from wrong offsets
- **Fix:** Align `slabLayout()` padding calculation with actual Rust compiled layout, or hardcode known tier offsets
- **Priority:** HIGH if micro-tier markets are created (they won't parse)

### ⚠️ `slabDataSize()` in discovery.ts is WRONG for all tiers
- Formula: `FIXED_OVERHEAD(8624) + bitmapBytes + maxAccounts * 240`
- Produces: micro=23992, small=70096, medium=254512, large=992176
- Actual: micro=16320, small=62808, medium=248760, large=992568
- **Impact:** This function isn't used for slab creation (UI uses `SLAB_TIERS.*.dataSize` directly), so no production impact
- **Fix:** Remove or correct this function to avoid confusion
- **Priority:** Low (unused code path)

---

## 3. ABI Encoders/Decoders

### ✅ Instruction tags match exactly
- Both percolator-launch and MidTermDev use identical IX_TAG values (0-20)
- All 21 instructions accounted for

### ✅ Instruction encoding matches exactly
- `encodeInitMarket`, `encodeTradeCpi`, `encodeKeeperCrank`, etc. — field order, sizes, types all identical between percolator-launch and MidTermDev
- `encodeUpdateConfig`: funding params (u64, u64, u128, i64, i64) + threshold params — matches Rust struct

### ✅ Account specs match (ordering, count)
- All instruction account orderings identical between percolator-launch and MidTermDev

### ⚠️ Writable flags differ (cosmetic)
- Percolator-launch marks signer accounts as `writable: true`; MidTermDev marks them `writable: false`
- **Impact:** Negligible — slightly higher CU cost per transaction (Solana charges more for writable accounts)
- **Fix:** Set signer-only accounts to `writable: false` where they don't need writes
- **Priority:** Low (optimization)

### ✅ Extra: Percolator-launch has `ACCOUNTS_INIT_VAMM` spec (matcher accounts)
- MidTermDev doesn't export this — percolator-launch added it for the vAMM matcher integration
- Correct and needed

---

## 4. Frontend UI Completeness

### ✅ Create Markets
- `/create` page with CreateMarketWizard component
- Quick Launch flow (auto-detect DEX pool, one-click)
- Manual creation with full parameter control
- 6-step progress indicator with retry support

### ✅ Markets List
- `/markets` page with MarketBrowser component
- Sorting by volume, OI, recency, health
- Health badges, price display, on-chain + Supabase data merge

### ✅ Trading Page
- `/trade/[slab]` with full trading interface
- TradeForm (long/short), PositionPanel, PriceChart, MarketStats, DepositWithdraw, AccountsCard

### ✅ Portfolio Page
- `/portfolio` with cross-market position display
- Total deposited, total PnL, active position count
- Links to individual trade pages

### ✅ Deposit/Withdraw
- DepositWithdrawCard component on trade page
- Both flows working with proper ATA derivation

### ✅ Price Chart
- SVG-based chart accumulating prices from slab state
- Falls back to API price history
- High/Low display, hover tooltips, time labels

### ✅ Loading States
- Skeleton loaders in PositionPanel (3 animated bars)
- Loading states in portfolio page
- "Sending..." state on trade buttons

### ✅ Error Handling
- Error messages displayed below trade/close buttons
- Balance validation with red highlight
- Non-fatal Supabase registration failure handling

### ⚠️ Mobile Responsive
- Uses Tailwind responsive classes (sm:, lg:)
- Grid layout with `grid-cols-1` → `grid-cols-6` breakpoints
- **Should verify:** Trade page complex layout may need testing on small screens
- **Priority:** Medium

### ⚠️ Devnet Mint Page
- `/devnet-mint` exists for faucet tokens
- Good for testing, should be hidden/removed for mainnet
- **Priority:** Low (harmless on mainnet, just confusing)

---

## 5. Backend/Server

### ✅ CrankService
- Discovers all markets via `discoverMarkets()`
- Cranks on configurable interval (default 10s)
- Pushes oracle price before crank for admin-oracle markets
- Per-market success/failure tracking

### ✅ OracleService
- Price fetching: DexScreener → Jupiter → cached (fallback chain)
- Pushes prices on-chain for admin-oracle markets
- Rate limiting (5s between pushes per market)
- Price history (last 100 entries per market)

### ✅ PriceEngine (WebSocket)
- Subscribes to slab account changes via Helius Enhanced WebSocket
- Parses `authorityPriceE6` from on-chain data
- Reconnection with exponential backoff
- Broadcasts via event bus
- Smart: skips connect if no subscriptions pending

### ✅ MarketLifecycleManager
- DEX pool auto-detection via DexScreener API
- Supports PumpSwap, Raydium CLMM, Meteora DLMM
- `prepareLaunch()` returns slab config for frontend
- `launchMarket()` discovers and registers created markets

### ✅ Health Endpoint
- Returns uptime, RPC latency, connected markets count, crank status per market

### ❌ Program ID Mismatch (Server vs App)
- Server default: `EXsr2Tfz8ntWYP3vgCStdknFBoafvJQugJKAh4nFdo8f`
- App devnet: `8n1YAoHzZAAz2JkgASr7Yk9dokptDa9VzjbsRadu3MhL`
- App mainnet: `GM8zjJ8LTBMv9xEsverh6H6wLyevgMHEJXcEzyY3rY24`
- **Impact:** Server won't find markets created by the app unless `PROGRAM_ID` env var is set correctly
- **Fix:** Align default program IDs, or better: share config between app and server
- **Priority:** HIGH — will cause crank service to not discover any markets

---

## 6. Security Issues

### ❌ Helius API Key Hardcoded in Client Code
- `app/lib/config.ts`: `e568033d-06d6-49d1-ba90-b3564c91851b` in both mainnet and devnet configs
- Also hardcoded in: `app/app/api/crank/route.ts`, `app/app/api/launch/route.ts`, `app/app/devnet-mint/devnet-mint-content.tsx`
- **Impact:** Anyone can see and abuse your Helius API key (rate limits, billing)
- **Fix:** Move to `NEXT_PUBLIC_HELIUS_API_KEY` env var for client code, `HELIUS_API_KEY` for server-side API routes
- **Priority:** CRITICAL for mainnet

### ⚠️ No Authentication on API Routes
- `/api/crank`, `/api/launch`, `/api/markets` — all publicly accessible
- `/api/crank/[slab]` could be called by anyone to crank markets (not harmful but costs SOL)
- `/api/markets` POST could be spammed with fake market registrations
- **Fix:** Add API key auth or rate limiting on sensitive endpoints
- **Priority:** Medium (crank is harmless; market registration needs auth)

### ✅ No Private Keys in Git
- Crank keypair loaded from `CRANK_KEYPAIR` env var
- Supabase credentials from env vars

### ⚠️ Server Supabase Key
- `packages/server/src/config.ts` has empty default for `SUPABASE_KEY`
- If configured, this could be a service role key with full DB access
- **Fix:** Ensure only anon key is used in client, service role only in trusted server
- **Priority:** Medium

---

## 7. Edge Cases & Bugs

### ⚠️ Trade Fails Mid-Transaction
- Solana transactions are atomic — partial failure reverts everything
- User sees error message from hook
- **No issue** — but consider adding retry logic for transient failures

### ❌ Stale Crank + User Trade
- If crank hasn't run within `maxCrankStalenessSlots`, all trades/withdrawals fail
- Current: only oracle authority users get auto-crank bundled
- Regular users get opaque on-chain error
- **Fix:** Bundle crank IX for all users, or detect staleness and show "Market needs crank" message
- **Priority:** HIGH

### ⚠️ No Token Balance Check Before Trade
- User can submit trade when they have 0 collateral tokens
- Transaction will fail on-chain with confusing error
- **Fix:** Check token balance before allowing deposit; check capital before trade
- **Priority:** Medium

### ⚠️ Slab Full (All Slots Used)
- InitUser/InitLP will fail on-chain
- No frontend message about slab capacity
- **Fix:** Show remaining slots on market page, disable "Create Account" when full
- **Priority:** Medium (unlikely for large slabs, critical for micro/small)

### ✅ Liquidation Flow
- `LiquidateAtOracle` instruction exists, encoded correctly
- Crank service performs liquidation sweeps during regular cranking
- Partial liquidation supported (liquidation_buffer_bps, min_liquidation_abs)

### ⚠️ Dust Amounts
- `parsePercToNative` in TradeForm rounds to 6 decimal places — reasonable
- On-chain `unit_scale` handles lamport/unit conversion with dust tracking
- **Low risk** but edge cases with very small amounts

### ⚠️ Integer Overflow in JS BigInt
- BigInt operations don't overflow (arbitrary precision)
- But conversion to `Number` (e.g., `Number(positionSize) / 1e6`) can lose precision for very large values
- **Impact:** Display inaccuracy for extremely large positions (>$9 quadrillion)
- **Priority:** Very Low

---

## 8. Missing Features vs MidTermDev

### MidTermDev CLI Commands We Don't Have UI For:
- ❌ `close-account` — reclaim rent (UI has close position but not close account)
- ❌ `close-slab` / `close-all-slabs` — admin market shutdown
- ❌ `resolve-market` — binary market resolution
- ❌ `withdraw-insurance` — post-resolution insurance withdrawal
- ❌ `update-admin` — transfer admin rights
- ❌ `set-risk-threshold` — adjust risk-reduction threshold
- ❌ `set-maintenance-fee` — adjust maintenance fees
- ❌ `set-oracle-price-cap` — adjust circuit breaker
- ❌ `liquidate-at-oracle` — manual liquidation trigger

### Critical for Launch:
1. **Close Account** — users need to reclaim rent when done
2. **Resolve Market** — needed for prediction/binary markets
3. **Admin Panel** — update config, set risk thresholds, etc.

### Can Wait:
- Manual liquidation trigger (crank handles this)
- Close slab (admin tool, can use CLI)
- Update admin (rare operation)

### MidTermDev Test Coverage We Lack:
- t14-liquidation, t15-funding, t16-risk-reduction, t17-edge-cases
- t18-inverted-market, t19-pyth-live-prices
- **Priority:** HIGH for confidence before mainnet

---

## 9. Code Quality

### ⚠️ Console.log Statements
- ~50 console.log/warn/error calls across app/ and packages/
- Server logs are appropriate (operational logging)
- Frontend has some debug logs that should be removed
- **Priority:** Low

### ✅ Only 1 TODO Comment
- `app/lib/config.ts:16`: `// TODO: set mainnet crank wallet`
- **Priority:** HIGH — must be set before mainnet launch

### ✅ TypeScript
- No obvious type errors in reviewed code
- Proper use of BigInt throughout
- Good interface definitions

### ⚠️ Dead Code
- `slabDataSize()` in discovery.ts produces wrong values and isn't used
- Duplicate component sets: `components/trade/` AND `components/trading/` (both have TradeForm, PositionPanel, DepositWithdraw)
- **Fix:** Remove duplicates and unused functions
- **Priority:** Low

---

## PRIORITIZED FIX LIST — Before Mainnet

### 🔴 P0 — MUST FIX (Blocks Launch)

1. **Helius API Key Exposure** — Move to env vars. Currently hardcoded in 8+ files including client-side code. Anyone can steal your key.

2. **Program ID Mismatch (Server)** — Server defaults to wrong program ID. Crank service won't find any markets unless `PROGRAM_ID` env var is explicitly set. Align with app config.

3. **Mainnet Crank Wallet** — `config.ts` has empty `crankWallet` for mainnet. Must be set or the crank service won't function.

4. **Stale Crank → Trade Failure** — Regular users can't trade if crank is stale. Either bundle crank IX in all trade/withdraw transactions, or detect and show meaningful error.

### 🟡 P1 — HIGH Priority (Launch Week)

5. **Micro-Tier Slab Parser Bug** — `detectLayout()` returns null for 16320-byte slabs. If any micro-tier market is created, all account parsing fails silently. Fix padding calculation.

6. **Close Account UI** — Users need a way to reclaim rent when closing out of a market. Add a "Close Account" button when position is flat and capital is 0.

7. **Admin Panel** — No way to update config, resolve markets, or manage oracle settings from the UI. At minimum, create a protected admin page.

8. **Token Balance Check** — Check user's token balance before showing deposit form. Check capital before showing trade form. Prevents confusing on-chain errors.

### 🟢 P2 — SHOULD FIX (First Month)

9. **Allow Partial Close / Position Flip** — Currently blocks new trades when position exists. Unlock the full trading flow.

10. **API Route Authentication** — Add rate limiting and/or API key auth on `/api/crank`, `/api/launch`, `/api/markets` POST.

11. **Slab Capacity Display** — Show used/max slots on market page. Critical for micro/small tiers.

12. **Remove Duplicate Components** — `components/trade/` vs `components/trading/` — pick one, delete the other.

13. **Remove Dead `slabDataSize()` Function** — Wrong values, unused, confusing.

14. **Account Spec Writable Optimization** — Set signer-only accounts to `writable: false` to save CU.

15. **Comprehensive Test Suite** — Port MidTermDev's test scenarios (liquidation, funding, edge cases, inverted markets).

16. **Hide Devnet Mint Page on Mainnet** — Conditional render based on network.
