# Audit Part 5: Economic Design, Game Theory, Architecture & Final Scorecard

**Date:** 2026-02-17  
**Auditor:** Cobra (automated — subagent)  
**Scope:** Architecture, Economic Design, Game Theory, Attack Vectors, Production Readiness  
**Branch:** `cobra/feature/new-backend`

---

## FINDINGS TABLE

| ID | Severity | Category | Title | Location | Description | Impact | Attack Scenario | Fix |
|----|----------|----------|-------|----------|-------------|--------|-----------------|-----|
| E-01 | CRITICAL | Oracle | Oracle authority = market creator controls price | `program/src/percolator.rs` SetOracleAuthority/PushOraclePrice | Market creator sets themselves as oracle authority. They can push arbitrary prices, liquidating all traders at will. | Total loss of trader funds | Creator creates "SOL-PERP" market with malicious oracle → pushes price to $0.01 → all longs liquidated → creator profits | UI MUST prominently warn when oracle_authority != zero_pubkey. Show "CENTRALIZED ORACLE" badge. Block markets with non-Pyth oracles from default listing. |
| E-02 | CRITICAL | Permissionless | Spoofed market names with malicious oracle | `InitMarket` instruction | Anyone can create a market that claims to be "SOL-PERP" but uses a creator-controlled oracle. No on-chain name verification. | Users trade on fake market, get liquidated by oracle manipulation | Create market named "SOL-PERP" in Supabase registry, set oracle authority to attacker wallet, push fake prices | Enforce unique market names in Supabase registry. Show oracle type prominently. Require admin-verified markets for default display. |
| E-03 | HIGH | Insurance LP | JIT attack on insurance deposits | `DepositInsuranceLP` / `WithdrawInsuranceLP` | Attacker monitors mempool for large liquidations. Deposits into insurance right before liquidation fee collection, withdraws immediately after to capture disproportionate yield. | Insurance LP yield dilution / extraction | Watch for undercollateralized positions → deposit large insurance LP → crank triggers liquidation → fees flow to insurance → withdraw LP tokens at higher redemption rate | Add withdrawal cooldown (time-lock after deposit). Already noted as Phase 3.3 in MAINNET-ROADMAP but NOT implemented. |
| E-04 | HIGH | Insurance LP | Insurance drain below threshold race | `WithdrawInsuranceLP` | Multiple LPs can race to withdraw simultaneously. While each individual withdrawal checks `>= risk_reduction_threshold`, concurrent withdrawals in the same slot could all pass the check before any commits. | Insurance fund drained below safety threshold | Multiple LPs submit withdraw TXs in same slot, all read balance > threshold, all pass, net result below threshold | Solana's sequential TX execution within a slot prevents this — slab account is locked per TX. **MITIGATED by design.** But if insurance is close to threshold, a single large withdrawal followed by a market crash creates bad debt. Consider higher buffer. |
| E-05 | HIGH | MEV | Oracle sandwich attack via PushOraclePrice | `PushOraclePrice` + trade in same slot | Oracle authority can bundle: push high price → user's pending buy executes at inflated mark → push price back. Since oracle authority is a signer, they can use Jito bundles. | Traders get worse execution due to manipulated mark price | Authority bundles: PushOraclePrice(high) → Crank → Trade → PushOraclePrice(normal) | `SetOraclePriceCap` limits price changes per update. Default is 1% per slot (`DEFAULT_HYPERP_PRICE_CAP_E2BPS = 10_000`). Effective but can still extract 1% per slot. Reduce cap or add TWAP. |
| E-06 | HIGH | Funding | Funding rate gaming via massive position | `compute_inventory_funding_bps_per_slot` | Whale takes large position on minority side → earns funding from majority → closes. The funding rate is inventory-based (LP net position), capped at 5bps/slot. | Unfair wealth transfer if funding rate can be temporarily spiked | Take massive short when LP is net long → earn positive funding → close position | Rate is capped at `funding_max_bps_per_slot` (default 5 bps/slot). Horizon (500 slots) spreads impact. Scale factor dampens rate. **Partially mitigated** but cap of 5bps/slot = 0.05%/slot is still significant for large positions over many slots. |
| E-07 | MEDIUM | Coin-Margin | Double-whammy risk not communicated | Frontend | Coin-margined PnL means when price drops, your collateral is worth less AND your long position loses. Effective leverage is higher than displayed. For longs at 10x, effective USD leverage is ~11x. | Users underestimate risk, get liquidated unexpectedly | Not an attack — inherent design risk. But users expecting USD-margined behavior will miscalculate. | Add explicit "Coin-Margined" badge on all markets. Show effective USD leverage alongside nominal leverage. Add tooltip explaining double-whammy. |
| E-08 | MEDIUM | Admin | Admin grief before renounce | `PauseMarket`, `UpdateRiskParams`, `SetMaintenanceFee` | Admin can: pause market indefinitely, set extreme maintenance fees (draining all accounts), set extreme margins (instant liquidation), then renounce admin making it permanent. | All user funds trapped or drained via fees | Set maintenance_fee_per_slot to max → crank drains all capital to insurance → renounce admin | Post-RenounceAdmin, params are immutable. Users should verify params BEFORE trading. UI should show "Admin Active" vs "Admin Renounced" prominently. |
| E-09 | MEDIUM | State Bloat | Slab slot exhaustion via dust positions | `add_user` / `execute_trade` | Attacker creates many user accounts (paying new_account_fee each), opens tiny positions that are below min_liquidation_abs. These occupy slab slots. | Market rendered unusable when all 4096 (or 256/64) slots filled with dust | Create 4096 accounts with minimum fee, each with tiny position → legitimate users can't join | `garbage_collect_dust` in keeper_crank handles zero-capital, zero-position accounts. min_liquidation_abs force-closes tiny positions. new_account_fee makes this expensive. **Mostly mitigated** but cost depends on fee setting. |
| E-10 | MEDIUM | MEV | Liquidation front-running | Liquidation path | Keeper sees liquidatable position in mempool or via RPC monitoring. Uses Jito bundle to liquidate first, capturing the liquidation fee. | Competing keepers front-run each other; no direct user harm since liquidation was needed anyway | Monitor positions → bundle liquidation TX with higher priority | Liquidation is permissionless (CRANK_NO_CALLER). Any keeper can liquidate. This is by design — competition ensures fast liquidation. Liquidation fee goes to insurance fund, not keeper. **No user harm.** |
| E-11 | LOW | Wash Trading | Self-trading for fee credits | `execute_trade` | User creates both user and LP accounts, trades with themselves. Trading fee is deducted from capital but credited back to fee_credits. Net cost is only the fee going to insurance. | Fee credits offset maintenance fees, effectively reducing cost of holding accounts | Create LP + user accounts → trade back and forth → earn fee_credits → offset maintenance fees indefinitely | Fee goes to insurance (net positive for system). Fee credits only offset maintenance fees, don't generate profit. Wash trading is unprofitable (you pay the fee, get credits worth less). **Low impact.** |
| E-12 | LOW | Cross-Market | No cross-market correlation risk | Architecture | Each market is an isolated slab. No cross-margining. Manipulating one market cannot directly affect another. | N/A — isolation is protective | Cannot profit on market B by manipulating market A (no shared state) | **Mitigated by design.** Slab isolation is a feature. |
| E-13 | INFO | Architecture | Backend SPOF for UX but not funds | Backend architecture | Backend (Supabase, crank, price engine) being down degrades UX but doesn't risk funds. On-chain state is authoritative. Positions persist, can be managed via direct program interaction. | Degraded UX: no price updates, no auto-liquidation, no trade indexing | N/A | Document manual recovery procedures. Ensure crank can be restarted quickly. Multiple crank instances for redundancy. |

