# Mainnet Readiness Audit

**Date:** 2026-02-08  
**Auditor:** Cobra (automated)

---

## 1. VERDICT: Can We Use Toly's Mainnet Program?

### **NO — Not for micro/small/medium slabs. YES — Only for large (4096) slabs.**

**Why:** Toly's mainnet program (`GM8zjJ8LTBMv9xEsverh6H6wLyevgMHEJXcEzyY3rY24`) is compiled with the **default** feature set, meaning `MAX_ACCOUNTS = 4096`. The program enforces an **exact** slab length check:

```rust
// From percolator.rs line 2650
correct_len: data.len() == SLAB_LEN || data.len() == OLD_SLAB_LEN,
```

Where `SLAB_LEN` is computed at compile time from `MAX_ACCOUNTS`. For 4096 accounts, `SLAB_LEN ≈ 992,560 bytes`. A micro slab (16,320 bytes) will be **immediately rejected** with `InvalidSlabLen`.

**SLAB_LEN is baked into the binary at compile time. It cannot be changed without redeploying the program.**

### ABI Compatibility: ✅ YES

Our TypeScript instruction encoders are **fully compatible** with toly's program:
- Instruction tags 0-20 match exactly (verified: Rust decode matches our `IX_TAG` constants)
- Field ordering and sizes match (same source code)
- Account ordering matches (same `process_instruction` entrypoint)
- We forked from toly's code, added features on top, and kept backward compatibility

### Feature Compatibility: ⚠️ PARTIAL

Our program has features toly's **may not have** (depends on his build date):
- DEX oracle readers (PumpSwap, Raydium CLMM, Meteora DLMM)
- Hyperp mode (internal mark/index pricing, no external oracle)
- Admin oracle authority (`PushOraclePrice`, `SetOracleAuthority`, `SetOraclePriceCap`)
- `ResolveMarket`, `WithdrawInsurance`
- Coin-margined PnL, dual margin checks, self-healing funding

**If toly's program is an older build**, some of these instructions will fail with "unknown instruction tag." MidTermDev uses toly's program successfully, so at minimum the core instructions (0-13) work.

---

## 2. SLAB SIZES: What Works on Mainnet

| Tier | MAX_ACCOUNTS | Data Size | Rent (SOL) | Toly's Program | Our Program |
|------|-------------|-----------|------------|----------------|-------------|
| Micro | 64 | 16,320 | ~0.12 | ❌ REJECTED | ✅ (test feature) |
| Small | 256 | 62,808 | ~0.44 | ❌ REJECTED | ✅ (small feature) |
| Medium | 1024 | 248,760 | ~1.73 | ❌ REJECTED | ✅ (medium feature) |
| Large | 4096 | 992,568 | ~6.87 | ✅ WORKS | ✅ (default) |

**Bottom line:** Toly's program = large slabs only = ~6.87 SOL per market. Micro slabs on mainnet require deploying our own program.

---

## 3. FEATURE GAP

### Using Toly's Program (what we might lose)
| Feature | Status | Risk |
|---------|--------|------|
| Core trading (init/deposit/withdraw/trade/liquidate/crank) | ✅ Works | None |
| Pyth oracle | ✅ Works | None |
| vAMM matcher | ✅ Works (separate program) | None |
| Admin oracle (PushOraclePrice) | ⚠️ Unknown | High — need to test if tag 17 exists |
| DEX oracle (PumpSwap/Raydium/Meteora) | ⚠️ Unknown | High — may not be in toly's build |
| Hyperp mode | ⚠️ Unknown | Medium — may not exist in toly's build |
| Variable slab sizes | ❌ Not possible | Blocker for cheap markets |
| UpdateConfig (tag 14) | ⚠️ Unknown | Medium |
| ResolveMarket (tag 19) | ⚠️ Unknown | Low (not needed at launch) |

### Using Our Own Program (what we gain)
- All slab sizes (micro through large)
- Guaranteed feature parity — we control the binary
- DEX oracle for memecoin pricing
- Admin oracle mode for any token
- Hyperp mode for synthetic markets
- Upgrade authority for future fixes

---

## 4. DEPLOY OUR OWN PROGRAM TO MAINNET

### We Have the Artifacts ✅

```
/tmp/program-artifacts/
├── percolator-program-micro/percolator_prog.so   (219 KB)
├── percolator-program-small/percolator_prog.so   (230 KB)
├── percolator-program-medium/percolator_prog.so  (230 KB)
└── percolator-program-full/percolator_prog.so    (230 KB)
```

### Cost Breakdown

| Item | Cost (SOL) | Notes |
|------|-----------|-------|
| Program deploy (230KB binary) | ~1.6 SOL | Rent-exempt for program data account |
| Buffer account for upload | ~1.6 SOL | Refunded after deploy |
| Transaction fees | ~0.01 SOL | Negligible |
| **Total to deploy** | **~1.6 SOL** | One-time cost |

Plus per-market slab costs:
- Micro market: ~0.12 SOL
- Small market: ~0.44 SOL  
- Large market: ~6.87 SOL

### Deployment Steps

