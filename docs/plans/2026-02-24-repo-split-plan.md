# Percolator Repo Split Plan (v2)

**Date:** 2026-02-24  
**Author:** coder  
**Status:** PROPOSAL — Do NOT execute without PM/Khubair approval

---

## Why Split?

The monorepo has grown to **~66K LOC** across Rust and TypeScript with fundamentally different build systems, deploy targets, and team ownership patterns. A single repo means:
- Vercel redeploys on Rust-only changes (and vice versa)
- CI runs all 200+ tests for a CSS change
- Keeper/indexer deploys coupled to frontend deploys
- Contributors need Rust toolchain to work on frontend

---

## Current Monorepo Structure

```
percolator-launch/                          # ~66K LOC total
├── percolator/          (Rust, 4,887 LOC)  # Risk engine library crate
│   ├── src/percolator.rs                   # Core: RiskEngine, MatchingEngine trait, all invariants
│   ├── src/i128.rs                         # BPF-safe 128-bit types
│   └── tests/                              # 145 unit tests + 144 Kani proofs
├── program/             (Rust, 6,031 LOC)  # Solana on-chain program (BPF)
│   ├── src/percolator.rs                   # Instruction processor, CPI matcher, oracle, state
│   └── tests/                              # 38 unit tests + 163 Kani proofs
├── app/                 (Next.js, 36K LOC) # Frontend trading UI
│   ├── app/                                # App router pages + API routes
│   ├── components/                         # React components (trade form, charts, wallet)
│   └── hooks/                              # useMarket, useWallet, usePrices, etc.
├── packages/
│   ├── api/             (TS, 5.7K LOC)     # Hono API server (Railway)
│   ├── core/            (TS, 6.5K LOC)     # SDK: instructions, accounts, IDL, codegen
│   ├── indexer/         (TS, 2.7K LOC)     # Geyser/WS indexer (Railway)
│   ├── keeper/          (TS, 2.8K LOC)     # Crank + liquidation keeper (Railway)
│   └── shared/          (TS, 5K LOC)       # Shared types, utils, DB client
├── e2e/                                    # Playwright E2E tests
├── docs/                                   # Architecture, audits, plans
└── mocks/                                  # MSW test mocks
```

---

## Sprint 2 Changes (context for split decisions)

All Sprint 2 work lives in the **Rust risk engine** — this is why splitting it cleanly is critical:

| PR | Feature | Where it lives | Impact on split |
|---|---|---|---|
| #311 | PERC-119: Hyperp EMA mark price | `program/src/percolator.rs` (LpRiskState) | Stays in risk-engine repo |
| #315 | PERC-121: Premium funding rate | `percolator/src/percolator.rs` (RiskEngine) | Stays in risk-engine repo |
| #317 | PERC-122: Partial liquidation | `percolator/src/percolator.rs` (RiskEngine) | Stays in risk-engine repo |
| #319 | PERC-120: Dynamic fee model | `percolator/src/percolator.rs` (RiskEngine) | Stays in risk-engine repo |
| #321 | PERC-136: Security blockers | `percolator/` + `program/` (both) | Stays in risk-engine repo |
| #344 | Kani proof strengthening | `percolator/tests/kani.rs` | Stays in risk-engine repo |
| #326-328 | Privy SSR fix chain | `app/components/providers/` | Goes to app repo |
| #330 | RPC proxy fix | `app/lib/config.ts` | Goes to app repo |
| #334 | Test reliability | `app/`, `e2e/` | Goes to app repo |
| #337 | WebSocket endpoint | `app/lib/config.ts` | Goes to app repo |
| #338 | Code quality | `app/`, `e2e/` | Goes to app repo |

**Key insight:** Sprint 2 proves the Rust and TS codebases are already naturally separated. No Sprint 2 PR touched both Rust and TS.

---

## Proposed Repos (7 repos)

### 1. `percolator-risk-engine` 🔴 (Rust — core protocol)

**What:** The formally verified risk engine + Solana program. The "brain" of the protocol.

