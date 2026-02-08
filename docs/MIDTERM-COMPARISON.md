# Percolator-Launch vs MidTermDev: Market Creation Comparison

> Generated: 2026-02-08

## Executive Summary

**Critical findings: 3 BUGs, 7 MISMATCHes**

The ABI layers (instruction encoding, account specs) are **identical** — both repos share the same core. The differences are in **parameter values**, **transaction grouping**, **account writable flags**, and **missing steps** in our flow.

---

## 1. InitMarket

### Instruction Data Layout
✅ **MATCH** — Both use identical `encodeInitMarket()` with same byte layout.

### Parameter Values

| Parameter | Ours (useCreateMarket) | MidTermDev (setup-sov-v2) | Status |
|---|---|---|---|
| indexFeedId | `"0".repeat(64)` (user choice) | `"0".repeat(64)` | ✅ MATCH (admin oracle) |
| maxStalenessSecs | `"50"` | `"86400"` | ⚠️ **MISMATCH** |
| confFilterBps | `0` | `0` | ✅ |
| invert | user choice | `1` | ✅ (param) |
| unitScale | `0` | `0` | ✅ |
| initialMarkPriceE6 | user param | `"1000000"` | ✅ (param) |
| warmupPeriodSlots | `"0"` | `"100"` | ⚠️ **MISMATCH** |
| maintenanceMarginBps | `initialMarginBps / 2` | `"500"` | ✅ (logic) |
| initialMarginBps | user param | `"1000"` | ✅ (param) |
| tradingFeeBps | user param | `"30"` | ✅ (param) |
| maxAccounts | `"4096"` (default) | `"4096"` | ✅ |
| newAccountFee | `"1000000"` | `"1000000"` | ✅ |
| riskReductionThreshold | `"0"` | `"0"` | ✅ |
| maintenanceFeePerSlot | `"0"` | `"0"` | ✅ |
| maxCrankStalenessSlots | `"100"` | `"400"` | ⚠️ **MISMATCH** |
| liquidationFeeBps | `"100"` | `"100"` | ✅ |
| liquidationFeeCap | `"0"` | `"100000000000"` | ⚠️ **MISMATCH** |
| liquidationBufferBps | `"50"` | `"50"` | ✅ |
| minLiquidationAbs | `"0"` | `"1000000"` | ⚠️ **MISMATCH** |

#### Key Differences:
- **maxStalenessSecs**: Ours = 50s, Theirs = 86400s (24h). For admin oracle mode, 86400 is more forgiving. 50s is very tight and will cause stale oracle errors if crank is even slightly delayed.
  - 🐛 **BUG**: 50s staleness for admin oracle is almost certainly too tight for production. Should be at least 3600 or 86400.
- **warmupPeriodSlots**: Ours = 0, Theirs = 100. Zero means no warmup, which is fine for instant launch.
- **maxCrankStalenessSlots**: Ours = 100, Theirs = 400. Ours is tighter. Could cause issues if crank frequency is low.
- **liquidationFeeCap**: Ours = 0 (no cap), Theirs = 100B. Zero means uncapped liquidation fees which is actually dangerous.
  - 🐛 **BUG**: `liquidationFeeCap: "0"` means no cap on liquidation fees. Should set a reasonable cap like `"100000000000"`.
- **minLiquidationAbs**: Ours = 0, Theirs = 1M. Zero means any position can be liquidated regardless of size.

### Account Ordering

| # | Name | Ours (keys passed) | MidTermDev (keys passed) | Status |
|---|---|---|---|---|
| 0 | admin | wallet.publicKey | payer.publicKey | ✅ |
| 1 | slab | slabPk | slab.publicKey | ✅ |
| 2 | mint | params.mint | PERC_MINT | ✅ |
| 3 | vault | vaultAta | vault | ✅ |
| 4 | tokenProgram | TOKEN_PROGRAM_ID | TOKEN_PROGRAM_ID | ✅ |
| 5 | clock | SYSVAR_CLOCK | SYSVAR_CLOCK | ✅ |
| 6 | rent | SYSVAR_RENT | SYSVAR_RENT | ✅ |
| 7 | dummyAta | **vaultAta** | **vaultPda** | 🐛 **BUG** |
| 8 | systemProgram | SystemProgram | SystemProgram | ✅ |

