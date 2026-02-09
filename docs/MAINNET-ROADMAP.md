# Percolator Mainnet Roadmap

## Current State (Feb 9, 2026)
- 3 program variants deployed on devnet (small/medium/large)
- Markets creating, cranking, trading — all working
- Backend on Railway (crank + oracle + liquidation)
- Frontend on Vercel
- Missing: several features needed before mainnet

---

## Phase 1: Security Fixes (MUST before mainnet)

### 1.1 Hardcoded API Keys
**Effort:** 1 hour | **Risk:** HIGH
- Helius API key hardcoded in 5 files (client-side exposed)
- Fix: use `process.env` everywhere, remove all hardcoded keys
- Files: `api/launch/route.ts`, `api/crank/*/route.ts`, `devnet-mint-content.tsx`, `e2e-devnet-test.ts`

### 1.2 API Route Authentication
**Effort:** 2-3 hours | **Risk:** HIGH
- All POST routes (`/api/markets`, `/api/markets/[slab]/trades`, `/api/markets/[slab]/prices`, `/api/markets/[slab]/stats`) are unauthenticated
- Anyone can inject fake markets, trades, prices into Supabase
- Fix: require on-chain tx signature verification for market registration, service-key auth for stats/prices/trades (only crank should write these)

### 1.3 Supabase Type Safety
**Effort:** 1 hour | **Risk:** LOW
- 5 `as any` casts on Supabase client calls
- Fix: generate proper types from schema or define inline

---

## Phase 2: On-Chain Program Features

### 2.1 AdminForceClose (Tag 21)
**Effort:** 2-3 hours | **Risk:** MEDIUM
- Admin can close any position at oracle price in emergencies
- Already implemented by MidTermDev — port their code
- Needed for: rogue positions, market shutdown, emergency response
- Requires program redeploy on devnet (all 3 variants)

### 2.2 UpdateRiskParams (Tag 22)
**Effort:** 1-2 hours | **Risk:** MEDIUM
- Admin can change margin params (initial/maintenance) after market creation
- Already implemented by MidTermDev — port their code
- Needed for: tuning markets based on real trading activity
- Requires program redeploy

### 2.3 RenounceAdmin (Tag 23) — "Burn the keys"
**Effort:** 2-3 hours | **Risk:** LOW (not needed for launch)
- Sets admin field to all zeros — irreversible
- Once burned: no more oracle authority changes, no force close, no param updates
- Needed for: making markets truly trustless/permissionless
- Should be optional — market creators choose when/if to burn

### 2.4 Token2022 Support
**Effort:** 3-4 hours | **Risk:** LOW
- Currently only works with classic SPL Token
- Many new tokens use Token2022 (transfer fees, interest-bearing, etc.)
- MidTermDev has detection logic — port it
- Not blocking for launch (most memecoins are classic SPL)

---

## Phase 3: Insurance LP Token System (Toly's Vision)

### 3.1 Claim Token Mint
**Effort:** 4-6 hours | **Risk:** MEDIUM
- Each market gets an SPL token mint for insurance LP claims
- Mint on insurance deposit, burn on withdrawal
- Token represents proportional share of insurance pool
- On-chain: new instruction `MintInsuranceClaim` + `RedeemInsuranceClaim`

### 3.2 VaR-Based Yield Distribution
**Effort:** 6-8 hours | **Risk:** HIGH (complex math)
- LPs earn based on value at risk, not just TVL
- Need to compute VaR per market (total open interest * leverage)
- Yield = trading fees * (your_share / total_insurance) * var_multiplier
- Crank distributes yield each cycle

### 3.3 Withdrawal Cooldown
**Effort:** 2-3 hours | **Risk:** MEDIUM
- Time-lock on insurance withdrawals during high VaR periods
- Prevents LPs from pulling liquidity right when the fund needs it
- Configurable cooldown period per market

### 3.4 Transferable Claim Tokens
**Effort:** 1 hour | **Risk:** LOW
- Claim tokens are standard SPL — already transferable
- Secondary market for insurance positions happens automatically
- Just need UI to show claim token balance and yield

---

## Phase 4: Trading UX

### 4.1 PreTradeSummary Component
**Effort:** 2-3 hours | **Risk:** LOW
- Show before trade: estimated entry price, liq price, trading fee, margin required
- MidTermDev has this — port and improve their implementation
- Critical for user safety — people need to know liq price before trading

### 4.2 Trading Math Utilities
**Effort:** 2 hours | **Risk:** LOW
- Coin-margined PnL computation
- Liquidation price calculation
- Funding rate display
- PnL percentage
- Port from MidTermDev's `trading.ts`

### 4.3 Position PnL Display
**Effort:** 2-3 hours | **Risk:** LOW
- Show unrealized PnL on open positions ($ and %)
- Entry price vs current price
- Distance to liquidation
- Uses trading math from 4.2

