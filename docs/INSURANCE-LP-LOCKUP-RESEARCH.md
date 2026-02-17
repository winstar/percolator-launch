# Insurance LP Withdrawal Lockup / Cooldown Mechanisms
## Research for Percolator — Coin-Margined Perpetual DEX (Solana)

**Date:** February 17, 2026  
**Author:** Research compiled for Percolator implementation  
**Purpose:** Inform the implementation of JIT-attack prevention for `DepositInsuranceLP` (Tag 25) and `WithdrawInsuranceLP` (Tag 26)

---

## Table of Contents

1. [The Problem: JIT Insurance Fund Attacks](#1-the-problem-jit-insurance-fund-attacks)
2. [How Other Protocols Handle This](#2-how-other-protocols-handle-this)
3. [Common Mechanism Patterns](#3-common-mechanism-patterns)
4. [Trade-offs Analysis](#4-trade-offs-analysis)
5. [Percolator-Specific Constraints](#5-percolator-specific-constraints)
6. [Current Percolator Implementation (Code Audit)](#6-current-percolator-implementation-code-audit)
7. [Proposed Approach for Percolator](#7-proposed-approach-for-percolator)
8. [Implementation Plan](#8-implementation-plan)
9. [Slab Layout Impact & Migration Analysis](#9-slab-layout-impact--migration-analysis)
10. [Comparison: Solana Perp DEXs Specifically](#10-comparison-solana-perp-dexs-specifically)

---

## 1. The Problem: JIT Insurance Fund Attacks

### The Attack Vector

The Percolator insurance fund:
- Collects trading fees, liquidation fees, and maintenance fees
- Users deposit collateral via `DepositInsuranceLP` → receive pro-rata LP tokens (SPL mint)
- Users withdraw via `WithdrawInsuranceLP` → burn LP tokens for pro-rata fund share
- LP token price = `insurance_fund.balance / lp_supply`

**JIT (Just-In-Time) attack scenario:**

```
Slot T:    Attacker observes large pending liquidation (or knows fee event is coming)
Slot T+1:  Attacker deposits collateral → receives LP tokens at pre-fee price
Slot T+2:  Liquidation fee hits → insurance_fund.balance increases → LP price rises
Slot T+3:  Attacker withdraws → LP tokens now worth more → attacker extracts pure yield
```

The attacker enjoys **yield with zero risk** — they weren't in the fund when the underlying risk events (e.g. bad debt, price moves) occurred. They only participated during the guaranteed positive fee event.

### Why This Matters

- Every large liquidation event is observable on-chain (account crossing maintenance margin)
- Liquidation fees can be significant (configured via `liquidation_fee_bps`)
- An attacker can extract disproportionate yield without being exposed to the fund's actual risk (insolvency events, bad debt)
- Over time this dilutes returns for legitimate long-term stakers and destabilizes the fund

---

## 2. How Other Protocols Handle This

### 2.1 Drift Protocol (Solana) — Insurance Fund Staking

**Architecture:** Separate `InsuranceFundStake` PDA per user per market (136 bytes). The stake account is NOT an SPL token — it's a custom on-chain record.

**Cooldown mechanism (two-step withdrawal):**

```rust
// State (in InsuranceFundStake PDA):
pub struct InsuranceFundStake {
    pub authority: Pubkey,          // 32 bytes
    if_shares: u128,                // 16 bytes — user's stake shares
    pub last_withdraw_request_shares: u128, // 16 bytes — pending withdrawal
    pub if_base: u128,              // 16 bytes — rebase exponent
    pub last_valid_ts: i64,         // 8 bytes
    pub last_withdraw_request_value: u64,   // 8 bytes — value at request time
    pub last_withdraw_request_ts: i64,      // 8 bytes — COOLDOWN ANCHOR
    pub cost_basis: i64,            // 8 bytes
    pub market_index: u16,          // 2 bytes
    pub padding: [u8; 14],          // 14 bytes
}  // Total: 136 bytes

// Per-market configuration (in SpotMarket):
pub unstaking_period: i64,  // THIRTEEN_DAY = 13 * 24 * 3600 = 1,123,200 seconds
```

**Flow:**
1. `add_insurance_fund_stake`: deposit → increase `if_shares`
2. `request_remove_insurance_fund_stake`: sets `last_withdraw_request_ts = now`, `last_withdraw_request_shares = n_shares`
3. **During cooldown:** shares still count, staker STOPS earning rewards, funds remain slashable
4. `remove_insurance_fund_stake`: checks `now - last_withdraw_request_ts >= unstaking_period`

**Key details:**
- Cooldown is **13 days** (docs say 13-14 days, code uses `THIRTEEN_DAY` constant)
- The cooldown period uses **Unix timestamps** (not slots) — Drift uses real-time clocks
- During cooldown, staker does NOT earn rewards
- Staker can cancel the request (resetting the cooldown timer)
- Cannot unstake while spot utilization > 80% (prevents bank runs)
- The `last_withdraw_request_value` is snapshot at request time — if fund loses value, staker is penalized proportionally (they don't get the amount they requested, only the proportional remaining value)

**Source:** `programs/drift/src/controller/insurance.rs`, `state/insurance_fund_stake.rs`, `math/constants.rs`

---

### 2.2 GMX V1 (Arbitrum/Avalanche) — GLP Cooldown

**Architecture:** EVM mapping `lastAddedAt[address]`, cooldown duration stored in GlpManager contract.

**Mechanism (deposit-time lockup, per-address):**

```solidity
// In GlpManager.sol:
mapping(address => uint256) public lastAddedAt;
uint256 public cooldownDuration = 15 minutes; // 900 seconds

function _removeLiquidity(address _account, ...) private {
    require(
        lastAddedAt[_account].add(cooldownDuration) <= block.timestamp,
        "GlpManager: cooldown duration not yet passed"
    );
    // ...
}

function _addLiquidity(address _account, ...) private {
    // ...
    lastAddedAt[_account] = block.timestamp; // SET ON DEPOSIT
    // ...
}
```

**Flow:**
1. User mints GLP → `lastAddedAt[user] = block.timestamp`
2. User cannot burn GLP for **15 minutes** after last mint
3. After 15 minutes, burn proceeds

**Key details:**
- Only 15 minutes — much shorter than Drift's 13 days
- Applied PER-ADDRESS: each address has its own cooldown independently
- **Cooldown resets on each deposit** — if user tops up, the clock restarts
- LP tokens (GLP) ARE transferable — so receiver has no cooldown (their `lastAddedAt` is 0, so they can withdraw immediately after transfer)
- This creates a subtle griefing vector: repeatedly depositing 1 wei can reset your own cooldown... but you're hurting yourself not others
- GMX V2 uses a different liquidity model (GM tokens, separate pools per market)

**Why 15 minutes?** At GMX's scale, 15 minutes is enough to make JIT uneconomical (GLP price usually moves within this window from ongoing fees). For perpetual DEXs with larger, rarer liquidation events, longer periods are needed.

---

### 2.3 Aave Safety Module — AAVE/stkAAVE Cooldown

**Architecture:** EVM, per-address cooldown timestamp.

**Mechanism (request-then-withdraw with expiry window):**

```solidity
// Call cooldown() to initiate:
function cooldown() external {
    stakersCooldowns[msg.sender] = block.timestamp;
}

// Then redeem() after cooldown period:
function redeem(address to, uint256 amount) external {
    uint256 cooldownStartTimestamp = stakersCooldowns[msg.sender];
    require(
        block.timestamp > cooldownStartTimestamp + COOLDOWN_SECONDS,
        "INSUFFICIENT_COOLDOWN"
    );
    require(
        block.timestamp - (cooldownStartTimestamp + COOLDOWN_SECONDS) <= UNSTAKE_WINDOW,
        "UNSTAKE_WINDOW_FINISHED"
    );
    // ...
}
```

**Current parameters:**
- **Cooldown period:** 20 days (configurable by governance)
- **Unstake window:** 2 days (must redeem within this window or restart cooldown)
- **During cooldown:** rewards continue to accrue, funds remain slashable

**Key details:**
- Two-step: `cooldown()` → wait 20 days → `redeem()` within 2-day window
- Staking MORE tokens during an active cooldown resets the cooldown proportionally
- New deposits reset or extend the cooldown based on stake size
- Has an **expiry window** — if you don't redeem in time, you need to restart

**Purpose:** AAVE stakers act as the protocol's backstop. The 20-day window prevents bank runs when bad debt events occur (gives governance time to respond).

---

### 2.4 Synthetix — SNX Staking Cooldown

**Architecture:** EVM, per-address timestamp tracking.

**Mechanism:**
- 7-day cooldown to unstake SNX
- Staking rewards are **escrowed for 1 year** before becoming transferable
- The escrow prevents JIT on rewards: even if you stake briefly, you can't extract rewards for a year

**Key insight (reward escrow):** Instead of blocking *withdrawal of principal*, Synthetix blocks *withdrawal of yield*. You can potentially unstake the principal after 7 days, but the rewards earned are locked for 1 year. This is a different attack surface from insurance funds.

---

### 2.5 Jupiter Perps — JLP

**Architecture:** Solana, based on Kamino/GMX-style liquidity management. JLP is an SPL token (no direct on-chain cooldown mechanism in the current implementation).

**Current state:** JLP is designed primarily as a trader-vs-LP model, not an insurance fund. LPs are continuously exposed to trader PnL. There's no explicit cooldown because:
- Liquidity providers are "always at risk" from trader positions
- No single large fee events that would be uniquely profitable to JIT
- The pool composition (SOL, ETH, BTC, USDC, USDT) dilutes JIT opportunity

**Note:** JLP does charge an add/remove liquidity fee via dynamic pricing (the oracle-adjusted AUM model), which naturally discourages JIT by making it expensive to enter right before a fee event and exit right after (the fee structure prices in the current pool imbalance).

---

### 2.6 dYdX v4 (Cosmos Chain) — Insurance Fund

**Architecture:** Cosmos SDK module, not EVM. The insurance fund is protocol-owned and not open for public staking in the same way. Losses are covered first by insurance fund, then via socialized loss.

**No direct equivalent** to JIT attack prevention because dYdX v4's insurance fund doesn't accept public deposits — it's funded by protocol revenue (fees) and governance.

---

### 2.7 Additional Protocols (Bonus Research)

**Curve Finance / Convex:** Voting escrow (`veCRV`) — 4-year lockup maximum, linear decay. No JIT concern since the lockup is so long.

**Balancer:** Proportional liquidity. Exit fees. No dedicated insurance fund with public staking.

**MakerDAO Stability Module:** Different model — users get DAI directly, no LP token.

**Perp Protocol v2:** Insurance fund funded by fee revenue only, no public staking. No JIT vector.

---

## 3. Common Mechanism Patterns

### Pattern A: Time-Based Lockup After Deposit (GMX Style)

```
Deposit → record deposit_time → allow withdraw only if now >= deposit_time + LOCKUP
```

**How it works:**
- Each deposit resets the lockup timer for that user
- After the lockup period, withdrawal is unrestricted

**Variants:**
- Per-user: each depositor has independent cooldown (GMX)
- Global: one `last_deposit_slot` for everyone (simpler, but DoS-able)

---

### Pattern B: Two-Step Request + Wait + Claim (Drift Style)

```
Step 1: RequestWithdraw → record request_time, reserve shares
Step 2: (wait COOLDOWN period)
Step 3: ExecuteWithdraw → check now >= request_time + COOLDOWN, transfer funds
```

**During waiting period:**
- Option 1: User continues earning rewards (Aave), stays exposed to slashing
- Option 2: User stops earning rewards (Drift), removed from active fund
- Can cancel request (but Aave makes this costly)

---

### Pattern C: Epoch-Based (Can only withdraw at epoch boundaries)

```
Deposit: accepted any time
Withdraw: only processed at end of epoch (e.g., daily/weekly)
```

**How it works:**
- Requests queue up during the epoch
- At epoch close, all requests processed at same price
- No individual can time the market since execution is deferred

**Used by:** Some MEV protection schemes, Ethereum staking exit queues

---

### Pattern D: Delayed Yield Distribution (Vesting/Streaming)

```
Fee collected at time T → distributed to LP over next N slots (streaming)
New depositors only earn from the streaming start point forward
```

**How it works:**
- When a fee hits the fund, it's not instantly reflected in LP price
- Instead, it's distributed over time (like reward per block)
- JIT depositor only captures the fraction of fees earned during their deposit window

**Used by:** Many ERC-4626 vaults, Compound-style interest models

---

### Pattern E: Snapshot-Based / Non-Fungible Deposit Receipts

```
Deposit → receive receipt with deposit_block metadata
Withdraw → receipt burned, yield calculated only from deposit_block onward
```

**How it works:**
- Instead of fungible LP tokens, use NFT-like receipts with deposit time
- New depositors don't share in "pre-existing" fund balance appreciation
- Attacker would have LP tokens that are literally worth less on mint

**Problem:** Breaks fungibility of LP tokens, significantly more complex

---

### Pattern F: Combination (Most Robust)

Most mature protocols use combinations:
- Drift: Two-step request + 13-day wait + no-rewards-during-cooldown
- Aave: cooldown() initiation + 20-day wait + 2-day claim window
- Synthetix: 7-day unstake cooldown + 1-year reward escrow

---

## 4. Trade-offs Analysis

| Approach | Complexity | UX Impact | JIT Effectiveness | Compute Overhead | Remaining Attacks |
|----------|-----------|-----------|-------------------|-----------------|-------------------|
| **A: Deposit-time lockup (simple)** | Low | Moderate (re-deposit resets clock) | High (with long lockup) | Minimal (one slot read) | Transfer LP to fresh address |
| **B: Two-step request** | Medium | Higher (2 TXs, wait period) | Very High | Low (slot comparison) | None if cooldown > attack window |
| **C: Epoch-based** | High (epoch tracking in slab) | Moderate-High | Very High | Moderate (epoch boundary logic) | None if epochs are long |
| **D: Streaming yield** | Very High (per-slot fee accumulation changes) | Low for users | Medium-High | High (per-TX yield calc) | Rapid multi-deposit/withdraw cycling |
| **E: Non-fungible receipts** | Very High (breaks LP token model) | Very High | Very High | High | None |
| **F: Combination A+B** | Medium-High | Moderate | Highest | Low | None |

### Detailed Analysis

#### A: Deposit-Time Lockup

**Pros:**
- Simple to implement: just store `deposit_slot` in a per-user PDA
- No 2-TX flow for users
- Predictable UX: "your lockup expires at slot X"

**Cons:**
- Every additional deposit resets cooldown (annoying for users who compound)
- LP tokens are transferable → receiver's PDA doesn't have the lockup
  - If Alice deposits → transfers LP to Bob → Bob has no deposit_slot PDA
  - Solution: require all withdrawers to have a PDA, and if no PDA, create one (starts cooldown from now)
- Short lockup (< 1 day) still allows sophisticated attackers who are willing to wait

**Remaining attack after fix:**
- Attacker deposits in advance (N slots before expected event), waits out lockup, extracts around expected event
- But: attacker is exposed to fund risk during entire lockup period — they're now a legitimate staker

#### B: Two-Step Request + Wait

**Pros:**
- Most widely used and battle-tested (Drift, Aave)
- During wait period, user is still fully exposed to fund risk
- Attacker can't know in advance when they'll be able to withdraw (event timing uncertain)
- Clean separation: "stake" vs. "request_unstake" vs. "claim"

**Cons:**
- Two transactions required for every withdrawal
- Users must manage pending requests
- Front-end complexity increases
- Gas/compute overhead (both request and claim need validation)

**For Percolator specifically:**
- Adds Tag 29 instruction (`RequestWithdrawInsuranceLP`)
- Modifies Tag 26 to be the "claim" step
- Requires new PDA account per depositor

#### C: Epoch-Based

**Pros:**
- Completely eliminates timing attacks (everyone withdraws at same price)
- Natural fairness: all requests processed equally

**Cons:**
- Would require tracking epoch boundaries in the slab
- All withdrawals deferred → worse UX
- Slab state changes needed (epoch counter, withdrawal queue)
- Queue has fixed capacity → could fill up

#### D: Streaming Yield

**Pros:**
- Graceful: doesn't block withdrawals at all
- JIT attacker gets proportional yield only (can't capture all of a fee spike)

**Cons:**
- Fundamentally changes how fees flow into the insurance fund
- Would require tracking "pending yield" vs "settled yield" in the engine
- Significant engine state changes
- Compute overhead per transaction

#### E: Non-Fungible Receipts

Skip this — incompatible with Percolator's SPL LP token model and too complex.

---

## 5. Percolator-Specific Constraints

### 5.1 Single Slab Architecture

All engine state lives in **one account** on Solana. The slab layout is:

```
[0..HEADER_LEN]              = SlabHeader (72 bytes)
[HEADER_LEN..HEADER_LEN+CONFIG_LEN] = MarketConfig
[ENGINE_OFF..ENGINE_OFF+ENGINE_LEN] = RiskEngine (16-byte aligned)
```

**Implication:** Adding fields to `InsuranceFund`, `RiskEngine`, or `MarketConfig` changes account size. This requires:
1. A slab migration (or backward-compat size check like `OLD_ENGINE_LEN`)
2. Ensuring existing slabs can still be read with the new code

The existing migration pattern (`OLD_ENGINE_LEN = ENGINE_LEN - 8`) handles ONE previous size. Adding another field requires extending this.

### 5.2 Fixed Account Slots

The engine's `accounts` array has fixed slots (64/256/1024/4096). These are for **trading positions**, not insurance LP depositors. Insurance LP depositors are **external** to these slots.

### 5.3 SPL LP Mint

The insurance LP tokens are a standard SPL mint, PDA-derived:
```rust
fn derive_insurance_lp_mint(program_id: &Pubkey, slab_key: &Pubkey) -> (Pubkey, u8)
```

These tokens are **fungible and transferable**. Any cooldown mechanism must handle the case where someone receives LP tokens via transfer rather than direct deposit.

### 5.4 Available State Fields

**`InsuranceFund` struct (Toly's reference):**
```rust
pub struct InsuranceFund {
    pub balance: U128,       // 16 bytes
    pub fee_revenue: U128,   // 16 bytes
}  // 32 bytes total
```

**`engine.current_slot: u64`** is already tracked — this is our slot clock, updated on every instruction. We can use this for slot-based cooldowns without needing a real-time clock.

**`engine.params.risk_reduction_threshold: U128`** — already enforces a minimum balance floor.

### 5.5 Existing Instructions

- Tag 24: `CreateInsuranceMint`
- Tag 25: `DepositInsuranceLP { amount: u64 }`
- Tag 26: `WithdrawInsuranceLP { lp_amount: u64 }`
- Tag 27: `PauseMarket`
- Tag 28: `UnpauseMarket`

Tags 29+ are available for new instructions.

### 5.6 `engine.current_slot` vs. Real Clock

Percolator uses **slots** (not Unix timestamps) for all time-based logic. This is correct and appropriate for Solana:
- Slot timing is governed by the validator (not adversarially controllable)
- Solana target: ~400ms per slot (actual: 400-500ms)
- Safer than block timestamps on EVM

Key slot math:
```
1 hour  ≈  7,200 - 9,000 slots
1 day   ≈ 172,800 - 216,000 slots (using 200,000 as a round number)
7 days  ≈ 1,200,000 - 1,512,000 slots
13 days ≈ 2,246,400 slots
```

---

## 6. Current Percolator Implementation (Code Audit)

### 6.1 DepositInsuranceLP (Tag 25) — Current Behavior

From `/Users/khubair/.openclaw/workspace/percolator-launch/program/src/percolator.rs`:

```rust
Instruction::DepositInsuranceLP { amount } => {
    // 8 accounts: depositor, slab, depositor_ata, vault, 
    //             token_program, ins_lp_mint, depositor_lp_ata, vault_authority

    // Blocks: resolved market, zero amount
    // Reads: insurance_balance_before, lp_supply
    // Mints: proportional LP tokens
    // engine.top_up_insurance_fund(units as u128) — increases balance

    // NO COOLDOWN TRACKING CURRENTLY
}
```

### 6.2 WithdrawInsuranceLP (Tag 26) — Current Behavior

```rust
Instruction::WithdrawInsuranceLP { lp_amount } => {
    // 8 accounts: withdrawer, slab, withdrawer_ata, vault,
    //             token_program, ins_lp_mint, withdrawer_lp_ata, vault_authority

    // Calculates: units_to_return = lp_amount * insurance_balance / lp_supply
    // Safety check: cannot drain below risk_reduction_threshold
    // Burns LP tokens
    // Transfers collateral from vault to withdrawer

    // NO COOLDOWN CHECK CURRENTLY
    // JIT ATTACK POSSIBLE: deposit at T, withdraw at T+1
}
```

### 6.3 Key Finding: No Per-User State Tracking

There is **no per-depositor PDA** or any mechanism to track individual deposit timing. The current implementation:
- Has no `InsuranceLPStake` account type
- Has no `deposit_slot`, `cooldown_start`, or `request_withdraw_slot` fields
- Relies solely on `risk_reduction_threshold` as a safety floor (not JIT protection)

### 6.4 Toly Reference Implementation

Toly's version at `/mnt/volume-hel1-1/toly-percolator/src/percolator.rs` has no insurance LP handlers (`DepositInsuranceLP`, `WithdrawInsuranceLP` are absent). The engine-level `InsuranceFund` struct only has:

```rust
pub struct InsuranceFund {
    pub balance: U128,
    pub fee_revenue: U128,
}
```

This confirms that the LP staking feature was added in our fork. The PR to upstream will need to introduce both the LP handlers AND the lockup mechanism together.

---

## 7. Proposed Approach for Percolator

### Recommendation: Pattern A (Deposit-Time Lockup) via Per-Depositor PDA

**Why this approach:**
1. **No slab layout change** — zero risk of breaking existing slabs
2. **Single transaction withdrawal** — better UX than two-step
3. **Battle-tested concept** — similar to GMX's `lastAddedAt` model
4. **Solana-native** — uses slot-based timing, not Unix timestamps
5. **Minimal compute overhead** — just one slot comparison
6. **Works correctly with LP token transfers** — via `InitInsuranceLPStake` instruction

**Why NOT two-step (Drift-style):**
- Adds significant UX complexity (2 TXs per withdraw)
- Percolator is early stage — simpler is better for initial adoption
- The deposit-time lockup with a 7-day window is sufficient to eliminate JIT attacks
- Can always upgrade to two-step later

**Why NOT streaming yield:**
- Would require significant changes to the fee accounting model
- Changes the `InsuranceFund` struct (slab migration)
- Much harder to get right, more attack surface

### Recommended Parameters

```
INS_LP_COOLDOWN_SLOTS = 432_000  // ~2 days at 400ms/slot (configurable via admin PDA)
```

At ~400ms/slot, 432,000 slots ≈ 2 days. This is:
- Long enough to eliminate JIT attacks completely
- Short enough to not deter legitimate stakers
- Roughly half of Drift's 13-day period
- A good starting point, admin-configurable

**Alternative:** Start with 200,000 slots (~1 day) if faster iteration is needed, increase once the fund has TVL.

### Why 7 Days Is Right for Percolator

- **JIT window is tiny**: Liquidation events are typically observable only a few slots in advance (when margin ratio drops to maintenance level). 432,000 slots >> any foreseeable prediction window.
- **Risk exposure**: During 2 days, an attacker is fully exposed to the fund's insolvency risk (bad debt events, oracle failures). The risk/reward doesn't favor JIT.
- **Liquidity provision is commitment**: Real LPs want to earn ongoing yield, not flash-stake.

---

## 8. Implementation Plan

### 8.1 New Account Type: `InsuranceLPStake`

PDA seeds: `[b"ins_lp_stake", slab_key.as_ref(), depositor.as_ref()]`

```rust
/// Per-depositor insurance LP stake record.
/// PDA: [b"ins_lp_stake", slab_key, depositor_pubkey]
/// Size: 64 bytes (one Solana rent-exempt account)
#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
pub struct InsuranceLPStake {
    /// The depositor's public key (for validation)
    pub depositor: [u8; 32],        // 32 bytes

    /// Slot of most recent deposit or stake registration.
    /// Withdrawal is blocked until: current_slot >= deposit_slot + cooldown_slots
    pub deposit_slot: u64,          //  8 bytes

    /// PDA bump seed
    pub bump: u8,                   //  1 byte

    /// Reserved for future use (e.g., request_withdraw_slot, request_withdraw_lp)
    pub _reserved: [u8; 7],         //  7 bytes

    // Subtotal: 48 bytes — room for 16 more bytes if needed
    // (e.g., for upgrading to two-step later: add request_slot u64 + request_amount u64)
}  // Total: 48 bytes, padded to 64 for clean allocation
```

### 8.2 New Constant

```rust
// In mod constants:
/// Default cooldown in slots: ~2 days at 400ms/slot (admin-configurable)
/// Configurable via SetInsuranceLPCooldown instruction (admin-only)
pub const INS_LP_COOLDOWN_SLOTS_DEFAULT: u64 = 432_000;
```

**Cooldown storage options (pick one):**

**Option 1: Hardcoded constant** (simplest, no migration)
```rust
pub const INS_LP_COOLDOWN_SLOTS: u64 = 432_000;  // ~2 days default
```

**Option 2: Stored in SlabHeader `_reserved` bytes** (configurable, no engine migration)

The `SlabHeader._reserved` field currently uses only 24 bytes ([0..8]=nonce, [8..16]=last_thr_slot, [16..24]=dust_base). If we add 8 more bytes to `_reserved`, we need to expand `SlabHeader`. But changing `SlabHeader` shifts `ENGINE_OFF`...

Actually, `_reserved` is 24 bytes total — it's already at its declared size. We'd need to increase it to 32 bytes, which shifts `CONFIG_OFF` by 8 bytes, which shifts `ENGINE_OFF` — breaking migration.

**Option 3: Store in per-slab config PDA** (separate account, no slab change)
```
PDA seeds: [b"ins_lp_config", slab_key]
Fields: { cooldown_slots: u64, admin: Pubkey }
```
But this adds another account to every deposit/withdraw instruction.

**Recommendation: Option 1 (hardcoded constant)**. Start simple. If admin-configurability is needed later, use Option 3 (separate config PDA). Never change the slab layout for this feature alone.

### 8.3 New Instruction: `InitInsuranceLPStake` (Tag 29)

For users who received LP tokens via transfer (not direct deposit). Creates their stake account and starts the cooldown from now.

```rust
// Accounts: [user(signer, payer), slab(readonly), ins_lp_stake_pda(writable), system_program]
Instruction::InitInsuranceLPStake => {
    // Derives: PDA = [b"ins_lp_stake", slab_key, user_key]
    // Creates: InsuranceLPStake account if it doesn't exist
    // Sets: deposit_slot = current_slot (starts cooldown)
    // Error if already exists (user should call DepositInsuranceLP instead)
}
```

This covers the LP token transfer case: Bob receives LP tokens from Alice → calls `InitInsuranceLPStake` → waits 7 days → withdraws.

### 8.4 Modified: `DepositInsuranceLP` (Tag 25)

Add `ins_lp_stake_pda` (writable) to accounts list (now 9 accounts):

```rust
Instruction::DepositInsuranceLP { amount } => {
    // ... existing validation ...

    // New: Create or update InsuranceLPStake PDA
    let (stake_pda, stake_bump) = derive_insurance_lp_stake(program_id, a_slab.key, a_depositor.key);
    accounts::expect_key(a_ins_lp_stake, &stake_pda)?;

    // If PDA doesn't exist, create it (allocate 64 bytes, transfer rent)
    if a_ins_lp_stake.data_len() == 0 {
        create_insurance_lp_stake_account(
            a_ins_lp_stake, a_depositor, a_slab.key, a_depositor.key, stake_bump
        )?;
    }

    // Update deposit_slot = clock.slot (reset cooldown on every deposit)
    let stake = load_insurance_lp_stake_mut(a_ins_lp_stake)?;
    stake.deposit_slot = clock.slot;
    stake.depositor = a_depositor.key.to_bytes();

    // ... rest of existing logic (transfer, mint LP tokens) ...
}
```

**Account list (9 accounts):**
```
0: depositor (signer)
1: slab (writable)
2: depositor_ata (writable)
3: vault (writable)
4: token_program
5: ins_lp_mint (writable)
6: depositor_lp_ata (writable)
7: vault_authority
8: ins_lp_stake_pda (writable)  ← NEW
9: system_program                ← NEW (for PDA creation)
```

### 8.5 Modified: `WithdrawInsuranceLP` (Tag 26)

Add `ins_lp_stake_pda` (readonly) to accounts list (now 9 accounts):

```rust
Instruction::WithdrawInsuranceLP { lp_amount } => {
    // ... existing validation ...

    // New: Load and validate cooldown
    let (stake_pda, _) = derive_insurance_lp_stake(program_id, a_slab.key, a_withdrawer.key);
    accounts::expect_key(a_ins_lp_stake, &stake_pda)?;

    if a_ins_lp_stake.data_len() == 0 {
        // No stake account → user has never deposited directly
        // They might hold LP tokens from a transfer, but haven't registered
        return Err(PercolatorError::InsuranceLPNoStakeAccount.into());
    }

    let stake = load_insurance_lp_stake(a_ins_lp_stake)?;

    // Cooldown check
    let slots_since_deposit = clock.slot.saturating_sub(stake.deposit_slot);
    // Read cooldown from config PDA if it exists, otherwise use default
    let cooldown = config_pda.map(|c| c.cooldown_slots).unwrap_or(INS_LP_COOLDOWN_SLOTS_DEFAULT);
    if slots_since_deposit < cooldown {
        return Err(PercolatorError::InsuranceLPCooldownNotMet.into());
    }

    // ... rest of existing logic (calculate units, burn LP tokens, transfer collateral) ...
}
```

### 8.6 PDA Derivation Helper

```rust
// In mod accounts:
pub fn derive_insurance_lp_stake(
    program_id: &Pubkey,
    slab_key: &Pubkey,
    depositor: &Pubkey,
) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[b"ins_lp_stake", slab_key.as_ref(), depositor.as_ref()],
        program_id,
    )
}
```

### 8.7 New Error Codes

```rust
pub enum PercolatorError {
    // ... existing errors ...
    InsuranceLPNoStakeAccount,      // No stake PDA found — must deposit first or call InitInsuranceLPStake
    InsuranceLPCooldownNotMet,      // Cooldown not elapsed — deposit_slot + cooldown > current_slot
    InsuranceLPStakeAlreadyExists,  // Tried to InitInsuranceLPStake when already exists
}
```

---

## 9. Slab Layout Impact & Migration Analysis

### 9.1 Proposed Changes

| Change | Type | Impact on Slab |
|--------|------|----------------|
| New `InsuranceLPStake` PDA account | New account type (64 bytes) | **NONE** — separate account, not in slab |
| New `INS_LP_COOLDOWN_SLOTS` constant | Constant | **NONE** |
| Modified account list for Tag 25/26 | Instruction change | **NONE** — only adds new required accounts |
| New Tag 29 instruction | New instruction | **NONE** |

### 9.2 Zero Slab Layout Changes

The proposed approach makes **no changes** to:
- `SlabHeader` (no new fields)
- `MarketConfig` (no new fields)
- `InsuranceFund` struct (no new fields)
- `RiskEngine` struct (no new fields)

This means:
- **No migration required**
- **Fully backward-compatible** at the slab level
- Old code reading existing slabs works unchanged
- New code can read old slabs without modification

### 9.3 Account Size Changes

The `InsuranceLPStake` PDA is a **new independent account type**. It costs:
- 64 bytes of account space
- ~0.00089 SOL rent-exempt per depositor (64 bytes × rent rate)
- The depositor pays this at first deposit (their transaction includes system_program for account creation)
- Can be reclaimed (closed) if user fully exits and burns all LP tokens

### 9.4 Compute Budget Impact

Additional compute per deposit:
1. PDA derivation: ~1,000-2,000 CU
2. Account creation (system_program CPI): ~3,000-5,000 CU (first deposit only)
3. Slot write to PDA: ~500 CU
**Total: ~2,000-8,000 CU per deposit** (negligible; base transaction is ~200k CU budget)

Additional compute per withdrawal:
1. PDA derivation: ~1,000-2,000 CU
2. Slot comparison: ~100 CU
**Total: ~1,100-2,100 CU per withdrawal** (negligible)

### 9.5 Backward Compatibility of Tag 25/26

**Breaking change:** Tag 25 and Tag 26 will now require additional accounts (ins_lp_stake_pda, system_program). Old clients sending 8 accounts will fail with `AccountNotEnough` or similar.

**Mitigation:**
- This is appropriate since the feature is being added before significant TVL
- SDKs and clients must update before calling these instructions
- Can version-gate: if `accounts.len() == 8` (old client), return a helpful error instead of silently accepting
- Or use an optional 9th account pattern (check length, only apply cooldown if PDA account provided)

**Recommended transition:** Gate the cooldown enforcement on whether `accounts.len() >= 9`. If 8 accounts (old style), still process but don't create stake PDA (grace period). After N epochs, require the PDA.

---

## 10. Comparison: Solana Perp DEXs Specifically

### Drift Protocol

| Aspect | Detail |
|--------|--------|
| **Mechanism** | Two-step: RequestUnstake → wait → ExecuteUnstake |
| **Cooldown** | 13 days (per-market `unstaking_period: i64`) |
| **State** | Separate `InsuranceFundStake` PDA per user per market (136 bytes) |
| **During cooldown** | Shares stop earning rewards; still subject to slashing |
| **LP token type** | NOT SPL tokens — internal shares with custom accounting |
| **Cancelable?** | Yes — cancelling restarts cooldown (penalizes cancel with share loss) |
| **Clock type** | Unix timestamp (i64), NOT slots |
| **DoS-able?** | No — per-user, no global state |
| **Transferable stake?** | No — locked to `authority` pubkey |

**Key difference from Percolator approach:** Drift's stake is NOT transferable (not an SPL token). This eliminates the "transfer LP to fresh address" attack vector entirely. Percolator's LP tokens ARE transferable SPL tokens, requiring the `InitInsuranceLPStake` escape hatch.

### Jupiter Perps (JLP)

| Aspect | Detail |
|--------|--------|
| **Mechanism** | No explicit cooldown (no insurance fund, LP model is continuous P&L) |
| **Cooldown** | N/A |
| **LP token type** | SPL token (JLP) — fully transferable |
| **JIT protection** | Pool pricing (add/remove fees) + continuous P&L exposure |
| **Clock type** | N/A |

**Key difference:** JLP is not an insurance fund — LPs are directly exposed to trader P&L at all times. The JIT attack surface doesn't exist because you can't "wait for a fee event" — you're always exposed to both profits and losses from all positions.

### Zeta Markets

| Aspect | Detail |
|--------|--------|
| **Mechanism** | Protocol-owned insurance fund (no public LP staking) |
| **Cooldown** | N/A (no public staking) |
| **JIT protection** | Not applicable |
| **Source** | Funded from trading fees and liquidation incentive share |

**Key difference:** Zeta's insurance fund doesn't accept public deposits — it's seeded and maintained by the protocol. This sidesteps the JIT problem entirely, but also means the fund is less capitalized.

### Summary Comparison Table

| Protocol | Chain | Cooldown | Type | Per-User? | LP Transferable? |
|----------|-------|----------|------|-----------|------------------|
| **Drift** | Solana | 13 days | Two-step request | Yes (PDA) | No (internal shares) |
| **Jupiter Perps** | Solana | None needed | N/A | N/A | Yes (SPL) |
| **Zeta** | Solana | N/A | Protocol-owned | N/A | N/A |
| **GMX V1** | EVM | 15 minutes | Deposit-time | Yes (mapping) | Yes (ERC-20) |
| **Aave** | EVM | 20 days | Two-step request | Yes (mapping) | No (stkAAVE) |
| **Synthetix** | EVM | 7 days + 1yr reward escrow | Deposit-time | Yes (mapping) | Yes (ERC-20) |
| **Percolator (proposed)** | Solana | 2 days (configurable) | Deposit-time | Yes (new PDA) | Yes (SPL) |

---

## 11. Final Implementation Recommendation Summary

### What to Build

**Phase 1 (Minimal, ship now):**

1. New account type: `InsuranceLPStake` (64 bytes, PDA per depositor per slab)
2. Modified `DepositInsuranceLP` (Tag 25): creates/updates stake PDA, records `deposit_slot`
3. Modified `WithdrawInsuranceLP` (Tag 26): requires stake PDA, checks `deposit_slot + cooldown`
4. New `InitInsuranceLPStake` (Tag 29): for LP token recipients who need to register
5. Default: `INS_LP_COOLDOWN_SLOTS_DEFAULT = 432_000` (~2 days), admin-configurable via config PDA
6. New errors: `InsuranceLPNoStakeAccount`, `InsuranceLPCooldownNotMet`

**Phase 2 (Later, if needed):**

1. **Admin-configurable cooldown (CHOSEN)**: config PDA `[b"ins_lp_config", slab_key]` — default 432,000 slots (~2 days), adjustable without redeploy
2. OR: upgrade to two-step (add `RequestWithdrawInsuranceLP` Tag 30) for higher security
3. Close `InsuranceLPStake` when user burns all LP tokens (rent reclaim)

### What NOT to Change

- Slab layout (no changes to `InsuranceFund`, `RiskEngine`, `MarketConfig`, `SlabHeader`)
- LP token mint type (keep as standard SPL)
- LP token math (the pro-rata calculation is correct and doesn't need changes)
- `risk_reduction_threshold` behavior (keep as-is; complementary protection)

### Effectiveness

With a 2-day cooldown (admin-configurable):
- **JIT attack window**: ~1-10 slots (attacker can predict liquidation)
- **Required commitment**: 432,000 slots minimum (~2 days)
- **Attack ROI**: Zero — attacker is exposed to 2 days of fund risk for marginal extra yield
- **Legitimate staker impact**: Minimal — 2-day lockup is lighter than industry standard (Drift=13d, Aave=20d)
- **Configurable**: Admin can adjust via config PDA without redeploying the program

### PR Implications for Toly's Upstream

Since Toly's repo doesn't have insurance LP at all, the PR will be:
1. Add `DepositInsuranceLP` and `WithdrawInsuranceLP` handlers (Tags 25/26)
2. WITH the cooldown mechanism built in from day one
3. No one needs to "migrate" — the first version has the protection

This is the cleanest way to upstream: don't introduce the vulnerability and then fix it. Ship it correctly from the start.

---

## Appendix A: Slot Math Reference

```
Solana target: 400ms per slot (actual may vary 400-500ms)

Using 400ms/slot:
  1 minute  =    150 slots
  1 hour    =  9,000 slots
  1 day     = 216,000 slots
  2 days    = 432,000 slots    ← recommended default (configurable)
  7 days    = 1,512,000 slots
  13 days   = 2,808,000 slots  (Drift equivalent)
  20 days   = 4,320,000 slots  (Aave equivalent)

Using 500ms/slot (conservative estimate):
  7 days    = 1,209,600 slots
  → INS_LP_COOLDOWN_SLOTS = 1,400,000 covers 7 days at both 400ms and 500ms slots
```

## Appendix B: GMX GlpManager Cooldown (Reference Code)

```solidity
// From gmx-contracts/contracts/core/GlpManager.sol
mapping (address => uint256) public lastAddedAt;
uint256 public cooldownDuration; // = 15 minutes

function _addLiquidity(address _fundingAccount, address _account, ...) private returns (uint256) {
    // ... mint GLP ...
    lastAddedAt[_account] = block.timestamp;  // set on deposit
    // ...
}

function _removeLiquidity(address _account, ...) private returns (uint256) {
    require(
        lastAddedAt[_account].add(cooldownDuration) <= block.timestamp,
        "GlpManager: cooldown duration not yet passed"
    );
    // ... burn GLP, return tokens ...
}
```

## Appendix C: Drift Insurance Fund Cooldown (Reference Code)

```rust
// From drift-labs/protocol-v2/programs/drift/src/controller/insurance.rs
pub fn request_remove_insurance_fund_stake(
    n_shares: u128,
    insurance_vault_amount: u64,
    insurance_fund_stake: &mut InsuranceFundStake,
    spot_market: &mut SpotMarket,
    now: i64,  // Unix timestamp
) -> DriftResult {
    insurance_fund_stake.last_withdraw_request_shares = n_shares;
    insurance_fund_stake.last_withdraw_request_value = if_shares_to_vault_amount(
        n_shares,
        spot_market.insurance_fund.total_shares,
        insurance_vault_amount,
    )?.min(insurance_vault_amount.saturating_sub(1));
    insurance_fund_stake.last_withdraw_request_ts = now;  // record request time
    Ok(())
}

pub fn remove_insurance_fund_stake(
    insurance_vault_amount: u64,
    insurance_fund_stake: &mut InsuranceFundStake,
    spot_market: &mut SpotMarket,
    now: i64,
) -> DriftResult<u64> {
    let time_since_withdraw_request =
        now.safe_sub(insurance_fund_stake.last_withdraw_request_ts)?;
    
    validate!(
        time_since_withdraw_request >= spot_market.insurance_fund.unstaking_period,
        // unstaking_period = THIRTEEN_DAY = 13 * 24 * 3600 = 1,123,200 seconds
        ErrorCode::TryingToRemoveLiquidityTooFast
    )?;
    
    // ... execute withdrawal ...
}
```

## Appendix D: Percolator Proposed Cooldown Check (Pseudocode)

```rust
// In WithdrawInsuranceLP handler:

// Load stake PDA
let stake_pda = derive_insurance_lp_stake(program_id, slab_key, withdrawer_key);
let stake_data = a_ins_lp_stake.data.borrow();
let stake: &InsuranceLPStake = bytemuck::from_bytes(&stake_data[..size_of::<InsuranceLPStake>()]);

// Get current slot from slab engine (already tracked)
let current_slot = engine.current_slot;

// Check cooldown
if current_slot < stake.deposit_slot.saturating_add(INS_LP_COOLDOWN_SLOTS) {
    let slots_remaining = stake.deposit_slot
        .saturating_add(INS_LP_COOLDOWN_SLOTS)
        .saturating_sub(current_slot);
    msg!(
        "InsuranceLP cooldown not met. {} slots remaining (~{} days)",
        slots_remaining,
        slots_remaining / 216_000
    );
    return Err(PercolatorError::InsuranceLPCooldownNotMet.into());
}

// ... proceed with withdrawal ...
```

---

*Research compiled February 17, 2026. Sources: Drift Protocol v2 (GitHub), GMX contracts (GitHub), Aave documentation, Synthetix documentation, Jupiter Perps documentation, Zeta Markets documentation, Percolator source code (local + Toly reference).*