---

## PART 1: ARCHITECTURE & DESIGN

### 1.1 System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         TRUST BOUNDARY: USER                           │
│  ┌──────────┐    ┌──────────┐                                         │
│  │ Browser  │───▶│ Frontend │ (Next.js / Vercel)                      │
│  │ (Wallet) │◀───│          │                                         │
│  └──────────┘    └────┬─────┘                                         │
│                       │ HTTPS/WSS                                     │
├───────────────────────┼─────────────────────────────────────────────── │
│                TRUST BOUNDARY: BACKEND (centralized)                   │
│                       ▼                                                │
│  ┌──────────────────────────────────────────┐                         │
│  │         packages/api (Railway)            │                        │
│  │  ┌────────────┐  ┌───────────────┐       │                        │
│  │  │ REST API   │  │ WebSocket     │       │                        │
│  │  │ (markets,  │  │ (live prices) │       │                        │
│  │  │  trades)   │  │               │       │                        │
│  │  └─────┬──────┘  └───────┬───────┘       │                        │
│  └────────┼─────────────────┼───────────────┘                        │
│           │                 │                                         │
│  ┌────────▼─────┐  ┌───────▼────────┐  ┌──────────────┐             │
│  │  Supabase    │  │  Price Engine   │  │  Crank/Keeper│             │
│  │  (Postgres)  │  │  (packages/    │  │  (packages/  │             │
│  │  - markets   │  │   keeper)      │  │   keeper)    │             │
│  │  - trades    │  │                │  │              │             │
│  │  - prices    │  │                │  │              │             │
│  └──────────────┘  └───────┬────────┘  └──────┬───────┘             │
│                            │                   │                      │
├────────────────────────────┼───────────────────┼──────────────────────┤
│                  TRUST BOUNDARY: SOLANA (trustless)                    │
│                            ▼                   ▼                      │
│  ┌─────────────────────────────────────────────────────┐             │
│  │              Solana RPC (Helius)                      │            │
│  │                       │                               │            │
│  │  ┌────────────────────▼──────────────────────┐       │            │
│  │  │     Percolator Program (on-chain BPF)      │      │            │
│  │  │  ┌─────────┐  ┌────────────┐              │      │            │
│  │  │  │ Slab    │  │ Risk       │              │      │            │
│  │  │  │ (market │  │ Engine     │              │      │            │
│  │  │  │  state) │  │ (percolator│              │      │            │
│  │  │  │         │  │  crate)    │              │      │            │
│  │  │  └─────────┘  └────────────┘              │      │            │
│  │  │       ↕ CPI                                │      │            │
│  │  │  ┌─────────┐                               │      │            │
│  │  │  │ Matcher │ (vAMM or custom)              │      │            │
│  │  │  │ Program │                               │      │            │
│  │  │  └─────────┘                               │      │            │
│  │  └────────────────────────────────────────────┘      │            │
│  │                                                       │            │
│  │  ┌──────────┐  ┌──────────┐                          │            │
│  │  │ Pyth     │  │ SPL      │                          │            │
│  │  │ Oracle   │  │ Token    │                          │            │
│  │  └──────────┘  └──────────┘                          │            │
│  └───────────────────────────────────────────────────────┘            │
└──────────────────────────────────────────────────────────────────────┘
```

**Trust Boundaries:**
1. **User → Frontend**: User trusts frontend to correctly encode instructions. Wallet signs.
2. **Frontend → Backend**: Backend is centralized (Supabase, API). Provides convenience data. NOT source of truth for funds.
3. **Backend → Solana**: Backend submits TXs. On-chain program validates everything independently.
4. **On-chain Program → Matcher**: CPI trust boundary. Program validates matcher identity, ABI, and exec_size bounds.
5. **On-chain Program → Oracle**: Pyth or authority-pushed prices. Oracle authority is trust-critical.

**Single Points of Failure:**
- **Backend down**: No live prices via WebSocket, no auto-cranking, no trade indexing. Positions safe on-chain. Users can interact directly with program.
- **Supabase down**: Market discovery broken (no registry). Trading still works if user knows slab address.
- **RPC down**: Everything stops. No transactions possible. Standard Solana dependency.
- **Crank down**: Funding doesn't accrue, liquidations delayed, stale crank blocks risk-increasing trades (by design — `require_fresh_crank`).

**Slab-Per-Market Design:**
- **Strengths**: Market isolation (one market's issues don't affect others), parallelism (different markets can be cranked concurrently), simple mental model.
- **Weaknesses**: Fixed account limit per slab (64/256/1024/4096), rent cost scales with tier, one program binary = one slab size (must deploy multiple programs for different tiers).

### 1.2 Monorepo Structure

```
packages/
├── core/       — shared math, types, SDK (trading.ts)
├── shared/     — input sanitization, common utilities
├── api/        — REST API + WebSocket server
├── keeper/     — crank bot, price engine, liquidation
├── indexer/    — trade indexer
└── simulation/ — simulation framework

