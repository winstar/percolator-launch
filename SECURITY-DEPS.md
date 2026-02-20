# Security Dependency Risk Register

> Last updated: 2026-02-20 (PERC-038)
> Audited by: security agent

## Summary

| Metric | Count |
|--------|-------|
| Total vulnerabilities (pre-remediation) | 7 |
| Fixed by dependency removal | 2 (elliptic, lodash) |
| Fixed by pnpm override | 3 (minimatch ×3) |
| Fixed in prior PR | 1 (hono, PR #265) |
| Remaining (risk accepted) | 2 |

## Remediation Actions Taken

### 1. Removed `@solana/wallet-adapter-wallets` (unused)

**Eliminated:** elliptic (low), lodash prototype pollution (moderate)

The `@solana/wallet-adapter-wallets` package was declared as a dependency in
`app/package.json` but never imported. The WalletProvider uses an empty wallets
array with wallet-standard auto-detection (Phantom, Solflare, etc.). This
package pulled in `@solana/wallet-adapter-torus` and its deep dependency chain
including `elliptic` (risky crypto implementation) and `lodash` (prototype
pollution via `_.unset`/`_.omit`).

**Risk of removal:** None. No code references this package.

### 2. Overrode `minimatch` to ≥10.0.0

**Eliminated:** minimatch ReDoS (high, ×3 paths)

The vulnerable minimatch 3.x was pulled in transitively by:
- `eslint@8 → minimatch`
- `@typescript-eslint/typescript-estree → minimatch`
- `eslint-config-next → eslint-plugin-import → ... → minimatch`

Added `"minimatch": ">=10.0.0"` to `pnpm.overrides` in root `package.json`.
Verified linting still passes with the override.

### 3. Hono upgrade (prior — PR #265)

**Eliminated:** hono vulnerability (coder, Sprint 2)

## Remaining Vulnerabilities — Risk Accepted

### bigint-buffer ≤1.1.5 — Buffer Overflow (HIGH)

- **Advisory:** GHSA-3gc7-fjrx-p6mg
- **Path:** `@solana/spl-token → @solana/buffer-layout-utils → bigint-buffer`
- **Patched versions:** `<0.0.0` (no fix exists)
- **Risk assessment:** LOW effective risk despite HIGH CVSS
  - The vulnerability is in `toBigIntLE()` when called with attacker-controlled
    buffer lengths. In our usage, buffer inputs come from on-chain Solana account
    data with fixed, known layouts — not from untrusted user input.
  - `@solana/buffer-layout-utils` is a widely-used Solana ecosystem package;
    the entire Solana JS ecosystem depends on it.
  - No alternative exists — this is the standard Solana token library.
- **Mitigation:** Monitor for upstream fix. If `@solana/spl-token` releases a
  version that drops `bigint-buffer`, upgrade immediately.
- **Decision:** ACCEPT — no actionable fix available, effective risk is low.

### ajv <8.18.0 — ReDoS with `$data` option (MODERATE)

- **Advisory:** GHSA-2g4f-4pwh-qvx6
- **Path:** `eslint@8 → ajv`
- **Patched versions:** ≥8.18.0
- **Risk assessment:** NEGLIGIBLE
  - `ajv` is a transitive dev dependency of ESLint 8. It runs only during
    local development linting — never in production builds or at runtime.
  - The ReDoS requires the `$data` option, which ESLint's usage does not enable.
  - Upgrading ESLint 8→9 would fix this but requires flat config migration
    across the root workspace, which is a larger effort (tracked separately).
- **Mitigation:** Upgrade root workspace to ESLint 9 + typescript-eslint 8
  when the team has bandwidth for config migration.
- **Decision:** ACCEPT — dev-only, no production impact, no realistic exploit
  path.

## Audit Commands

```bash
# Full audit
pnpm audit

# Check specific package
pnpm why <package-name>

# Verify overrides are applied
pnpm ls minimatch
```

## Review Schedule

This register should be reviewed:
- Before each mainnet deployment
- When adding new dependencies
- Monthly during active development
