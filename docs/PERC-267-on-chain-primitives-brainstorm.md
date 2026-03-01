# PERC-267: On-Chain Primitives Percolator Could Invent

**Author:** coder  
**Date:** 2026-02-27  
**Status:** Technical brainstorm  
**Scope:** Novel on-chain primitives no perp DEX has shipped, leveraging Percolator's unique architecture (formally verified risk engine, CPI-friendly matcher, haircut-based solvency model, 225+ Kani proofs)

---

## Context: What We Already Have

| Component | Key Property |
|-----------|-------------|
| `percolator` (core) | `no_std` pure-Rust risk engine, `canonical_inv` invariant verified by 225 Kani proofs |
| `percolator-prog` | BPF wrapper with 3 slab tiers (256/1024/4096 accounts), 36 instruction tags |
| `percolator-matcher` | Reference vAMM matcher, invoked via CPI from `TradeCpi` / `TradeCpiV2` |
| `percolator-stake` | Insurance LP staking — SPL claim tokens for insurance fund deposits |
| Keeper / Crank | KeeperCrank instruction for funding, liquidation, settlement — already composable |
| Hyperp Mode | Markets with custom mark prices (no external oracle) — memecoin-native |

The question: **What can we build _on top of_ this that turns Percolator from "a perp DEX" into "the infrastructure layer other protocols build on"?**

---

## Idea 1: CPI Risk Oracle — Let Other Programs Read Our State

**What:** A new read-only CPI entrypoint (or documented account parsing ABI) that lets any Solana program query:
- Current open interest (long/short) for a market
- Funding rate
- Mark price and oracle price
- Insurance fund health (balance / required)
- A specific user's margin ratio, unrealized PnL, position size

**Why novel:** No on-chain perp DEX exposes its risk state as a composable primitive. Drift, Jupiter Perps, Zeta — all require off-chain indexing to read this data. An on-chain CPI makes Percolator state a first-class input for other protocols.

**Use cases:**
- Lending protocols adjust LTV based on real-time perp OI (systemic risk signal)
- Options protocols hedge by querying perp mark price + funding
- DAO treasuries build automated hedging strategies that CPI into our risk oracle before executing

**Feasibility:** **Easy** — Account layouts are already fixed and documented. Publishing a crate with zero-copy deserialization helpers (`bytemuck`-style) is ~1 week. A CPI entrypoint that returns a struct is more work but cleaner. The formal verification story means consumers can _trust_ the data — `canonical_inv` guarantees accounting consistency.

---

## Idea 2: Atomic Flash Positions

**What:** A new instruction pair — `OpenFlashPosition` / `CloseFlashPosition` — that must both execute within the same transaction. The position is opened with zero upfront collateral, the user does _something_ with the synthetic exposure (e.g., arbitrage another market), and closes it before the transaction ends. If the flash position isn't closed, the transaction reverts.

This is the perp equivalent of Aave's flash loans — but for _leveraged exposure_, not capital.

**Mechanics:**
1. `OpenFlashPosition` creates a temporary position entry with a "flash" flag
2. Intermediate instructions can CPI into other programs (arbitrage, rebalance, etc.)
3. `CloseFlashPosition` verifies the position is flat and settles any realized PnL
4. If the flash flag is still set at the end of the instruction sequence → revert
5. `canonical_inv` is checked on close, never on open (the open deliberately violates margin requirements)

**Why novel:** No perp DEX has flash positions. Flash loans exist (Solend, MarginFi) but flash _leveraged exposure_ is new. This enables atomic cross-market arbitrage, delta-neutral strategy construction, and composable leverage without capital lockup.

