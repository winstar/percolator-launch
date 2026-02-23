# Solflare In-App Debug + Deep-Link Design

**Goal:** Provide an on-screen debug panel to confirm wallet injection in Solflare’s in-app browser and add a Solflare deep-link fallback to open the current page inside Solflare.

**Context & Problem:** Solflare in-app browser still shows “download app” despite being inside Solflare, while Phantom and Jupiter work. This indicates Solflare’s injection is not being detected by Privy’s modal. We need instrumentation to confirm what the browser actually exposes, plus a fallback link to open the current page in Solflare using their official browse deep-link.

**Approach:**
- Add a `WalletDebugPanel` component that renders only when `?walletDebug=1` (or `true`) is present in the URL. The panel shows:
  - `navigator.userAgent`
  - `window.solflare` presence
  - `window.solana?.isSolflare`
  - `window.phantom?.solana?.isPhantom`
  - `window.solana?.isPhantom`
- The panel includes a “Copy debug info” button and a “Open in Solflare” button.
- Add a reusable helper `buildSolflareBrowseUrl(currentUrl, ref)` to produce Solflare’s deep-link format.
- Add a compact “Open in Solflare” link in the header connect area for mobile or debug mode, using the helper.

**Data Flow:**
- `WalletDebugPanel` reads `useSearchParams` to determine debug mode.
- Debug info is computed client-side (guarded by `typeof window !== 'undefined'`).
- Deep-link button uses `buildSolflareBrowseUrl(window.location.href, window.location.origin)`.

**Error Handling:**
- If `window` is unavailable (SSR), debug panel returns null.
- If deep-link cannot be built (empty URL), button is disabled.

**Testing:**
- Unit test for `buildSolflareBrowseUrl`.
- Component test for `WalletDebugPanel` rendering only when `walletDebug=1`.
- ConnectButton test verifying deep-link appears in debug mode (unauthenticated).