services/       — LEGACY (keeper/, oracle/)
```

- `packages/server/` does NOT exist — superseded by `packages/api/` + `packages/keeper/`
- `services/keeper/` and `services/oracle/` are legacy root-level directories. **Duplication risk** with `packages/keeper/`. Should be removed or clearly marked deprecated.
- Package boundaries are reasonably clean. `core` is pure math/types, `shared` is utilities, `api/keeper/indexer` are runtime services.

### 1.3 Data Architecture

| Data Type | Source of Truth | Secondary | Divergence Impact |
|-----------|----------------|-----------|-------------------|
| Markets | On-chain (slab) | Supabase (registry) | Supabase missing = market not discoverable in UI, but still functional |
| Trades | On-chain (TX log) | Supabase (indexed) | Missed trades = incomplete trade history in UI, no financial impact |
| Prices | On-chain (engine state + oracle) | WebSocket (live) | WS stale = UI shows old price, but on-chain trades use real oracle |
| Positions | On-chain only | None | Authoritative |
| Insurance | On-chain (engine.insurance_fund) | None | Authoritative |

**TradeIndexer misses trades**: Trade history in UI becomes incomplete. Recovery: re-scan TX history from Solana. No financial impact — on-chain state is always consistent.

**On-chain ↔ Supabase divergence**: Supabase is convenience layer only. If it diverges, UI shows stale data but funds are safe. Can be rebuilt from on-chain data at any time.

---

## PART 8: ECONOMIC DESIGN & GAME THEORY

### 8.1 Permissionless Market Launch

**Malicious parameter possibilities:**
- `oracle_authority` set to creator → full price control (E-01)
- `initial_margin_bps = 1` → 10000x leverage (guaranteed liquidations)
- `maintenance_fee_per_slot` set very high → drains accounts rapidly
- `warmup_period_slots = u64::MAX` → PnL never vests
- `new_account_fee` set to near-zero → state bloat attacks cheaper
- `risk_reduction_threshold = 0` → no safety net for insurance

**Post-RenounceAdmin immutables:** ALL config params become immutable. No more fee changes, margin changes, oracle authority changes, pausing, force-close. The market runs autonomously forever (or until all positions close and slab is closed).

**Spoofed markets (E-02):** Nothing prevents creating a market that LOOKS like "SOL-PERP" in Supabase but has a malicious oracle. The on-chain program has no concept of market names — names exist only in Supabase. **Critical UX issue.**

### 8.2 Coin-Margined Math

**PnL formula (from `percolator.rs` `mark_pnl_for_position`):**
```
Long:  mark_pnl = (oracle - entry) * abs_pos / oracle
Short: mark_pnl = (entry - oracle) * abs_pos / oracle
```

This is correct for coin-margined perpetuals. Dividing by `oracle` (not 1e6) gives PnL in token terms.

**TypeScript match (`packages/core/src/math/trading.ts`):**
```typescript
computeMarkPnl: diff * absPos / oraclePrice
```
✅ Matches on-chain formula exactly.

**Double-whammy (E-07):** For longs, when price drops:
1. Position loses value (mark_pnl negative)
2. Collateral (denominated in same token) is worth less in USD
3. Effective USD leverage = nominal_leverage / (1 - 1/nominal_leverage) ≈ higher than displayed

**Liquidation price formula (`computeLiqPrice`):** Uses BigInt arithmetic correctly. Accounts for maintenance margin. The formula is consistent with on-chain `is_above_maintenance_margin_mtm`.

**Margin checks:** On-chain uses DUAL margin checks — both price-based (`position * price * margin_bps`) AND position-based (`position * margin_bps`). The `max()` of both is used. This is correct for coin-margined perps where price-based can undercount at low prices.

### 8.3 Funding Rate

**Mechanism:** Inventory-based funding. Rate is proportional to LP net position (net_lp_pos).

```
premium_bps = min(notional * k_bps / inv_scale, max_premium_bps)
per_slot = premium_bps / horizon_slots
clamped to ±funding_max_bps_per_slot (default ±5 bps/slot)
```

**Sign convention:**
- LP net long → positive rate → longs pay shorts → discourages longs → pushes inventory toward 0 ✅
- LP net short → negative rate → shorts pay longs → discourages shorts ✅

**Zero-sum:** Yes — funding is applied via global funding index. Each account's funding payment = `position * ΔF / 1e6`. The sum across all positions (longs + shorts) nets to approximately zero (with rounding favoring the vault).

**Anti-retroactivity:** Rate is stored, then applied in next crank. State changes at slot t only affect funding for slots ≥ t. ✅ Correct.

**Gaming (E-06):** A whale can take a massive position on the minority side to earn funding. Mitigations:
- Rate capped at 5 bps/slot (0.05%/slot)
- Horizon of 500 slots spreads impact
- Scale factor dampens sensitivity
- Opening the position itself costs trading fee
- Initial margin required (limits position size relative to capital)

### 8.4 Insurance LP

**Yield source:** Trading fees, liquidation fees, maintenance fees → all flow to `insurance_fund.balance`. LP token supply is fixed between deposits/withdrawals, so redemption_ratio = balance/supply increases over time.

**Anti-drain:** `WithdrawInsuranceLP` checks `insurance_balance - units_to_return >= risk_reduction_threshold`. Cannot withdraw below threshold.

**JIT attack (E-03):** No withdrawal cooldown implemented yet. Spec mentions it as Phase 3.3 but code doesn't have it. Attacker can deposit → wait for liquidation fee → withdraw. **Needs fix before mainnet.**

**Bad debt:** If insurance is drained to zero and there are undercollateralized positions:
1. `force_realize_active()` triggers when balance ≤ threshold
2. Crank force-closes ALL positions at oracle price
3. Losses are written off via `set_pnl(i, 0)` (spec §6.1)
4. Positive PnL is haircutted via `haircut_ratio()` — winners get less
5. Bad debt is socialized: Residual decreases, haircut ratio drops
6. This is the ADL (auto-deleveraging) mechanism — no explicit ADL needed

**VaR-based pricing:** NOT implemented. Currently simple pro-rata. Listed as future Phase 3.2.

### 8.5 MEV Analysis

**Auto-crank timing:** Crank updates funding, settles mark-to-market, runs liquidations. A keeper who sees a pending trade can:
1. Crank FIRST (updating mark price from oracle) → trade executes at post-crank state
2. This is actually CORRECT behavior — crank should run before trades for accurate state
3. No price manipulation possible since oracle price comes from Pyth/authority, not crank

**Liquidation front-running (E-10):** Permissionless liquidation (`CRANK_NO_CALLER = u16::MAX`). Any keeper can liquidate. Fees go to insurance fund, NOT to the liquidator. **No economic incentive to front-run liquidations** — the liquidator gets nothing extra. This is a good design choice.

**Oracle sandwiching (E-05):** Only possible with oracle authority (not Pyth). Price cap (`oracle_price_cap_e2bps`) limits per-update change. Default 1% is reasonable but still allows extraction over multiple updates.

**Trade ordering within slot:** Solana processes TXs sequentially within a slot. The slab account lock prevents parallel execution on the same market. Order within slot matters (first TX gets the current state), but this is standard Solana behavior, not Percolator-specific.

### 8.6 Attack Vector Assessment

| Vector | Feasibility | Impact | Mitigation Status |
|--------|-------------|--------|-------------------|
| a) Wash trading | Low profit | Low | Fee goes to insurance; fee_credits ≠ profit |
| b) Oracle manipulation | High if authority | Critical | E-01: UI must warn. Price cap helps. |
| c) Insurance drain (JIT) | Medium | Medium | E-03: No cooldown. **NEEDS FIX.** |
| d) Keeper DoS | Low | Medium | Permissionless crank; account fees make spam expensive |
| e) State bloat | Medium cost | Medium | new_account_fee + dust GC + min_liquidation_abs |
| f) Admin grief | High if admin active | High | E-08: Users must verify params. Post-renounce safe. |
| g) Cross-market | Not possible | N/A | E-12: Slab isolation prevents this |
| h) Front-running | Possible via Jito | Low | Liquidation fees go to insurance, not liquidator |

---

## PART 10: PRODUCTION READINESS SCORECARD

| Area | Score (1-5) | Blocking Issues | Actions Needed |
|------|-------------|-----------------|----------------|
| On-chain security | 4 | None critical for core logic | Kani proofs cover key properties. `#![deny(unsafe_code)]` on risk engine. Single unsafe island in `zc` module is well-scoped. |
| On-chain correctness | 4 | None | Coin-margined math verified. Conservation invariant checked. Dual margin checks. Saturating arithmetic throughout. |
| Slab initialization safety | 3 | `init_in_place` requires pre-zeroed memory | Compile-time guards (`mainnet` feature) prevent test features in prod. Old slab backward compat adds complexity. |
| Oracle system | 3 | E-01: Oracle authority = full price control | Price cap implemented. Pyth integration solid. Authority mode is powerful but dangerous — needs UX warnings. |
| Liquidation system | 4 | None | Partial liquidation with buffer. Dust kill-switch. Force-realize under stress. Liquidation fee to insurance. Fail-safe (overflow → equity 0 → liquidatable). |
| Insurance LP | 2 | E-03: No withdrawal cooldown; no VaR pricing | Core deposit/withdraw implemented. Missing: cooldown, VaR weighting, minimum deposit, APY tracking. |
| SDK / ABI correctness | 3 | TypeScript math matches on-chain | BigInt used throughout (no Number precision loss). But no automated ABI sync — manual maintenance risk. |
| Frontend UX | 2 | E-07: Coin-margin risks not communicated | Missing: pre-trade summary, effective leverage display, oracle type warnings, admin status indicator. |
| Frontend code quality | 3 | Design system consistent (rounded-none, terminal aesthetic) | Simulation UI complete. Trade UI functional but missing safety features. |
| Backend reliability | 3 | E-13: SPOF for UX | Single Railway instance. No redundancy. No auto-restart monitoring. Crank wallet funding not automated. |
| Crank bot | 3 | Crank down = stale state blocks trading | `require_fresh_crank` is safety feature but means crank is critical path. Need redundant crank instances. |
| Price engine | 3 | Oracle authority mode = centralized pricing | Pyth path is trustless. Authority path is centralized but necessary for memecoins without Pyth feeds. |
| Trade indexer | 2 | Missed trades = incomplete history | No guaranteed delivery. No catchup mechanism documented. Supabase-dependent. |
| Database design | 3 | Supabase as convenience layer is correct | Schema exists for markets, trades, prices. Insurance LP events schema designed but not deployed. |
| Test coverage | 3 | Kani proofs for critical properties | Rust tests + Kani proofs cover risk engine. TypeScript tests unclear. E2E tests exist but coverage unknown. |
| CI/CD | 2 | No evidence of automated test pipeline | Devnet deploy scripts exist. No mainnet CI. No automated security checks. |
| Documentation | 4 | Comprehensive specs exist | INSURANCE-LP-SPEC, MAINNET-READINESS, MAINNET-ROADMAP, ARCHITECTURE, BACKEND-ARCHITECTURE all thorough. |
| Error handling (all layers) | 3 | Risk engine has good error types | Custom error enum maps all risk errors. Fail-safe patterns (overflow → 0 equity). But backend error handling unclear. |
| Monitoring & alerting | 1 | No monitoring system | No health checks, no alerting, no metrics collection. Noted as missing in MAINNET-READINESS. |
| Secrets management | 2 | Helius API key in source; keypairs in /tmp | MAINNET-READINESS identifies this. Not yet fixed. |
| Economic soundness | 3 | E-01, E-03, E-07 | Core economics are sound (inventory funding, coin-margin math, conservation invariant). But permissionless oracle authority and missing cooldown are gaps. |
| MEV resistance | 3 | E-05: Oracle sandwich possible with authority | Liquidation fees to insurance (not liquidator) is excellent. Price cap helps. But authority mode enables sandwich. |
| Disaster recovery | 2 | No documented DR procedures | On-chain state survives anything (Solana). Backend has no DR. Keypairs in /tmp (MAINNET-READINESS flags this). |
| **Mainnet readiness (overall)** | **2** | **Multiple blocking issues** | **See prioritized action plan below** |