```
percolator-risk-engine/
├── percolator/          # Risk engine library crate
│   ├── src/             # RiskEngine, MatchingEngine trait, invariants
│   └── tests/           # 145 unit + 151 Kani proofs
├── program/             # Solana BPF program crate  
│   ├── src/             # Instruction processor, CPI, oracle, state
│   └── tests/           # 38 unit + 163 Kani proofs
├── Cargo.toml           # Workspace root
└── docs/                # Audit reports, formal verification docs
```

**Why together:** `program/Cargo.toml` depends on `percolator` via `path = "../percolator"`. They share types, compile together, and are deployed as a single Solana program.

**Contains ALL Sprint 2 core features:**
- EMA mark price (PERC-119)
- Premium funding rate (PERC-121)
- Partial liquidation (PERC-122)
- Dynamic fees (PERC-120)
- Security hardening (PERC-136)
- 307+ Kani formal verification proofs

**CI:** `cargo test`, `cargo build-sbf`, `cargo kani` (formal verification)  
**Deploy:** `solana program deploy` (manual / scripted)

---

### 2. `percolator-matcher` 🟡 (Rust — matcher program template)

**What:** Reference implementation of the `MatchingEngine` CPI interface. This is what LP operators deploy as their pricing/matching program.

```
percolator-matcher/
├── src/
│   ├── lib.rs           # Matcher program entry point
│   ├── amm.rs           # Reference AMM (constant product or similar)
│   └── abi.rs           # CPI ABI: request/response structs
├── tests/
│   ├── unit.rs          # AMM math tests
│   └── integration.rs   # Integration tests against risk engine
├── Cargo.toml
└── README.md            # "How to build your own matcher"
```

**Architecture:**
- The risk engine calls the matcher via CPI: `invoke_signed_trade()`
- Matcher receives: `(lp_account_id, oracle_price, requested_size)`
- Matcher returns: `(exec_price, exec_size, flags)`
- Risk engine validates: no overfill, price within bounds, sign correct, ABI version matches

**Why separate:** Different operators deploy different matchers. The reference is a template, not part of the core protocol. Third-party LPs fork this and customize pricing logic.

**Contains:** The `CpiMatcher` ABI spec currently embedded in `program/src/percolator.rs` lines 3245-3260. The ABI structs (request/response) get extracted into a shared crate.

**CI:** `cargo test`, integration tests against risk-engine  
**Deploy:** Per-LP deployment

---

### 3. `percolator-sdk` 📦 (TypeScript — client library)

**What:** The TypeScript SDK for interacting with Percolator on-chain programs.

```
percolator-sdk/
├── src/
│   ├── instructions/    # Transaction builders
│   ├── accounts/        # Account deserializers
│   ├── types/           # Generated types from IDL
│   └── index.ts         # Public API
├── package.json         # @percolator/sdk
└── tsconfig.json
```

**Current location:** `packages/core/` (6.5K LOC)

**Why first to split:** Everything depends on it — app, API, indexer, keeper. Must be on npm before other repos can consume it.

**Publish:** npm as `@percolator/sdk`  
**CI:** `pnpm test`, `pnpm build`, npm publish on tag

---

### 4. `percolator-app` 🟢 (Next.js — frontend)

**What:** The trading UI deployed to Vercel.

```
percolator-app/
├── app/                 # Next.js app router
├── components/          # React components
├── hooks/               # Custom hooks
├── lib/                 # Config, utils
├── e2e/                 # Playwright tests
├── mocks/               # MSW mocks
└── package.json         # Depends on @percolator/sdk
```

**Current location:** `app/` (36K LOC) + `e2e/` + `mocks/`

