# RPC, Wallet Picker, and Privy Management Design

## Summary
Fix RPC routing so the frontend consistently uses the Helius proxy, implement an installed-first wallet picker, and add Privy wallet management (export + fund) in both the connect dropdown and a dedicated wallet page.

## Architecture
- Single RPC source of truth in `app/lib/config.ts` via `getRpcEndpoint()` returning an absolute URL.
- Client RPC always points to `/api/rpc` (absolute), server RPC honors `NEXT_PUBLIC_HELIUS_RPC_URL` or `HELIUS_API_KEY` before any public fallback.
- Wallet UX split into two layers: custom installed-first picker plus Privy’s built-in modal for broader wallet coverage.
- Wallet management exposed via Privy modal actions on both dropdown and `/wallet` page.

## Components
- `app/lib/config.ts`: add `getRpcEndpoint()` and update `getConfig().rpcUrl` to always return absolute URL.
- `app/hooks/useWalletCompat.ts`: use `getRpcEndpoint()` directly; remove public devnet fallback.
- `app/app/api/rpc/route.ts` + `app/app/api/health/route.ts`: align RPC resolution with same env priority order.
- `app/components/providers/PrivyProviderClient.tsx`: set `appearance.walletList` ordering for installed-first baseline.
- `app/components/wallet/ConnectButton.tsx`: add custom installed-first picker, manage actions, and link to `/wallet`.
- New page `app/app/wallet/page.tsx` for full management UI.

## Data Flow
- Client JSON-RPC: web3.js -> absolute `/api/rpc` -> Helius.
- Wallet selection: user clicks connect -> custom picker detects installed wallets -> calls `useConnectWallet` with `walletList` override -> Privy modal handles auth/connect.
- Wallet management: actions call `exportWallet()` and `fundWallet()`; gated by wallet type and network.

## Error Handling
- If Privy unavailable or not ready, show disabled connect state.
- If export not allowed (no embedded wallet), show disabled action with helper text.
- Funding disabled on devnet or if Privy returns an error.

## Testing
- Unit tests for `getRpcEndpoint()` precedence.
- Update wallet tests to validate ordering and installed-first rendering.
- Smoke test `/api/rpc` hits Helius and `/wallet` actions open Privy modals.