🐛 **BUG — Account 7 (dummyAta)**: 
- **Ours** passes `vaultAta` (the token account)
- **MidTermDev** passes `vaultPda` (the PDA authority)
- The Rust program likely ignores this "dummy" account, but we should match MidTermDev to be safe. The name "dummyAta" suggests it was historically for the vault ATA, but MidTermDev uses the vault PDA. **Investigate what the on-chain program actually expects.**

### Account Writable Flags

| Account | Ours (accounts.ts) | MidTermDev (accounts.ts) | Status |
|---|---|---|---|
| admin | `signer: true, writable: true` | `signer: true, writable: false` | ⚠️ **MISMATCH** |

Our `accounts.ts` marks admin as `writable: true` in ACCOUNTS_INIT_MARKET, ACCOUNTS_INIT_LP, ACCOUNTS_INIT_USER, etc. MidTermDev marks admin/user as `writable: false` in all these. The Solana runtime doesn't fail for extra writable flags, but it costs more CU.

---

## 2. InitLP

### Instruction Data Layout
✅ **MATCH** — Both encode: `tag(1) + matcherProgram(32) + matcherContext(32) + feePayment(8)` = 73 bytes.

### Parameter Values

| Parameter | Ours | MidTermDev | Status |
|---|---|---|---|
| feePayment | `"1000000"` | `"2000000"` | ⚠️ **MISMATCH** |

⚠️ **MISMATCH — feePayment**: Ours = 1M, Theirs = 2M. This is the fee transferred from user ATA to vault during InitLP. If the on-chain program requires this to match `newAccountFee` exactly, our value is correct (1M = newAccountFee). But MidTermDev uses 2M — possibly they changed newAccountFee at some point or pay extra. **Verify on-chain logic**. If feePayment < required, the tx will fail.

### Account Ordering
✅ **MATCH** — Both pass: [user, slab, userAta, vault, tokenProgram]

---

## 3. Matcher Init (vAMM Tag 2)

### Data Format
✅ **MATCH** — Both manually build 66 bytes:

| Offset | Field | Ours | MidTermDev | Status |
|---|---|---|---|---|
| 0 | tag | 2 | 2 | ✅ |
| 1 | mode | 0 (passive) | 0 (passive) | ✅ |
| 2 | tradingFeeBps | 50 | 50 | ✅ |
| 6 | baseSpreadBps | 50 | 50 | ✅ |
| 10 | maxTotalBps | 200 | 200 | ✅ |
| 14 | impactKBps | 0 | 0 | ✅ |
| 18 | liquidityNotionalE6 | 10T | 10T | ✅ |
| 34 | maxFillAbs | 1T | 1T | ✅ |
| 50 | maxInventoryAbs | 0 | 0 | ✅ |

### Account Ordering for Matcher Init

| # | Ours | MidTermDev | Status |
|---|---|---|---|
| 0 | lpPda (read) | lpPda (read) | ✅ |
| 1 | matcherCtxKp (write) | matcherCtxKp (write) | ✅ |

✅ **MATCH** — Both use 2 accounts with same flags.

### Context Account Size
| | Ours | MidTermDev | Status |
|---|---|---|---|
| MATCHER_CTX_SIZE | 320 | 320 | ✅ |

---

## 4. Deposit Collateral

### Flow
- **Ours**: Step 4 — DepositCollateral + TopUpInsurance combined in one tx
- **MidTermDev**: Step 9 (deposit) + Step 10 (topup) as **separate transactions**

⚠️ **MISMATCH** in grouping but functionally equivalent.

### Account Ordering
✅ **MATCH** — Both: [user, slab, userAta, vault, tokenProgram, clock]

---

## 5. Oracle Setup

### SetOracleAuthority
✅ **MATCH** — Both: `encodeSetOracleAuthority({ newAuthority: admin })` with [admin, slab] accounts.

### PushOraclePrice
✅ **MATCH** — Both: `encodePushOraclePrice({ priceE6, timestamp })` with [authority, slab] accounts.

### Flow Ordering

| Step | Ours (admin oracle path) | MidTermDev |
|---|---|---|
| 1 | SetOracleAuthority | Step 4: SetOracleAuthority (separate tx) |
| 2 | PushOraclePrice | Step 5: PushOraclePrice (separate tx) |
| 3 | KeeperCrank | Step 7: KeeperCrank (separate tx) |
| | All 3 in ONE tx (Step 5) | 3 separate txs |

