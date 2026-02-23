# RPC + Wallet UX Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ensure the frontend uses the Helius RPC proxy consistently, show installed wallets first in the connect flow, and add Privy wallet management (export/fund) in both the connect dropdown and a dedicated `/wallet` page.

**Architecture:** Add a single `getRpcEndpoint()` helper in `app/lib/config.ts` that returns an absolute URL on the client and a server RPC URL on the server. Use a small wallet detection helper to power a custom installed-first picker in the connect dropdown, while also configuring Privy’s built-in wallet list ordering. Expose Privy wallet management via `exportWallet` and `fundWallet` actions.

**Tech Stack:** Next.js (App Router), React, TypeScript, Privy React SDK, Vitest + Testing Library.

---

### Task 1: Add tests for RPC endpoint resolution

**Files:**
- Create: `app/__tests__/lib/config.test.ts`
- Modify: `app/lib/config.ts`

**Step 1: Write the failing tests**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getRpcEndpoint } from "@/lib/config";

const originalEnv = { ...process.env };

function clearWindow() {
  // @ts-expect-error test helper
  delete globalThis.window;
}

describe("getRpcEndpoint", () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
    clearWindow();
  });

  it("returns absolute /api/rpc when running in browser", () => {
    vi.stubGlobal("window", { location: { origin: "https://example.com" } } as any);
    expect(getRpcEndpoint()).toBe("https://example.com/api/rpc");
  });

  it("prefers NEXT_PUBLIC_HELIUS_RPC_URL on the server", () => {
    clearWindow();
    process.env.NEXT_PUBLIC_HELIUS_RPC_URL = "https://devnet.helius-rpc.com/?api-key=abc";
    expect(getRpcEndpoint()).toBe("https://devnet.helius-rpc.com/?api-key=abc");
  });

  it("falls back to public devnet RPC when no Helius config provided", () => {
    clearWindow();
    delete process.env.NEXT_PUBLIC_HELIUS_RPC_URL;
    delete process.env.HELIUS_API_KEY;
    delete process.env.NEXT_PUBLIC_HELIUS_API_KEY;
    delete process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
    expect(getRpcEndpoint()).toBe("https://api.devnet.solana.com");
  });
});
```

**Step 2: Run the tests to confirm they fail**

Run: `pnpm -C app test -- app/__tests__/lib/config.test.ts`

Expected: FAIL (missing `getRpcEndpoint` export).

**Step 3: Implement the minimal production code**

Add to `app/lib/config.ts`:

```ts
export function getRpcEndpoint(): string {
  if (typeof window !== "undefined") {
    return new URL("/api/rpc", window.location.origin).toString();
  }

  const explicit = process.env.NEXT_PUBLIC_HELIUS_RPC_URL?.trim();
  if (explicit) return explicit;

  const apiKey = process.env.HELIUS_API_KEY ?? process.env.NEXT_PUBLIC_HELIUS_API_KEY ?? "";
  if (apiKey) {
    const net = process.env.NEXT_PUBLIC_DEFAULT_NETWORK?.trim();
    const network = net === "mainnet" ? "mainnet" : "devnet";
    return network === "mainnet"
      ? `https://mainnet.helius-rpc.com/?api-key=${apiKey}`
      : `https://devnet.helius-rpc.com/?api-key=${apiKey}`;
  }

  return process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
}
```

Update `getConfig()` to use `getRpcEndpoint()` for `rpcUrl` (remove `getRpcUrl` if unused).

**Step 4: Re-run tests to confirm pass**

Run: `pnpm -C app test -- app/__tests__/lib/config.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add app/lib/config.ts app/__tests__/lib/config.test.ts
git commit -m "test: add RPC endpoint resolution coverage"
```

---

### Task 2: Wire RPC endpoint helper into frontend + API routes

**Files:**
- Modify: `app/hooks/useWalletCompat.ts`
- Modify: `app/app/api/rpc/route.ts`
- Modify: `app/app/api/health/route.ts`
- Modify: `app/app/api/launch/route.ts`

**Step 1: Write failing test for Connection endpoint**

Add to `app/__tests__/hooks/useWallet.test.ts`:

```ts
it("useConnectionCompat uses the configured rpc endpoint", () => {
  vi.mock("@/lib/config", () => ({
    getConfig: () => ({ rpcUrl: "https://example.com/api/rpc", network: "devnet", programId: "test" }),
  }));

  const { result } = renderHook(() => useConnectionCompat());
  expect((result.current.connection as any)._rpcEndpoint).toBe("https://example.com/api/rpc");
});
```

**Step 2: Run test and confirm fail**

Run: `pnpm -C app test -- app/__tests__/hooks/useWallet.test.ts`

Expected: FAIL (still falling back to public devnet).

**Step 3: Implement minimal code**

In `app/hooks/useWalletCompat.ts`:

```ts
export function useConnectionCompat() {
  const connection = useMemo(() => {
    const url = getConfig().rpcUrl;
    return new Connection(url, "confirmed");
  }, []);

  return { connection };
}
```

In API routes, replace inline RPC URL logic with `getRpcEndpoint()` (server-side only). Example in `app/app/api/rpc/route.ts`:

```ts
import { getRpcEndpoint } from "@/lib/config";
const RPC_URL = getRpcEndpoint();
```

Use the same for `app/app/api/health/route.ts` and `app/app/api/launch/route.ts` so all server RPC lookups are consistent.

**Step 4: Re-run tests**

Run: `pnpm -C app test -- app/__tests__/hooks/useWallet.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add app/hooks/useWalletCompat.ts app/app/api/rpc/route.ts app/app/api/health/route.ts app/app/api/launch/route.ts app/__tests__/hooks/useWallet.test.ts
git commit -m "fix: route RPC usage through shared helper"
```

---

### Task 3: Add wallet detection + wallet list ordering helpers

**Files:**
- Create: `app/lib/wallets.ts`
- Create: `app/__tests__/lib/wallets.test.ts`

**Step 1: Write failing tests**

```ts
import { describe, it, expect } from "vitest";
import { getInstalledWalletIds, getPrivyWalletList } from "@/lib/wallets";