1. **Choose variant** — Deploy the **micro** variant first (cheapest slabs, proves the flow works). Can deploy additional variants later under different program IDs.
2. **Fund deployer wallet** — Need ~2 SOL in `DHd11N5JVQmGdMBWf6Mnu1daFGn8j3ChCHwwYAcseD5N` (keypair at `/tmp/deployer.json`)
3. **Deploy:**
   ```bash
   solana program deploy /tmp/program-artifacts/percolator-program-micro/percolator_prog.so \
     --keypair /tmp/deployer.json \
     --url mainnet-beta \
     --program-id /tmp/percolator-program.json
   ```
4. **Set upgrade authority** — Keep it as deployer wallet for now (can transfer to multisig later)
5. **Update config.ts** with new mainnet program ID

### ⚠️ CRITICAL: One Program = One Slab Size

Each deployed program binary has a **hardcoded** MAX_ACCOUNTS. You **cannot** create micro AND large slabs on the same program. Options:

- **Option A:** Deploy micro variant only (cheap markets, 64 slots max per market)
- **Option B:** Deploy multiple variants under different program IDs (most flexible, costs ~1.6 SOL each)
- **Option C:** Deploy large variant only (expensive markets but maximum capacity, same as toly)

**Recommendation:** Deploy **small** variant (256 accounts, ~0.44 SOL per market). Best balance of cost and capacity. Deploy large variant later when needed.

---

## 5. BLOCKERS — Must Fix Before Mainnet

### Critical Blockers

| # | Blocker | Severity | Fix |
|---|---------|----------|-----|
| 1 | **Slab size mismatch** — config.ts hardcodes `slabSize: 992_560` even when using our program | 🔴 Critical | Use `SLAB_TIERS[tier].dataSize` dynamically |
| 2 | **Crank wallet empty** — `crankWallet: ""` in mainnet config | 🔴 Critical | Fund + configure crank keypair |
| 3 | **No mainnet program deployed** (our own) | 🔴 Critical | Deploy with ~2 SOL |
| 4 | **Deployer wallet low on SOL** — only ~0.30 SOL | 🔴 Critical | Need ~2+ SOL for deploy + first markets |
| 5 | **Program keypair in /tmp/** — will be lost on reboot | 🔴 Critical | Back up `/tmp/percolator-program.json` and `/tmp/deployer.json` |

### High Priority

| # | Issue | Severity | Fix |
|---|-------|----------|-----|
| 6 | Helius API key exposed in config.ts (committed to repo) | 🟡 High | Move to env var |
| 7 | No matcher program for our deployment | 🟡 High | Deploy vAMM matcher or use toly's |
| 8 | Railway crank service disabled (no CRANK_KEYPAIR) | 🟡 High | Generate + fund crank wallet, set env var |
| 9 | Unknown if toly's matcher works with our program | 🟡 High | Test CPI compatibility |

### Medium Priority

| # | Issue | Severity | Fix |
|---|-------|----------|-----|
| 10 | Frontend defaults to devnet | 🟠 Medium | Change `NEXT_PUBLIC_DEFAULT_NETWORK` |
| 11 | No monitoring/alerting for mainnet | 🟠 Medium | Add health checks |
| 12 | No mainnet test market created yet | 🟠 Medium | Create test market after deploy |

---

## 6. CHECKLIST — Step-by-Step Mainnet Launch

### Phase 1: Preparation (Day 1)
- [ ] **Back up keypairs** — Copy `/tmp/percolator-program.json` and `/tmp/deployer.json` to secure location
- [ ] **Fund deployer wallet** — Send 3+ SOL to `DHd11N5JVQmGdMBWf6Mnu1daFGn8j3ChCHwwYAcseD5N`
- [ ] **Move Helius API key** to `.env.local` / Vercel env vars (remove from committed config)
- [ ] **Choose slab variant** — Recommend: small (256 accounts)

### Phase 2: Deploy Program (Day 1-2)
- [ ] **Deploy program** to mainnet with chosen variant
- [ ] **Record new program ID** 
- [ ] **Deploy matcher** (vAMM) OR verify toly's matcher (`DHP6DtwXP1yJsz8YzfoeigRFPB979gzmumkmCxDLSkUX`) is compatible
- [ ] **Update config.ts** with our mainnet program ID + matcher ID
- [ ] **Generate crank wallet** — New keypair, fund with 0.1 SOL, set in config + Railway

### Phase 3: Test on Mainnet (Day 2-3)
- [ ] **Create test market** with cheap token (micro/small slab)
- [ ] **Test full flow**: InitMarket → InitLP → InitUser → Deposit → Trade → Withdraw → Close
- [ ] **Test crank** — Enable on Railway with CRANK_KEYPAIR
- [ ] **Test admin oracle** — PushOraclePrice for memecoin
- [ ] **Verify frontend** discovers and displays mainnet market

### Phase 4: Production Launch (Day 3+)
- [ ] **Switch default network** to mainnet
- [ ] **Redeploy Vercel** with mainnet env vars
- [ ] **Create first real market** (SOL-PERP or popular memecoin)
- [ ] **Monitor** — Watch for failed txs, stuck cranks, oracle staleness
- [ ] **Announce** — X community post

---

## Summary

**Using toly's program:** Works for large (4096-slot, ~6.87 SOL) markets only. ABI compatible. Unknown feature gaps for admin oracle / DEX oracle / Hyperp mode.

**Deploying our own:** ~1.6 SOL one-time cost. Full control. All slab sizes. All features. **This is the recommended path.**

**Biggest risk:** Keypairs in `/tmp/` — back these up immediately or they'll be lost.