---

## MAINNET VERDICT: **NOT READY**

Conditionally upgradable to "Conditionally Ready" after Phase 1 fixes below.

**Key blockers:**
1. Oracle authority enables complete fund theft (E-01) — needs prominent UX warnings
2. No Insurance LP withdrawal cooldown (E-03) — enables JIT yield extraction
3. No monitoring/alerting — blind to failures
4. Secrets in source code / keypairs in /tmp
5. Coin-margined risk not communicated to users (E-07)

---

## PRIORITIZED ACTION PLAN

### Phase 1: Before Mainnet (CRITICAL + HIGH)

| # | Action | Severity | Effort | Details |
|---|--------|----------|--------|---------|
| 1 | **Oracle authority UX warnings** | CRITICAL | 4h | Show "⚠️ CENTRALIZED ORACLE" badge when oracle_authority ≠ 0. Block non-Pyth markets from default listing. Show oracle authority pubkey. |
| 2 | **Market name verification** | CRITICAL | 2h | Prevent duplicate market names in Supabase. Show verification status on markets. Admin-verified vs user-created distinction. |
| 3 | **Insurance LP withdrawal cooldown** | HIGH | 3h | Add minimum holding period (e.g., 1 epoch / ~2 days) after deposit before withdrawal allowed. On-chain or via slab state. |
| 4 | **Secrets management** | HIGH | 1h | Remove Helius API key from source. Move to env vars. Back up keypairs from /tmp. |
| 5 | **Basic monitoring** | HIGH | 3h | Health check endpoint. Crank staleness alert. Insurance fund balance alert. Uptime monitoring. |
| 6 | **Redundant crank** | HIGH | 2h | Run 2+ crank instances. Leader election or idempotent crank (already permissionless). |