**Feasibility:** **Hard** — Requires careful Solana CPI design (the "must close in same tx" constraint needs a transaction-scoped flag, possibly using a PDA that's created and then closed). The formal verification angle is interesting: we can Kani-prove that `canonical_inv` holds after `CloseFlashPosition` even though it's violated during the flash window.

---

## Idea 3: On-Chain TWAP Orders

**What:** A new account type (`TwapOrder` PDA) that stores a large order to be executed in fixed-size slices over N keeper crank cycles. The keeper, during its normal crank, checks for active TWAP orders and executes the next slice.

**Design:**
```
Seeds: ["twap", slab_pubkey, user_pubkey, order_nonce]
Fields:
  total_size: i64          // signed: positive = long, negative = short
  executed_size: i64       // how much has been filled
  slices_remaining: u32    // how many crank cycles left
  size_per_slice: i64      // total_size / num_slices
  max_price_deviation_bps: u16  // abort if mark drifts too far from entry
  created_slot: u64
```

The keeper crank already iterates accounts — adding TWAP execution is a natural extension. Each slice goes through the normal `TradeCpi` path, so all risk checks apply.

**Why novel:** TWAP exists in TradFi but has never been implemented fully on-chain on any DEX (Solana or otherwise). Off-chain TWAP (via bots) exists but isn't trustless — our version is permissionless and verifiable.

**Feasibility:** **Medium** — The PDA design is straightforward. Main challenge: fitting TWAP slice execution into the crank's compute budget. Each slice is a full CPI trade (~50k CU). If the crank already uses 150k CU, adding a TWAP slice per crank is tight but doable within Solana's 1.4M CU limit per tx. Worst case: dedicated TWAP crank instruction.

---

## Idea 4: Programmable Liquidation Auctions (Dutch Auction Liquidations)

**What:** Instead of the current "keeper liquidates at oracle price + fee" model, implement a Dutch auction where the liquidation reward _decreases_ over time (measured in slots since the account became liquidatable).

**Mechanics:**
- Slot 0 (just became liquidatable): liquidation reward = max (e.g., 5%)
- Slot +10: reward = 3%
- Slot +50: reward = 1%
- Slot +100: reward = 0.5% (minimum floor)

The first keeper to call `LiquidateAtOracle` gets the current reward. This creates _competition_ among keepers, which benefits the liquidated user (they lose less to fees). It also creates a natural priority fee market — keepers bid via Solana priority fees to get the higher-reward early liquidations.

**Why novel:** Every Solana perp DEX uses fixed liquidation fees. Dutch auction liquidations exist in some DeFi lending (Maker) but have never been applied to perp liquidations on-chain. Combined with our formal verification, we can prove the auction never reaches an insolvent state.

**Feasibility:** **Easy** — The liquidation fee is already a parameter (`liquidationFeeBps`). Making it a function of `(current_slot - liquidatable_since_slot)` is a ~50-line change in the risk engine. The `canonical_inv` proof needs updating but the existing harness structure supports this. `liquidatable_since_slot` requires a new field in the account struct (8 bytes).

---

## Idea 5: On-Chain Referral Trees with Automatic Fee Splitting

**What:** A program-level referral system where:
1. A `ReferralNode` PDA stores: `referrer_pubkey`, `fee_share_bps`, `parent_referral (optional)`
2. When a user creates an account (`InitUser`), they optionally pass a referral PDA
3. On every trade, the trading fee is automatically split: X% to insurance, Y% to referrer, Z% to parent referrer
4. Fee distribution happens _inside the trade instruction_ — no off-chain settlement needed

**Multi-tier design:**
```
Protocol ← 70% of fee
  └── Tier 1 Referrer ← 20% of fee
        └── Tier 2 Referrer ← 10% of fee
```

**Why novel:** Drift has referral codes but they're off-chain (just tracking, manual payouts). Jupiter Perps has no native referral. An _on-chain_ multi-tier referral tree with automatic splitting is new. It means any protocol that integrates Percolator via CPI automatically earns fees — no business development needed, no trust needed.

**Feasibility:** **Medium** — Requires adding a `referral_node` optional account to trade instructions. The fee splitting logic is simple arithmetic but adds accounts to the instruction (Solana's 64-account limit per tx). Keeping it to 2 tiers keeps account count manageable. The referral PDA creation is a new instruction (~1 day). Fee splitting in trade is ~2 days.

---

## Idea 6: Verified Margin Vaults (Structured Products Primitive)

**What:** A new account type — `MarginVault` — that aggregates deposits from multiple users and trades as a single entity on Percolator markets. The vault has _programmatically enforced_ risk limits that are verified by `canonical_inv`.

**Design:**
```
MarginVault PDA:
  manager: Pubkey          // vault manager (can submit trades)
  max_leverage: u64        // hard cap, enforced on-chain
  max_drawdown_bps: u16    // auto-closes if vault value drops by X%
  depositors: [VaultShare] // proportional ownership
  total_deposits: u64
  total_value: u64         // deposits + unrealized PnL
```

The vault manager can submit trades via CPI, but the program _rejects_ any trade that would exceed `max_leverage` or violate the vault's risk parameters. This is enforced at the instruction level, not by social contract.

**Why novel:** Existing "vault" products (e.g., Hyperliquid vaults) enforce limits off-chain. Our formal verification means we can _prove_ the vault's risk limits are never exceeded. This enables regulatory-grade structured products on-chain — a vault that provably can't exceed 3x leverage is a fundamentally different product from one that _promises_ not to.

**Feasibility:** **Hard** — New account type, new instructions (CreateVault, DepositToVault, VaultTrade, WithdrawFromVault). Significant design work around share accounting and PnL attribution. However, the core risk engine already handles multi-account margin — extending it to vault-level constraints is architecturally clean. Estimated 3-4 weeks.

---

## Idea 7: Cross-Program Conditional Orders (Intent-Based Trading)

**What:** Users submit _intents_ — on-chain PDAs that describe desired trades with conditions:

```
Intent PDA:
  user: Pubkey
  market: Pubkey (slab)
  direction: Long/Short
  size: i64
  conditions: [Condition]
  expiry_slot: u64
  
Condition (enum):
  PriceAbove { feed_id: [u8;32], threshold_e6: u64 }
  PriceBelow { feed_id: [u8;32], threshold_e6: u64 }
  FundingNegative { market: Pubkey }
  OIBelow { market: Pubkey, threshold: u64 }
  CustomCpi { program_id: Pubkey, discriminator: [u8;8] }
```

**Solvers** (anyone) monitor intents and execute them when conditions are met, earning a small fee. The program verifies all conditions are satisfied before executing the trade.

The `CustomCpi` condition is the key innovation — it lets a user say "execute this trade if _any arbitrary on-chain condition_ is true," checked via CPI at execution time.

**Why novel:** Intent-based systems exist in spot DEXes (CoW Protocol, UniswapX) but have never been applied to perp trading. The conditional CPI design is entirely new — it turns Percolator into a programmable trading engine where conditions can reference _any_ on-chain state.

**Feasibility:** **Hard** — The intent PDA and solver loop is medium complexity. The `CustomCpi` condition verification is the hard part (CPI compute costs, security — malicious programs could brick execution). Needs careful sandboxing. Estimated 4-5 weeks for a safe MVP (without CustomCpi), add 2-3 weeks for CustomCpi.

---

## Idea 8: Insurance Fund Tranching (Senior / Junior LP)

**What:** Split the insurance fund into two tranches:
- **Senior tranche:** First claim on insurance fund. Lower yield, lower risk. Gets paid out first if the fund is drawn down.
- **Junior tranche:** Absorbs losses first. Higher yield (gets a larger share of fees). Only gets paid after senior is whole.

Each tranche has its own SPL claim token (extending the existing Insurance LP mint system).

**Mechanics:**
```
Senior LP token: ["ins_lp_sr", slab_pubkey]
Junior LP token: ["ins_lp_jr", slab_pubkey]

Fee distribution:
  - Junior gets 60% of insurance fees (higher yield)
  - Senior gets 40% of insurance fees (lower yield)

Loss waterfall:
  1. Junior absorbs first (up to 100% of junior tranche)
  2. Senior absorbs only after junior is wiped out
```

**Why novel:** Tranched insurance exists in TradFi (CDOs, tranched credit) but has never been on-chain in perps. This unlocks risk-segmented yield — conservative LPs can take senior (stablecoin-like yield), aggressive LPs take junior (higher APY). The formal verification story means we can prove the waterfall always respects tranche priority.

**Feasibility:** **Medium** — We already have the Insurance LP infrastructure (CreateInsuranceMint, DepositInsuranceLP, WithdrawInsuranceLP). Extending to two mints and adding waterfall logic to the withdrawal and loss absorption paths is architecturally clean. ~2-3 weeks. The Kani proofs for insurance conservation need extension.

---

## Idea 9: Position Streaming (Perp DCA)

**What:** A `PositionStream` PDA that gradually builds a position over time — the perp equivalent of DCA (Dollar Cost Averaging).

```
PositionStream PDA:
  user: Pubkey
  market: Pubkey
  direction: Long/Short
  total_target_size: i64
  size_per_epoch: i64      // how much to add per keeper crank epoch
  epochs_remaining: u32
  max_mark_price_e6: u64   // ceiling (for longs) / floor (for shorts)
  collateral_reserved: u64 // locked collateral for remaining epochs
```

**Key difference from TWAP:** TWAP executes a _single order_ in slices. Position Streaming is a _recurring_ instruction that builds exposure over hours/days/weeks. TWAP = "sell 100 SOL over 1 hour." Streaming = "build a 100 SOL long over 7 days, $14.28/day."

**Why novel:** DCA exists for spot (Jupiter DCA) but not for perps. The on-chain collateral reservation is novel — it locks funds for future epochs, preventing the user from withdrawing collateral needed for upcoming stream executions.

**Feasibility:** **Easy-Medium** — Similar to TWAP (Idea 3) but with epoch-based scheduling rather than per-crank. The collateral reservation requires a new field in the user account or a separate PDA. ~1-2 weeks.

---

## Idea 10: Verified Circuit Breakers with Formal Guarantees

**What:** On-chain circuit breakers that automatically pause a market when conditions exceed _formally verified_ safe bounds:

1. **Price circuit breaker:** If mark price moves >X% in Y slots → auto-pause
2. **OI circuit breaker:** If open interest exceeds Z → reject new position-increasing trades
3. **Insurance circuit breaker:** If insurance fund < W% of required → pause new trades, allow only risk-reducing actions

**The formal verification angle:** We Kani-prove that:
- The circuit breaker _always_ activates before the system reaches an insolvent state
- When the circuit breaker is active, `canonical_inv` cannot be violated
- The circuit breaker can only be _deactivated_ by admin or by conditions returning to safe bounds

**Why novel:** All perp DEXes have circuit breakers, but none have _formally verified_ ones. The proofs give us a marketing-grade claim: "Percolator's circuit breakers are mathematically proven to prevent insolvency." No competitor can make this claim without doing the verification work we've already done.

**Feasibility:** **Easy** — PauseMarket/UnpauseMarket already exist (instruction tags 27/28). The auto-trigger logic goes in the keeper crank or as a check in trade instructions. The OI cap can be a risk parameter. The Kani proof is the real work — ~1 week for the proofs, ~1 week for the code.

---

## Idea 11: Copy-Trading PDA (Social Trading Primitive)

**What:** An on-chain copy-trading system where:
1. A "leader" registers a `CopyLeader` PDA
2. "Followers" create `CopyFollow` PDAs linking to the leader
3. When the leader trades, followers' trades are atomically executed in the same transaction (or next crank)

```
CopyLeader PDA:
  leader: Pubkey
  fee_bps: u16           // leader earns X bps on follower profits
  max_followers: u16
  follower_count: u16

CopyFollow PDA:
  follower: Pubkey
  leader: Pubkey
  size_multiplier_bps: u16  // 5000 = 50% of leader's size
  max_position_size: i64    // cap per market
  active: bool
```

**Execution:** Leader calls `TradeCpi`. A wrapper instruction (`TradeCpiWithCopy`) also iterates follower PDAs and submits proportional trades for each. All in one transaction (up to Solana's account limits).

**Why novel:** Copy trading exists off-chain (Bybit, Bitget) but never on-chain with atomic execution. The on-chain version is trustless — the leader can't front-run followers because execution is atomic. The fee share is automatic.

**Feasibility:** **Hard** — The "iterate followers in one tx" hits Solana's account and compute limits fast. Realistic cap: ~5-10 followers per leader per tx. A crank-based async model (followers executed on next crank) is more scalable but loses atomicity. ~3-4 weeks for async version.

---

## Idea 12: Composable Fee Router (Protocol-to-Protocol Revenue Sharing)

**What:** A `FeeRouter` PDA that sits between the user and the market, automatically splitting trading fees to multiple recipients:

```
FeeRouter PDA:
  recipients: [(Pubkey, u16)]  // (address, share_bps) — up to 5 recipients
  total_share_bps: u16         // must sum to ≤ trading_fee_bps
```

Any frontend, aggregator, or protocol that routes trades through Percolator can attach a FeeRouter to earn revenue. The fee split happens _inside the trade instruction_ — no off-chain settlement, no trust.

**Why novel:** This turns Percolator into a "white-label perp engine." Any protocol can build a custom UI, attach their FeeRouter, and earn fees. The composability is the moat — it's economically irrational to build your own perp engine when you can just CPI into Percolator and earn fees.

**Feasibility:** **Easy** — The trading fee is already calculated in the trade path. Splitting it to additional token accounts adds ~2 token transfer CPIs per recipient. FeeRouter PDA creation is a new instruction. ~1-2 weeks.

---

## Idea 13: On-Chain Bracket Orders (OCO — One Cancels Other)

**What:** A `BracketOrder` PDA that stores take-profit and stop-loss levels for an existing position:

```
BracketOrder PDA:
  user: Pubkey
  market: Pubkey
  take_profit_price_e6: u64
  stop_loss_price_e6: u64
  close_size: i64              // how much to close (can be partial)
  created_slot: u64
  status: Active | Triggered | Cancelled
```

The keeper crank checks bracket orders alongside its normal duties. When mark price crosses either level, it executes the close and marks the other condition as cancelled.

**Why novel:** Bracket/OCO orders exist in TradFi and CEXes but are always off-chain on DEXes. On-chain bracket orders are trustless — they execute even if the user's bot goes offline. Combined with the keeper network, this provides CEX-grade order types with DEX-grade trust.

**Feasibility:** **Easy-Medium** — PDA design is simple. The keeper crank iteration needs to scan bracket order accounts — how many can it process per crank? With 4096-account slabs, scanning a separate bracket order list adds I/O. A dedicated `CrankBracketOrders` instruction with its own account list is cleaner. ~2 weeks.

---

## Idea 14: Hyperp Governance — Community-Controlled Mark Prices

**What:** For Hyperp-mode markets (no external oracle), allow mark price updates to be governed by a multisig or on-chain vote, not just a single oracle authority.

**Design:**
```
HyperpGovernance PDA:
  market: Pubkey
  voters: [Pubkey; 5]          // governance committee
  threshold: u8                // e.g., 3 of 5
  current_proposal: Option<PriceProposal>
  
PriceProposal:
  proposed_price_e6: u64
  proposer: Pubkey
  votes_for: u8
  votes_against: u8
  expiry_slot: u64
```

Once threshold votes are reached, the mark price updates. This enables truly decentralized meme markets where no single entity controls the price feed.

**Why novel:** No perp DEX has on-chain governance for oracle prices. This is uniquely enabled by Hyperp mode — since there's no external oracle, the governance layer becomes the price source. It's a novel primitive for community-driven markets.

**Feasibility:** **Medium** — Multisig logic is well-understood. Integration with `UpdateHyperpMark` (instruction tag 34) is clean. The tricky part: preventing governance attacks (majority vote to manipulate price for profit). Need economic security analysis. ~2-3 weeks code, ~1 week analysis.

---

## Summary & Priority Matrix

| # | Idea | Novelty | Feasibility | Moat Potential | Priority |
|---|------|---------|-------------|----------------|----------|
| 1 | CPI Risk Oracle | ★★★ | Easy | High — makes us infrastructure | **P0** |
| 12 | Composable Fee Router | ★★★ | Easy | Very High — economic flywheel | **P0** |
| 4 | Dutch Auction Liquidations | ★★★ | Easy | Medium — better for users | **P1** |
| 10 | Verified Circuit Breakers | ★★★★ | Easy | Very High — unique to formally verified systems | **P1** |
| 5 | On-Chain Referral Trees | ★★ | Medium | High — growth primitive | **P1** |
| 13 | On-Chain Bracket Orders (OCO) | ★★ | Easy-Med | High — CEX parity | **P1** |
| 3 | On-Chain TWAP Orders | ★★★ | Medium | Medium — TradFi parity | **P2** |
| 8 | Insurance Fund Tranching | ★★★★ | Medium | High — risk-segmented yield | **P2** |
| 9 | Position Streaming (Perp DCA) | ★★★ | Easy-Med | Medium — retail friendly | **P2** |
| 2 | Atomic Flash Positions | ★★★★★ | Hard | Very High — entirely new primitive | **P3** |
| 6 | Verified Margin Vaults | ★★★★ | Hard | Very High — regulatory angle | **P3** |
| 7 | Intent-Based Conditional Orders | ★★★★ | Hard | High — programmable trading | **P3** |
| 11 | Copy-Trading PDA | ★★★ | Hard | Medium — Solana account limits constrain scale | **P3** |
| 14 | Hyperp Governance | ★★★★ | Medium | Medium — niche but novel | **P3** |

---

## The "Percolator as Infrastructure" Thesis

The highest-leverage ideas are **#1 (CPI Risk Oracle)** and **#12 (Composable Fee Router)**. Together, they create a flywheel:

1. Fee Router makes it free (and profitable) for any protocol to route perp trades through Percolator
2. CPI Risk Oracle makes Percolator's state useful to _other_ protocols (lending, options, vaults)
3. More protocols integrate → more volume → more fees → more LPs → deeper liquidity → more protocols integrate

This is how Percolator becomes the **Uniswap of perps** — not by being the best UI, but by being the best _infrastructure_ that everyone else builds on.

The formal verification (225 Kani proofs) is the trust layer that makes this possible. No protocol will CPI into an unverified risk engine for production use. Our proofs are the moat.

---

*End of brainstorm. Ready for PM/strategist review.*