describe("wallet helpers", () => {
  it("returns installed wallet ids in preferred order", () => {
    const detector = { phantom: true, solflare: false, backpack: true };
    expect(getInstalledWalletIds(detector)).toEqual(["phantom", "backpack"]);
  });

  it("returns empty array when nothing installed", () => {
    const detector = { phantom: false, solflare: false, backpack: false };
    expect(getInstalledWalletIds(detector)).toEqual([]);
  });

  it("returns the configured Privy wallet list", () => {
    expect(getPrivyWalletList()).toEqual([
      "detected_solana_wallets",
      "phantom",
      "solflare",
      "backpack",
      "wallet_connect",
    ]);
  });
});
```

**Step 2: Run tests to confirm fail**

Run: `pnpm -C app test -- app/__tests__/lib/wallets.test.ts`

Expected: FAIL (module missing).

**Step 3: Implement minimal helper**

```ts
export type InstalledWalletDetector = {
  phantom: boolean;
  solflare: boolean;
  backpack: boolean;
};

const ORDER: (keyof InstalledWalletDetector)[] = ["phantom", "solflare", "backpack"];

export function getInstalledWalletIds(detector: InstalledWalletDetector): string[] {
  return ORDER.filter((key) => detector[key]);
}

export function getPrivyWalletList(): string[] {
  return [
    "detected_solana_wallets",
    "phantom",
    "solflare",
    "backpack",
    "wallet_connect",
  ];
}

export function defaultWalletDetector(): InstalledWalletDetector {
  if (typeof window === "undefined") {
    return { phantom: false, solflare: false, backpack: false };
  }
  return {
    phantom: !!(window as any).phantom?.solana?.isPhantom,
    solflare: !!(window as any).solflare?.isSolflare,
    backpack: !!(window as any).backpack?.isBackpack,
  };
}
```

**Step 4: Re-run tests to confirm pass**

Run: `pnpm -C app test -- app/__tests__/lib/wallets.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add app/lib/wallets.ts app/__tests__/lib/wallets.test.ts
git commit -m "feat: add wallet detection helpers"
```

---

### Task 4: Apply wallet list ordering to Privy provider

**Files:**
- Modify: `app/components/providers/PrivyProviderClient.tsx`

**Step 1: Write failing test for walletList ordering**

Add to `app/__tests__/components/PrivyProviderClient.test.tsx` (new):

```ts
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("@privy-io/react-auth", () => ({
  PrivyProvider: ({ children, config }: any) => (
    <div data-walletlist={JSON.stringify(config.appearance.walletList)}>{children}</div>
  ),
  usePrivy: () => ({ login: vi.fn() }),
}));

vi.mock("@privy-io/react-auth/solana", () => ({
  toSolanaWalletConnectors: () => [],
}));

import PrivyProviderClient from "@/components/providers/PrivyProviderClient";

it("passes ordered walletList into PrivyProvider", () => {
  const { container } = render(
    <PrivyProviderClient appId="test">child</PrivyProviderClient>
  );
  expect(container.querySelector("div")?.getAttribute("data-walletlist")).toContain("detected_solana_wallets");
});
```

**Step 2: Run test to confirm fail**

Run: `pnpm -C app test -- app/__tests__/components/PrivyProviderClient.test.tsx`

Expected: FAIL (walletList not passed).

**Step 3: Implement minimal code**

In `app/components/providers/PrivyProviderClient.tsx`, import `getPrivyWalletList` and set:

```ts
appearance: {
  walletChainType: "solana-only",
  showWalletLoginFirst: true,
  walletList: getPrivyWalletList(),
},
```

**Step 4: Re-run tests**

Run: `pnpm -C app test -- app/__tests__/components/PrivyProviderClient.test.tsx`

Expected: PASS.

**Step 5: Commit**

```bash
git add app/components/providers/PrivyProviderClient.tsx app/__tests__/components/PrivyProviderClient.test.tsx
git commit -m "feat: order Privy wallet list"
```

---

### Task 5: Add custom installed-first picker + wallet management actions to ConnectButton

**Files:**
- Modify: `app/components/wallet/ConnectButton.tsx`
- Modify: `app/hooks/usePrivySafe.ts` (if needed for new context helpers)
- Create: `app/__tests__/components/ConnectButton.test.tsx`

**Step 1: Write failing tests**

```ts
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";