**Contains all Sprint 2 frontend fixes:**
- Privy SSR fix chain (#326-328)
- RPC proxy + WebSocket endpoint (#330, #337)
- Test reliability (#334, #338)

**CI:** `pnpm build`, `pnpm test`, Playwright E2E  
**Deploy:** Vercel (auto-deploy on push)

---

### 5. `percolator-backend` 🔵 (TypeScript — API + indexer + keeper)

**What:** All backend services deployed to Railway.

```
percolator-backend/
├── packages/
│   ├── api/             # Hono API server (5.7K LOC)
│   ├── indexer/         # Geyser/WS indexer (2.7K LOC)
│   ├── keeper/          # Crank + liquidation keeper (2.8K LOC)
│   └── shared/          # Shared types, DB client (5K LOC)
├── pnpm-workspace.yaml
└── package.json
```

**⚠️ Keeper dedup needed first:** There's keeper logic in both `packages/keeper/` AND scattered in `app/`. Must consolidate before split.

**CI:** `pnpm test`, `pnpm build`  
**Deploy:** Railway (3 services: api, indexer, keeper)

---

### 6. `percolator-docs` 📝 (optional — documentation)

**What:** Architecture docs, API reference, guides, audit reports.

```
percolator-docs/
├── architecture/
├── api-reference/
├── guides/
├── audits/
└── plans/
```

**Decision needed:** Keep docs in each repo (closer to code) or centralize? Recommendation: keep architecture/audit docs centralized, API docs co-located.

---

### 7. `percolator-deploy` 🛠️ (optional — infra/scripts)

**What:** Deployment scripts, CI/CD configs, environment management.

```
percolator-deploy/
├── scripts/
│   ├── deploy-program.sh
│   ├── deploy-matcher.sh
│   └── upgrade-idl.sh
├── environments/
│   ├── devnet.env
│   └── mainnet.env
└── README.md
```

**Decision needed:** Separate repo or just scripts in each repo?

---

## Migration Phases

### Phase 1: SDK First (Week 1)
1. Extract `packages/core/` → `percolator-sdk`
2. Publish to npm as `@percolator/sdk@0.1.0`
3. Update `app/`, `packages/api/`, `packages/indexer/`, `packages/keeper/` to import from npm
4. Verify all builds pass with npm dependency

### Phase 2: Risk Engine (Week 1-2)
1. Extract `percolator/` + `program/` → `percolator-risk-engine`
2. Move all Kani proofs, cargo tests, audit docs
3. Set up `cargo build-sbf` CI
4. Verify 307 Kani proofs compile in new repo

### Phase 3: Matcher Template (Week 2)
1. Extract CPI ABI structs from `program/src/percolator.rs`
2. Create `percolator-matcher` with reference AMM implementation
3. Shared ABI crate consumed by both risk-engine and matcher
4. Integration tests: matcher ↔ risk engine

### Phase 4: Backend (Week 2-3)
1. **Dedup keeper logic first** (consolidate into `packages/keeper/`)
2. Extract `packages/` → `percolator-backend`
3. Update Railway service configs
4. Verify all 3 services deploy correctly

### Phase 5: Frontend (Week 3)
1. Extract `app/` + `e2e/` + `mocks/` → `percolator-app`
2. Update Vercel project settings
3. Verify E2E tests pass in new repo
4. Redirect GitHub branch protections

### Phase 6: Cleanup
1. Archive `percolator-launch` monorepo (read-only)
2. Update all GitHub Actions, branch protections
3. Update Discord bot webhooks per-repo
4. Update docs with new repo links

---

## Dependency Graph (post-split)

```
percolator-risk-engine ──── (Cargo path dep) ──── percolator-matcher
         │                                              │
         │ (IDL / types)                                │
         ▼                                              │
   percolator-sdk (npm) ◄──────────────────────────────┘
         │
    ┌────┴────┐
    ▼         ▼
percolator  percolator
   -app      -backend
```

---

## Decision Points for Khubair

1. **Matcher repo:** Create reference matcher now, or defer until we have LP partners?
2. **npm scope:** `@percolator/sdk` or different name?
3. **Backend structure:** Monorepo (recommended) or separate repos per service?
4. **Docs repo:** Centralized or distributed?
5. **Deploy repo:** Separate or scripts-in-each-repo?
6. **Visibility:** Which repos public vs private?
7. **Timeline:** Start now or after mainnet?
8. **Keeper dedup:** Prioritize before backend split?

---

## Risks

| Risk | Mitigation |
|---|---|
| CI breaks during migration | Keep monorepo working until each split is verified |
| npm publish permissions | Set up GitHub Actions with npm token early |
| Cargo path dep breaks | Shared ABI crate with version pinning |
| Railway deploy config | Test in staging environment first |
| Vercel env vars | Document all required env vars per repo |
| Cross-repo PRs harder | Clear API boundaries, SDK versioning |
