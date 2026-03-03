# Rust Program Repos

The Solana programs have been extracted into standalone repositories:

| Repo | Description | Link |
|------|-------------|------|
| **percolator** | Core risk engine (no_std, pure Rust) | [winstar/percolator](https://github.com/winstar/percolator) |
| **percolator-prog** | Solana BPF wrapper program | [winstar/percolator-prog](https://github.com/winstar/percolator-prog) |
| **percolator-matcher** | Reference AMM matcher (CPI target) | [winstar/percolator-matcher](https://github.com/winstar/percolator-matcher) |
| **percolator-stake** | Insurance LP staking layer | [winstar/percolator-stake](https://github.com/winstar/percolator-stake) |

## Building Programs

See each repo's README for build instructions. The `percolator-prog` repo depends on `percolator` via git dependency.

## Program IDs (Devnet)

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for current program IDs, authority wallets, and deployment procedures.