vi.mock("@/hooks/usePrivySafe", () => ({ usePrivyAvailable: () => true }));
vi.mock("@/lib/wallets", () => ({
  defaultWalletDetector: () => ({ phantom: true, solflare: true, backpack: false }),
  getInstalledWalletIds: () => ["phantom", "solflare"],
  getPrivyWalletList: () => ["detected_solana_wallets", "phantom", "solflare", "wallet_connect"],
}));

const mockConnectWallet = vi.fn();
const mockFundWallet = vi.fn();
const mockExportWallet = vi.fn();
const mockLogout = vi.fn();

vi.mock("@privy-io/react-auth", () => ({
  usePrivy: () => ({ ready: true, authenticated: true, user: { linkedAccounts: [] }, logout: mockLogout, exportWallet: mockExportWallet, connectWallet: mockConnectWallet }),
}));
vi.mock("@privy-io/react-auth/solana", () => ({
  useWallets: () => ({ wallets: [{ address: "1111", standardWallet: { name: "Phantom" } }] }),
  useFundWallet: () => ({ fundWallet: mockFundWallet }),
}));

import { ConnectButton } from "@/components/wallet/ConnectButton";

describe("ConnectButton", () => {
  it("shows manage actions when authenticated", () => {
    const { getByText } = render(<ConnectButton />);
    fireEvent.click(getByText("Connect"));
    expect(getByText("Manage Wallet")).toBeTruthy();
    expect(getByText("Disconnect")).toBeTruthy();
  });
});
```

**Step 2: Run tests to confirm fail**

Run: `pnpm -C app test -- app/__tests__/components/ConnectButton.test.tsx`

Expected: FAIL (menu items missing).

**Step 3: Implement minimal code**

Update `ConnectButton` to:
- Use `connectWallet` from `usePrivy()` and `fundWallet` from `useFundWallet()`.
- Show a connect menu when not authenticated with installed wallets first.
- Add “Manage Wallet” (link to `/wallet`), “Export Key” (disabled unless embedded wallet present), and “Add Funds” (disabled on devnet) in the authenticated menu.
- Use `getPrivyWalletList()` as the fallback wallet list for `connectWallet`.

Use `exportWallet({ address })` when an embedded wallet exists and address is known.

**Step 4: Re-run tests**

Run: `pnpm -C app test -- app/__tests__/components/ConnectButton.test.tsx`

Expected: PASS.

**Step 5: Commit**

```bash
git add app/components/wallet/ConnectButton.tsx app/__tests__/components/ConnectButton.test.tsx
git commit -m "feat: add installed-first connect menu and wallet actions"
```

---

### Task 6: Add `/wallet` management page

**Files:**
- Create: `app/app/wallet/page.tsx`
- Create: `app/__tests__/pages/WalletPage.test.tsx`

**Step 1: Write failing test**

```ts
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("@privy-io/react-auth", () => ({
  usePrivy: () => ({ ready: true, authenticated: true, user: { linkedAccounts: [] }, exportWallet: vi.fn(), connectWallet: vi.fn() }),
}));
vi.mock("@privy-io/react-auth/solana", () => ({
  useWallets: () => ({ wallets: [{ address: "1111", standardWallet: { name: "Phantom" } }] }),
  useFundWallet: () => ({ fundWallet: vi.fn() }),
}));

import WalletPage from "@/app/wallet/page";

describe("WalletPage", () => {
  it("renders management actions", () => {
    const { getByText } = render(<WalletPage />);
    expect(getByText("Wallet Management")).toBeTruthy();
  });
});
```

**Step 2: Run tests to confirm fail**

Run: `pnpm -C app test -- app/__tests__/pages/WalletPage.test.tsx`

Expected: FAIL (page missing).

**Step 3: Implement page**

Create `/wallet` page that:
- Shows connected wallet list (`useWallets`).
- Includes buttons for “Export Key” and “Add Funds”.
- Includes “Connect another wallet” that calls `connectWallet({ walletList: getPrivyWalletList(), walletChainType: "solana-only" })`.
- Includes short helper text for export/funding conditions.

**Step 4: Re-run tests**

Run: `pnpm -C app test -- app/__tests__/pages/WalletPage.test.tsx`

Expected: PASS.

**Step 5: Commit**

```bash
git add app/app/wallet/page.tsx app/__tests__/pages/WalletPage.test.tsx
git commit -m "feat: add wallet management page"
```

---

### Task 7: Final verification

**Step 1: Run app test suite (app only)**

Run: `pnpm -C app test`

Expected: PASS.

**Step 2: Summarize changes + next steps**

- Confirm Helius RPC is now routed through `/api/rpc`.
- Verify wallet picker shows installed wallets first.
- Verify wallet management actions open Privy modals.

---

## Notes
- If `pnpm -C app test` fails due to missing dependencies, rerun `pnpm install` at repo root.
- Keep UI consistent with existing header dropdown styling.
