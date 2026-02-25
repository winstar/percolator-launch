# Rust Program Repos

The Solana programs have been extracted into standalone repositories:

| Repo | Description | Link |
|------|-------------|------|
| **percolator** | Core risk engine (no_std, pure Rust) | [dcccrypto/percolator](https://github.com/dcccrypto/percolator) |
| **percolator-prog** | Solana BPF wrapper program | [dcccrypto/percolator-prog](https://github.com/dcccrypto/percolator-prog) |
| **percolator-matcher** | Reference AMM matcher (CPI target) | [dcccrypto/percolator-matcher](https://github.com/dcccrypto/percolator-matcher) |
| **percolator-stake** | Insurance LP staking layer | [dcccrypto/percolator-stake](https://github.com/dcccrypto/percolator-stake) |

## Building Programs

See each repo's README for build instructions. The `percolator-prog` repo depends on `percolator` via git dependency.

## Program IDs (Devnet)

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for current program IDs, authority wallets, and deployment procedures.
