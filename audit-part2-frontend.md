# Percolator Launch — Frontend Audit (Part 2)

**Date:** 2026-02-17  
**Branch:** `cobra/feature/new-backend`  
**Scope:** `app/` — all pages, hooks, components, transaction flows  
**Auditor:** Cobra (automated)

---

## Executive Summary

The frontend is well-architected with good UX polish (GSAP animations, error boundaries, loading states, mobile layouts). However, there are **critical transaction safety issues**, **state management gaps**, and **several user experience rough edges** that could cause fund loss or confusion.

**Critical:** 3 | **High:** 8 | **Medium:** 12 | **Low:** 9

---

## Findings

| ID | Severity | Category | Title | Location | Description | Impact | Attack Scenario | Fix |
|----|----------|----------|-------|----------|-------------|--------|----------------|-----|
| F-CRIT-1 | 🔴 Critical | Transactions | Multi-tx market creation has no rollback | hooks/useCreateMarket.ts:150-300 | Market creation is 6 sequential transactions. If tx 2-5 fails, slab account is created but market is in a broken half-initialized state. Rent SOL is locked. The retry mechanism requires the keypair ref which is lost on page refresh. | Users lose 0.5-7 SOL in rent for broken markets. No way to reclaim. | User creates market, tx 3 fails, refreshes page → keypair lost → cannot retry → SOL permanently locked in unusable slab account. | 1) Persist slab keypair to localStorage (encrypted) for retry across sessions. 2) Add a "reclaim rent" admin function. 3) Consider combining txs using lookup tables. |
| F-CRIT-2 | 🔴 Critical | Transactions | Helius API key exposed in client bundle | lib/config.ts:1-5 | `NEXT_PUBLIC_HELIUS_API_KEY` is in the client bundle. Comment says "acceptable for devnet" but mainnet config also uses it. | API key abuse, rate limiting, cost overruns on mainnet. | Attacker extracts key from JS bundle, uses it for their own RPC calls at your expense. | Implement `/api/rpc` server-side proxy before mainnet. Remove NEXT_PUBLIC prefix. |
| F-CRIT-3 | 🔴 Critical | Transactions | No network mismatch detection | lib/tx.ts, hooks/useTrade.ts | No check that wallet network matches app network. User on mainnet wallet with devnet app sends txs to wrong chain. useDeposit/useWithdraw have partial checks (getAccountInfo) but useTrade does not. | Funds sent to wrong network or confusing errors. | User has mainnet wallet connected, app is on devnet. Trade tx builds with devnet program ID but wallet signs for mainnet → tx fails with obscure error. | Add a `validateNetwork()` check in sendTx that compares wallet's genesis hash to expected RPC endpoint. |
| F-HIGH-1 | 🟠 High | State | useInsuranceLP refresh has stale closure | hooks/useInsuranceLP.ts:130-136 | `useEffect` with empty deps `[]` captures `refreshState` at mount time. If slabState or lpMintInfo changes, the interval still calls the stale version. Comment says "Empty deps — refreshState captured at mount". | Insurance LP state never updates after initial load if dependencies change. | User navigates between markets → insurance data shows stale values from first market visited. | Use a ref for refreshState or include it in deps with proper memoization. |
| F-HIGH-2 | 🟠 High | UX | Trade form blocks new trades when position exists | components/trade/TradeForm.tsx:280-290 | If user has an open position, the entire trade form is replaced with "Close your position before opening a new one." No close button provided. User must find the Position panel. | Users can't quickly close positions or adjust them. Confusing flow. | First-time user opens a trade, wants to close it, sees the message but no action button → frustrated. | Add a "Close Position" button directly in the trade form when position exists. |
| F-HIGH-3 | 🟠 High | Transactions | Priority fee hardcoded at 100k µLamports | lib/tx.ts:8 | `PRIORITY_FEE` defaults to 100,000 µLamports. Env var override exists but isn't documented. During congestion this may be too low; during calm periods it wastes SOL. | Trades fail during congestion or users overpay in fees. | Network congestion → all trades fail with "blockhash expired" because priority fee too low → users think platform is broken. | Implement dynamic priority fee estimation (getRecentPrioritizationFees) or at minimum document the env var. |
| F-HIGH-4 | 🟠 High | State | SlabProvider polls every 3s without throttling | components/providers/SlabProvider.tsx:80-110 | When WebSocket is unavailable (common), SlabProvider polls RPC every 3s. With multiple tabs or markets, this creates heavy RPC load. | Helius rate limits hit, degraded performance. | User opens 5 market tabs → 5 × every 3s = 100 RPC calls/min from one user. | Increase poll interval to 5-10s when no active trades. Add visibility API pause (partially done but only for immediate re-poll). |
| F-HIGH-5 | 🟠 High | UX | No confirmation dialog before trade execution | components/trade/TradeForm.tsx:300-330 | `handleTrade()` executes immediately on button click. No confirmation step showing final position size, fees, liquidation price. PreTradeSummary exists but it's informational only — not a gate. | Users accidentally submit trades, especially on mobile. | User fat-fingers 10x leverage instead of 1x, hits trade button → immediately executes with 10x the intended exposure. | Add OrderConfirm modal (component exists but unused in TradeForm) as a required step before execution. |
| F-HIGH-6 | 🟠 High | Security | Admin actions have no client-side auth verification | hooks/useAdminActions.ts | Actions check `wallet.publicKey` exists but don't verify the connected wallet IS the market admin before sending tx. Tx will fail on-chain but user wastes gas. | Users waste SOL on guaranteed-to-fail admin transactions. | Non-admin user clicks "push price" → pays tx fee → gets confusing error. | Check `wallet.publicKey === config.adminAuthority` before building tx. Show "not admin" error immediately. |
| F-HIGH-7 | 🟠 High | Transactions | Polling confirmation can hang for 90s with no cancel | lib/tx.ts:20-40 | `pollConfirmation` loops for 90s with no abort mechanism. User cannot cancel a stuck confirmation. UI shows "confirming..." indefinitely. | User trapped in loading state for 90s, may think tx failed and retry (double-spend risk). | Network congestion → tx lands in 60s → user gives up at 45s, refreshes, submits again → now has duplicate position. | Add AbortController support, show elapsed time, allow user to dismiss (with warning tx may still land). |
| F-HIGH-8 | 🟠 High | UX | Portfolio fetches ALL markets sequentially | hooks/usePortfolio.ts:45-80 | For each discovered market, fetches the full slab data sequentially to scan for user accounts. With 50+ markets, this takes 30+ seconds. | Portfolio page unusable at scale. | Platform grows to 100 markets → portfolio takes 2+ minutes to load → users assume it's broken. | Use backend API to index user positions. Or batch slab fetches with getMultipleAccountsInfo. |
| F-MED-1 | 🟡 Medium | UX | Landing page stats from Supabase with no error state | app/page.tsx:130-145 | `loadStats()` catches errors but only console.errors. Stats section shows 0/0/0 on failure — misleading. | Users see "0 Markets Live" and think platform is dead. | Supabase down → landing page shows all zeros → new users bounce. | Show "—" or hide stats section entirely on error. |
| F-MED-2 | 🟡 Medium | UX | Markets page shows mock data in development | app/markets/page.tsx:55-70 | 10 hardcoded mock markets (SOL, USDC, WIF, etc.) displayed when no real markets exist in dev. Mock data has fake slab addresses that link to broken trade pages. | Developers confused by mock data, potentially shown in staging. | Dev deploys to staging without `NODE_ENV=production` → users see fake markets. | Gate mock data behind explicit `NEXT_PUBLIC_MOCK_MODE=true` flag instead of NODE_ENV. |
| F-MED-3 | 🟡 Medium | UX | Create wizard doesn't show token balance check until late | components/create/CreateMarketWizard.tsx:270 | Token balance is checked only after user configures all parameters. If they have 0 tokens, they've wasted time. | Poor UX for new users who don't have tokens yet. | New user pastes mint → configures everything → sees "No Tokens — Mint First" at the end. | Check balance immediately after mint validation, show warning early. |
| F-MED-4 | 🟡 Medium | State | useLivePrice WebSocket connects even when not on trade page | hooks/useLivePrice.ts | WebSocket connects whenever SlabProvider is mounted, even on My Markets or Portfolio pages that also use SlabProvider. | Unnecessary WebSocket connections. | N/A (performance) | Only connect WebSocket when a component actually needs live prices (e.g., via an explicit opt-in). |
| F-MED-5 | 🟡 Medium | UX | Devnet mint page has no mainnet guard | app/devnet-mint/devnet-mint-content.tsx | If user switches to mainnet, the page still allows creating test tokens on mainnet (hardcoded to devnet RPC). Confusing but not destructive since it uses Helius devnet URL. | Confusion when network doesn't match. | User on mainnet clicks devnet mint → tx builds against devnet RPC but wallet may be on mainnet → failure or wasted SOL. | Check `getConfig().network` and show "Devnet only" warning/redirect on mainnet. |
| F-MED-6 | 🟡 Medium | Code Quality | Duplicate CodeBlock component | app/components/ui/CodeBlock.tsx, app/app/components/ui/CodeBlock.tsx | Two CodeBlock.tsx files exist in different paths. | Maintenance burden, potential import confusion. | N/A | Remove the duplicate under app/app/components/. |
| F-MED-7 | 🟡 Medium | UX | TradeForm enter-key-to-trade with no confirmation | components/trade/TradeForm.tsx:310 | `onKeyDown` handler submits trade on Enter key. Combined with no confirmation dialog, this is dangerous. | Accidental trade submission while typing. | User types margin amount, hits Enter to "confirm" the input → trade executes immediately at current leverage. | Remove Enter-to-trade or require confirmation dialog. |
| F-MED-8 | 🟡 Medium | State | `as any` casts in multiple files | hooks/useInsuranceLP.ts, hooks/usePortfolio.ts, lib/config.ts | Several `as any` casts for config access and parsed account info. | Type safety holes, potential runtime errors. | N/A | Define proper types for config extensions and parsed Solana account data. |
| F-MED-9 | 🟡 Medium | UX | My Markets page card is dense and overwhelming | app/my-markets/page.tsx | Market card shows 8 stats + 8+ action buttons all at once. No progressive disclosure. | Admin users confused by options, especially new market creators. | First-time creator sees "burn admin key" next to "push price" → accidentally clicks wrong action. | Group actions by risk level. Put destructive actions behind "Advanced" toggle. |
| F-MED-10 | 🟡 Medium | Transactions | useTrade prepends oracle push + crank (3 IXs) | hooks/useTrade.ts:60-100 | Every trade bundles up to 3 instructions (push price + crank + trade). This increases CU cost and failure surface. If the oracle push fails, the whole trade fails. | Higher failure rate and gas costs for every trade. | Oracle push fails for non-authority user → entire trade tx rejected → confusing error. | Only include push price IX when user IS the oracle authority (already partially done, but verify edge cases). |
| F-MED-11 | 🟡 Medium | UX | No empty state for trade history | components/trade/TradeHistory.tsx (referenced) | Trade history tab likely shows empty/blank when no trades exist. | Confusing for new users. | New user visits trade page → clicks "Trades" tab → blank space. | Show "No trades yet" message with explanation. |
| F-MED-12 | 🟡 Medium | State | Insurance LP mint info derived client-side | hooks/useInsuranceLP.ts:80-95 | PDA derivation happens on every render (memoized but depends on slabAddress string). Multiple RPC calls to check mint existence and user balance. | Redundant RPC calls on every poll cycle. | N/A | Cache mint existence check; only re-check after user actions. |
| F-LOW-1 | 🟢 Low | Code Quality | gsap imported on landing page | app/page.tsx:3 | gsap is a heavy library (~30KB gzipped) imported on the landing page for simple stagger animations. | Bundle size impact on first load. | N/A | Use CSS animations or dynamically import gsap. |
| F-LOW-2 | 🟢 Low | UX | Music player on every page | app/layout.tsx:30 | MusicPlayer component mounted globally. Likely loads audio file on every page. | Unnecessary resource loading. | N/A | Lazy-load MusicPlayer only when user interacts with it. |
| F-LOW-3 | 🟢 Low | Code Quality | 6 Google Fonts loaded | app/layout.tsx:7-12 | Geist, Geist_Mono, Space_Grotesk, JetBrains_Mono, Inter_Tight, Outfit all loaded. | Significant font download time (~200KB+). | N/A | Reduce to 2-3 fonts. Most are used for tiny labels. |
| F-LOW-4 | 🟢 Low | UX | CursorGlow rendered on mobile | app/layout.tsx:28 | CursorGlow component (desktop hover effect) mounted on all devices. | Unnecessary DOM elements on mobile. | N/A | Only mount on desktop or use CSS `pointer: fine` media query. |
| F-LOW-5 | 🟢 Low | Code Quality | `require()` in client component | app/create/page.tsx:17 | `const { PublicKey } = require("@solana/web3.js")` used instead of import. | Breaks tree-shaking, non-standard in ESM. | N/A | Use dynamic `import()` or move validation to a utility function. |
| F-LOW-6 | 🟢 Low | UX | Error pages are minimal | app/error.tsx, app/global-error.tsx | Error boundary pages likely show generic messages with no recovery guidance. | Users hit errors with no path forward. | N/A | Add "Try again" button, link to status page, and error reporting. |
| F-LOW-7 | 🟢 Low | State | useTokenMeta uses `mint?.toBase58()` in deps | hooks/useTokenMeta.ts:20 | Calling `.toBase58()` on every render for dependency comparison. Should be memoized or stabilized. | Minor unnecessary re-renders. | N/A | Stabilize with useMemo or store string representation. |
| F-LOW-8 | 🟢 Low | UX | Featured markets table not responsive on small screens | app/page.tsx:350 | `min-w-[480px]` forces horizontal scroll on very small screens. | Poor mobile experience on landing page. | N/A | Use card layout instead of table on mobile. |
| F-LOW-9 | 🟢 Low | Code Quality | Commented-out LP validation in TradeForm | components/trade/TradeForm.tsx:265-275 | Large block of commented code for LP matcher context validation. | Code clutter, unclear if needed. | N/A | Remove commented code; the check is documented in useTrade.ts comments. |

