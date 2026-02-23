# Solflare Debug + Deep-Link Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a gated wallet debug panel and Solflare deep-link fallback to diagnose Solflare in-app browser connection issues.

**Architecture:** Create a small Solflare deep-link helper, render a debug panel on `/wallet?walletDebug=1`, and surface a “Open in Solflare” link in the header connect area. Use TDD for each behavior and keep the UI changes minimal.

**Tech Stack:** Next.js App Router, React, TypeScript, Vitest, Testing Library.

---

### Task 1: Solflare Deep-Link Helper

**Files:**
- Create: `app/lib/solflare.ts`
- Test: `app/__tests__/lib/solflare.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { buildSolflareBrowseUrl } from "@/lib/solflare";

describe("buildSolflareBrowseUrl", () => {
  it("builds a Solflare browse deep-link with ref", () => {
    const url = buildSolflareBrowseUrl("https://example.com/path?a=1", "https://example.com");
    expect(url).toBe(
      "https://solflare.com/ul/v1/browse/https%3A%2F%2Fexample.com%2Fpath%3Fa%3D1?ref=https%3A%2F%2Fexample.com"
    );
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm -C app test __tests__/lib/solflare.test.ts`
Expected: FAIL (function not found).

**Step 3: Write minimal implementation**

```ts
export function buildSolflareBrowseUrl(currentUrl: string, ref?: string) {
  const encodedUrl = encodeURIComponent(currentUrl);
  const encodedRef = ref ? `?ref=${encodeURIComponent(ref)}` : "";
  return `https://solflare.com/ul/v1/browse/${encodedUrl}${encodedRef}`;
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm -C app test __tests__/lib/solflare.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add app/lib/solflare.ts app/__tests__/lib/solflare.test.ts
git commit -m "feat: add solflare deep-link helper"
```

---

### Task 2: Wallet Debug Panel

**Files:**
- Create: `app/components/wallet/WalletDebugPanel.tsx`
- Modify: `app/app/wallet/page.tsx`
- Test: `app/__tests__/components/WalletDebugPanel.test.tsx`

**Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("walletDebug=1"),
}));

import { WalletDebugPanel } from "@/components/wallet/WalletDebugPanel";

describe("WalletDebugPanel", () => {
  it("renders when walletDebug=1", () => {
    render(<WalletDebugPanel />);
    expect(screen.getByText(/Wallet Debug/i)).toBeTruthy();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm -C app test __tests__/components/WalletDebugPanel.test.tsx`
Expected: FAIL (module not found).

**Step 3: Write minimal implementation**

```tsx
"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { buildSolflareBrowseUrl } from "@/lib/solflare";

export function WalletDebugPanel() {
  const params = useSearchParams();
  const enabled = params?.get("walletDebug") === "1" || params?.get("walletDebug") === "true";
  if (!enabled || typeof window === "undefined") return null;

  const info = {
    userAgent: navigator.userAgent,
    solflare: Boolean((window as any).solflare),
    solanaIsSolflare: Boolean((window as any).solana?.isSolflare),
    phantom: Boolean((window as any).phantom?.solana?.isPhantom),
    solanaIsPhantom: Boolean((window as any).solana?.isPhantom),
  };

  const deepLink = buildSolflareBrowseUrl(window.location.href, window.location.origin);

  return (
    <div className="mt-6 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
      <div className="text-[12px] font-semibold text-white">Wallet Debug</div>
      <pre className="mt-2 whitespace-pre-wrap text-[11px] text-[var(--text-secondary)]">{JSON.stringify(info, null, 2)}</pre>
      <div className="mt-3 flex gap-2">
        <a href={deepLink} className="text-[11px] text-[var(--accent)]">Open in Solflare</a>
        <button
          className="text-[11px] text-[var(--text-secondary)]"
          onClick={() => navigator.clipboard.writeText(JSON.stringify(info, null, 2))}
        >
          Copy debug
        </button>
      </div>
    </div>
  );
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm -C app test __tests__/components/WalletDebugPanel.test.tsx`
Expected: PASS.

**Step 5: Commit**

```bash
git add app/components/wallet/WalletDebugPanel.tsx app/app/wallet/page.tsx app/__tests__/components/WalletDebugPanel.test.tsx
git commit -m "feat: add wallet debug panel"
```

---

### Task 3: Header Solflare Link

**Files:**
- Modify: `app/components/wallet/ConnectButton.tsx`
- Modify: `app/__tests__/components/ConnectButton.test.tsx`

**Step 1: Write the failing test**

```tsx
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("walletDebug=1"),
}));

it("shows solflare link in debug mode when unauthenticated", () => {
  privyState = { ...privyState, authenticated: false };
  const { getByText } = render(<ConnectButton />);
  expect(getByText(/Open in Solflare/i)).toBeTruthy();
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm -C app test __tests__/components/ConnectButton.test.tsx`
Expected: FAIL (link missing).

**Step 3: Write minimal implementation**

```tsx
import { useSearchParams } from "next/navigation";
import { buildSolflareBrowseUrl } from "@/lib/solflare";

const params = useSearchParams();
const debug = params?.get("walletDebug") === "1" || params?.get("walletDebug") === "true";
const isMobile = typeof window !== "undefined" && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
const showSolflareLink = !authenticated && (debug || isMobile);

{showSolflareLink && (
  <a className="mt-1 block text-[10px] text-[var(--accent)]" href={buildSolflareBrowseUrl(window.location.href, window.location.origin)}>
    Open in Solflare
  </a>
)}
```

**Step 4: Run test to verify it passes**

Run: `pnpm -C app test __tests__/components/ConnectButton.test.tsx`
Expected: PASS.

**Step 5: Commit**

```bash
git add app/components/wallet/ConnectButton.tsx app/__tests__/components/ConnectButton.test.tsx
git commit -m "feat: add solflare deep-link in header"
```

---

### Task 4: Full Test Pass

**Step 1: Run full app tests**

Run: `pnpm -C app test`
Expected: PASS (warnings ok).

**Step 2: Commit (if any fixes)**

```bash
git add -A
git commit -m "test: verify solflare debug flow"
```

---

### Task 5: PR + Merge

**Step 1: Push branch and open PR**

```bash
git push
```

**Step 2: Merge to main**

```bash
gh pr merge <PR_NUMBER> --merge
```