### Phase 2: Before Public Launch (MEDIUM)

| # | Action | Effort | Details |
|---|--------|--------|---------|
| 7 | Coin-margin risk communication | 2h | "Coin-Margined" badge, effective leverage tooltip, double-whammy explainer |
| 8 | Pre-trade summary component | 3h | Show liq price, fee, margin before trade confirmation |
| 9 | Admin status indicator | 1h | "Admin Active" vs "Admin Renounced" on market page |
| 10 | Trade indexer catchup mechanism | 4h | Periodic scan of missed TXs, backfill Supabase |
| 11 | CI/CD pipeline | 4h | Automated tests on PR, Kani proofs in CI |
| 12 | Clean up legacy `services/` directory | 1h | Remove or mark deprecated |

### Phase 3: Post-Launch (LOW + INFO)

| # | Action | Effort | Details |
|---|--------|--------|---------|
| 13 | VaR-based insurance LP pricing | 8h | Weight yield by market risk profile |
| 14 | Insurance APY tracking | 3h | Snapshot service, historical APY display |
| 15 | Cross-program ABI sync automation | 4h | Generate TypeScript types from Rust structs |
| 16 | Disaster recovery documentation | 2h | Runbooks for backend failure, crank failure, RPC outage |
| 17 | Rate limiting hardening | 2h | Redis-backed rate limiting for multi-instance |

---

## KEY ECONOMIC DESIGN OBSERVATIONS

### What's Well-Designed:
1. **Conservation invariant** (`V >= C_tot + I`): Formally verified. Rounding always favors the vault.
2. **Haircut ratio for ADL**: Elegant solution — no explicit ADL instruction needed. Positive PnL is automatically haircutted when vault is underfunded.
3. **Two-pass settlement** (losses before profits): Ensures losers' capital increases Residual before winners' warmup conversion reads the haircut. Fixes a subtle ordering bug.
4. **Anti-retroactivity in funding**: Rate set at interval start, applied at interval end. Prevents manipulation.
5. **Liquidation fees to insurance** (not liquidator): Eliminates MEV incentive for liquidation front-running.
6. **Permissionless crank**: Anyone can keep the market healthy. No single keeper dependency.
7. **Position-based + price-based margin checks**: Correct for coin-margined perps where price-based alone undercounts.

### What Needs Work:
1. **Oracle authority is too powerful** without UX guardrails
2. **Insurance LP is half-built** (no cooldown, no VaR, no APY tracking)
3. **Coin-margined risks are invisible** to users
4. **No operational infrastructure** (monitoring, alerting, DR)
5. **Permissionless market creation** without verification creates trust vacuum