---

## User Flow Analysis (BONK Perp Market Creator Perspective)

### Landing Page → Create Market
✅ Clear CTA, good visual hierarchy  
⚠️ Stats show zeros if Supabase is down  
⚠️ No mention of SOL cost upfront (only visible after entering wizard)

### Quick Launch Wizard
✅ Auto-detects token metadata and DEX pools  
✅ Good defaults based on liquidity tier  
⚠️ If no DEX pool found, falls back to "admin oracle" with no explanation of what that means  
⚠️ Multi-tx creation (6 txs!) with no atomicity  
❌ Keypair lost on page refresh = SOL locked forever  

### Trade Page
✅ Clean dual-column desktop layout  
✅ Mobile-first collapsible sections  
✅ Good loading/error states  
⚠️ No trade confirmation dialog  
❌ Can't close positions from trade form  
⚠️ Quick start guide disappears after first trade but doesn't explain the flow well enough  

### My Markets
✅ All admin actions available  
⚠️ Too many actions visible at once  
✅ Good burn confirmation (requires typing "BURN")  
✅ Pause/unpause market works  

### Portfolio
✅ Cross-market position view  
❌ Scales terribly (sequential slab fetches)  
✅ Auto-refresh every 15s  

### Devnet Mint
✅ Full token creation with metadata  
✅ Airdrop + web faucet fallback  
✅ Mint more feature for existing tokens  
✅ Logo upload after creation  

---

## Recommendations (Priority Order)

1. **Persist slab keypair** for market creation retry (F-CRIT-1)
2. **Add `/api/rpc` proxy** before mainnet (F-CRIT-2)
3. **Network mismatch guard** in sendTx (F-CRIT-3)
4. **Trade confirmation dialog** using existing OrderConfirm component (F-HIGH-5)
5. **Close position button** in TradeForm when position exists (F-HIGH-2)
6. **Dynamic priority fees** (F-HIGH-3)
7. **Backend-indexed portfolio** (F-HIGH-8)
8. **Fix useInsuranceLP stale closure** (F-HIGH-1)