⚠️ **MISMATCH** — MidTermDev does oracle setup + first crank **before** InitLP. We do it **after** InitLP + deposit. MidTermDev's order:
1. Create slab → 2. Vault ATA → 3. InitMarket → 4. SetOracleAuth → 5. PushPrice → 6. UpdateConfig → 7. Crank → 8. Matcher+LP → 9. Deposit → 10. Insurance → 11. Crank again

Our order:
1. Create slab → 2. Vault ATA → 3. InitMarket → 4. InitLP+Matcher → 5. Deposit+Insurance → 6. Oracle+Crank

**This is significant.** MidTermDev cranks the market BEFORE creating the LP. This ensures the market state is valid before LP initialization. We skip this pre-LP crank entirely.

---

## 6. Crank (KeeperCrank)

### Instruction Data
✅ **MATCH** — Both: `tag(1) + callerIdx(2) + allowPanic(1)` = 4 bytes, callerIdx=65535, allowPanic=false.

### Account Ordering
✅ **MATCH** — Both: [caller, slab, clock, oracle(=slab for admin mode)]

### When Called

| | Ours | MidTermDev | Status |
|---|---|---|---|
| Pre-LP crank | ❌ Not done | ✅ Step 7 | ⚠️ **MISMATCH** |
| Post-LP crank | ✅ Step 5 | ✅ Steps 11-12 (2-3 cranks) | ⚠️ |

---

## 7. Transaction Grouping

### Ours (6 transactions)
| TX | Instructions |
|---|---|
| 0 | CreateAccount (slab) |
| 1 | CreateATA (vault) |
| 2 | InitMarket |
| 3 | CreateAccount (matcher ctx) + InitVamm + InitLP |
| 4 | DepositCollateral + TopUpInsurance |
| 5 | SetOracleAuth + PushPrice + KeeperCrank |

### MidTermDev (12+ transactions)
| TX | Instructions |
|---|---|
| 1 | CreateAccount (slab) |
| 2 | getOrCreateATA (vault) — may be implicit |
| 3 | InitMarket |
| 4 | SetOracleAuthority |
| 5 | PushOraclePrice |
| 6 | UpdateConfig (funding params) |
| 7 | KeeperCrank (pre-LP) |
| 8 | CreateAccount (matcher ctx) |
| 9 | InitVamm (matcher) |
| 10 | InitLP |
| 11 | DepositCollateral |
| 12 | TopUpInsurance |
| 13 | PushPrice + KeeperCrank |
| 14 | PushPrice + KeeperCrank (stability) |

### Key Differences:
1. MidTermDev sends matcher ctx creation, vAMM init, and InitLP as **3 separate transactions**. We combine them atomically. Our approach is better (atomic = no partial state).
2. MidTermDev does **UpdateConfig** (funding params) — we **don't do this at all**.
   - 🐛 **BUG (missing step)**: We never call `UpdateConfig` to set funding parameters. This means the market runs with default/zero funding params. If the on-chain defaults are zero, the market will have no funding rate mechanism.
3. MidTermDev does a pre-LP crank. We don't.
4. MidTermDev does multiple verification cranks. We do one.

---

## 8. SLAB_TIERS / Sizes

| | Ours | MidTermDev | Status |
|---|---|---|---|
| Default slab size | `SLAB_TIERS.large.dataSize` = **992,568** | **992,560** | ⚠️ **MISMATCH** |
| Formula | `8624 + ceil(4096/64)*8 + 4096*240` = `8624 + 512 + 983040` = **992,176**??? | hardcoded 992,560 | 🔍 |

Let me verify our formula:
- `FIXED_OVERHEAD = 8624`
- `bitmapBytes = ceil(4096/64)*8 = 64*8 = 512`  
- `accounts = 4096 * 240 = 983,040`
- **Total = 8624 + 512 + 983040 = 992,176**

But `SLAB_TIERS.large.dataSize = 992,568`. That's 992,568 - 992,176 = **392 bytes off**. The hardcoded tier value doesn't match the formula!

And MidTermDev uses 992,560 which is yet another value.

