# Percolator Launch

**Pump.fun for Perps** — Launch perpetual futures markets for any Solana token in one click.

Powered by [Percolator](https://github.com/toly/percolator), deployed on Solana mainnet.

## Architecture

```
percolator-launch/
├── packages/core/     # Slab parser, instruction encoder, PDA derivation
├── app/               # Next.js 14 frontend
│   ├── app/page.tsx          # Landing page
│   ├── app/launch/           # Launch wizard
│   ├── app/markets/          # Browse markets
│   └── app/trade/[slab]/     # Trading UI
├── services/
│   ├── oracle/        # Price pusher (Jupiter → on-chain)
│   └── keeper/        # Multi-market crank bot
└── README.md
```

## Quick Start

```bash
pnpm install
pnpm build        # builds core + app
pnpm dev           # starts Next.js dev server
```

## Program IDs (Mainnet)

- **Program:** `GM8zjJ8LTBMv9xEsverh6H6wLyevgMHEJXcEzyY3rY24`
- **Matcher:** `DHP6DtwXP1yJsz8YzfoeigRFPB979gzmumkmCxDLSkUX`

## How It Works

1. **Pick a token** — Paste any Solana mint address
2. **Set parameters** — Leverage, fees, initial liquidity
3. **Deploy** — One-click multi-tx deployment creates:
   - Slab account (market state)
   - Vault ATA (collateral)
   - Market initialization
   - Oracle authority setup
   - vAMM matcher + LP
4. **Trade** — Share the link, anyone can trade

## Services

### Oracle (`services/oracle`)
Pushes prices from Jupiter API to all registered markets.

```bash
cd services/oracle
MARKETS='[{"slab":"...","mint":"..."}]' RPC_URL=... npx tsx src/index.ts
```

### Keeper (`services/keeper`)
Cranks all markets every 5 seconds.

```bash
cd services/keeper
SLABS='["slab_address_1","slab_address_2"]' RPC_URL=... npx tsx src/index.ts
```

## License

MIT