### 4.4 Close Position Flow
**Effort:** 2-3 hours | **Risk:** MEDIUM
- Dedicated close button with confirmation
- Shows realized PnL
- Handles partial closes

---

## Phase 5: Mainnet Deployment

### 5.1 Program Deployment Decision
**Options:**
1. **Use toly's mainnet program** (`GM8zjJ8...`) — free, already deployed, but missing AdminForceClose/UpdateRiskParams/RenounceAdmin
2. **Deploy our own** — costs ~1.5 SOL per variant, has all our custom features
3. **Hybrid** — use toly's for now, deploy ours when custom features are ready

**Recommendation:** Option 3. Ship with toly's mainnet program first (zero deploy cost), build custom features on devnet, deploy our program to mainnet when Phase 2 + 3 are done.

### 5.2 Mainnet Costs
| Item | Cost | Recurring |
|------|------|-----------|
| Small slab rent | ~$65 | One-time |
| Medium slab rent | ~$250 | One-time |
| Large slab rent | ~$1,000 | One-time |
| Crank wallet | ~$10 | Monthly |
| Helius RPC | ~$50 | Monthly |
| Custom program deploy | ~$220 | One-time |

**Minimum viable:** Small slab + crank + Helius = ~$125 total to start

### 5.3 Production Checklist
- [ ] Helius paid plan
- [ ] Real Pyth oracle feeds (for tokens with Pyth support)
- [ ] DexScreener oracle for memecoins
- [ ] Production crank wallet funded
- [ ] Error monitoring (Sentry or similar)
- [ ] Rate limiting on API routes
- [ ] SSL/domain for backend API
- [ ] Program security review

---

## Phase 6: Growth Features (Post-Launch)

### 6.1 LP Aggregation / Smart Router
- Route trades across multiple LPs for best execution
- Toly's design supports this at wrapper level

### 6.2 vAMM Improvements
- Auto-rebalancing virtual liquidity
- Dynamic spread based on volatility
- Inventory-aware pricing

### 6.3 Portfolio Analytics
- Historical PnL tracking
- Trade history export
- Performance metrics

### 6.4 Mobile UI
- Responsive trade interface
- Wallet connect on mobile

---

## Execution Order (What to build first)

### Week 1 — Ship-blocking fixes
1. Phase 1.1: Fix hardcoded API keys (1h)
2. Phase 4.1: PreTradeSummary (2h)
3. Phase 4.2: Trading math utils (2h)
4. Phase 1.2: API auth (3h)
5. Phase 4.3: Position PnL display (2h)

### Week 2 — On-chain upgrades
6. Phase 2.1: AdminForceClose (3h)
7. Phase 2.2: UpdateRiskParams (2h)
8. Phase 2.3: RenounceAdmin (3h)
9. Redeploy all 3 devnet programs
10. Phase 4.4: Close position flow (3h)

### Week 3 — Insurance LP system
11. Phase 3.1: Claim token mint (6h)
12. Phase 3.2: VaR yield distribution (8h)
13. Phase 3.3: Withdrawal cooldown (3h)
14. Test full insurance LP flow on devnet

### Week 4 — Mainnet
15. Phase 5.1: Deploy program to mainnet
16. Phase 5.3: Production checklist
17. Launch first market
18. Phase 3.4: Transferable claim token UI

---

## What We Have vs MidTermDev vs Toly's Vision

| Feature | Us | MidTermDev | Toly Wants |
|---------|----|-----------:|------------|
| Variable slab sizes | ✅ 3 tiers | ❌ | ✅ |
| Multi-program | ✅ | ❌ | ✅ |
| Backend crank | ✅ Railway | ❌ manual | ✅ |
| Liquidation scanner | ✅ | ❌ | ✅ |
| WebSocket prices | ✅ | ❌ | ✅ |
| Market discovery | ✅ multi-prog | ✅ single | ✅ |
| AdminForceClose | ❌ | ✅ | ✅ |
| UpdateRiskParams | ❌ | ✅ | ✅ |
| Admin key burn | ❌ | ❌ | ✅ |
| PreTradeSummary | ❌ | ✅ | ✅ |
| Trading math | ❌ | ✅ | ✅ |
| Token2022 | ❌ | ✅ | Nice to have |
| Insurance LP tokens | ❌ | ❌ | ✅✅✅ |
| VaR-based yield | ❌ | ❌ | ✅✅✅ |
| Withdrawal cooldown | ❌ | ❌ | ✅ |
| DEX oracle | ✅ | ✅ | ✅ |
| vAMM matcher | ✅ basic | ✅ basic | ✅ |

**Bottom line:** We're ahead on infrastructure (backend, multi-program, variable slabs). MidTermDev is ahead on UX and admin controls. Neither of us has built toly's insurance LP vision yet — that's the biggest differentiator available.