**However**: the `slabDataSize()` function uses the formula, but `SLAB_TIERS` uses hardcoded values. If the UI uses `SLAB_TIERS.large.dataSize` (which `DEFAULT_SLAB_SIZE` does), it gets 992,568. If using `slabDataSize(4096)`, it gets 992,176.

⚠️ **Potential issue**: The slab account is created with whatever size is passed. The on-chain program reads `maxAccounts` from InitMarket data and validates the slab is big enough. As long as the slab is >= the minimum required size, extra bytes are ignored. So all three values (992,176 / 992,560 / 992,568) should work if they're all ≥ the true minimum. But it's messy.

---

## 9. Program IDs and Constants

| Constant | Ours (config.ts) | MidTermDev (.env) | Status |
|---|---|---|---|
| PROGRAM_ID (mainnet) | `GM8zjJ8LTBMv9xEsverh6H6wLyevgMHEJXcEzyY3rY24` | `GM8zjJ8LTBMv9xEsverh6H6wLyevgMHEJXcEzyY3rY24` | ✅ |
| MATCHER_PROGRAM_ID (mainnet) | `DHP6DtwXP1yJsz8YzfoeigRFPB979gzmumkmCxDLSkUX` | `DHP6DtwXP1yJsz8YzfoeigRFPB979gzmumkmCxDLSkUX` | ✅ |
| MATCHER_CTX_SIZE | 320 | 320 | ✅ |
| PRIORITY_FEE | 50,000 | 50,000 | ✅ |

---

## 10. Missing from Our Flow

| Feature | Ours | MidTermDev | Impact |
|---|---|---|---|
| UpdateConfig (funding params) | ❌ **Missing** | ✅ Step 6 | 🐛 **HIGH** — No funding rate |
| Pre-LP KeeperCrank | ❌ Missing | ✅ Step 7 | ⚠️ MEDIUM — Market state may be stale |
| Multiple verification cranks | ❌ 1 crank | ✅ 2-3 cranks | ⚠️ LOW |
| Slab keypair persistence | ❌ In-memory | ✅ Saves to file | N/A (script vs UI) |

---

## Summary of All Issues

### 🐛 BUGs (Must Fix)

| # | Issue | Location | Fix |
|---|---|---|---|
| B1 | `maxStalenessSecs: "50"` too tight for admin oracle | useCreateMarket.ts:136 | Change to `"86400"` for admin oracle mode |
| B2 | `liquidationFeeCap: "0"` means uncapped liquidation fees | useCreateMarket.ts:147 | Set to `"100000000000"` or configurable |
| B3 | **Missing UpdateConfig** — no funding params set | useCreateMarket.ts (entire file) | Add UpdateConfig call after InitMarket with funding/threshold params |

### ⚠️ MISMATCHes (Should Fix)

| # | Issue | Location | Fix |
|---|---|---|---|
| M1 | Account 7 (dummyAta): we pass vaultAta, they pass vaultPda | useCreateMarket.ts:162 | Pass `vaultPda` instead of `vaultAta` |
| M2 | `feePayment: "1000000"` vs theirs `"2000000"` | useCreateMarket.ts:195 | Verify on-chain requirement. May need `"2000000"` |
| M3 | `maxCrankStalenessSlots: "100"` vs `"400"` | useCreateMarket.ts:145 | Consider increasing to 400 |
| M4 | `warmupPeriodSlots: "0"` vs `"100"` | useCreateMarket.ts:138 | Consider if warmup is desired |
| M5 | `minLiquidationAbs: "0"` vs `"1000000"` | useCreateMarket.ts:149 | Set to `"1000000"` to prevent dust liquidations |
| M6 | No pre-LP crank | useCreateMarket.ts | Add crank before InitLP step |
| M7 | Writable flags on admin/user accounts | accounts.ts | Our accounts.ts marks admin as `writable: true`, theirs as `false`. Cosmetic but wastes CU. |

### Recommended Fix Priority
1. **B3** (UpdateConfig) — Without this, funding rate doesn't work
2. **B1** (maxStalenessSecs) — Will cause stale oracle errors immediately  
3. **M1** (dummyAta account) — Could cause on-chain validation failure
4. **B2** (liquidationFeeCap) — Financial risk
5. **M2** (feePayment) — Could cause InitLP failure
6. **M6** (pre-LP crank) — May cause LP init issues
7. Rest are parameter tuning
