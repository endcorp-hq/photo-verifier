# Contract Constants (Canonical)

Canonical source files:

- `packages/core/src/contracts/chain-contracts.ts`
- `packages/core/src/contracts/api-contracts.ts`

## Chain

- `CHAIN_CONTRACT_VERSION`: `v1`
- `PHOTO_PROOF_PROGRAM_ID_BASE58`: `3i6eNpCFvXhMg8LESAutXWKUtAey9mAbTziLLuUc78Hu`
- `BUBBLEGUM_PROGRAM_ID_BASE58`: `DTNhearU7zbKfR4XSzWUGY4TFUgb6s86GY6T1aWPALEP`
- `RECORD_PHOTO_PROOF_DISCRIMINATOR_SEED`: `global:record_photo_proof`
- `RECORD_PHOTO_PROOF_MIN_LEN`: `64`
- `SUPPORTED_SOLANA_CLUSTERS`: `mainnet-beta`, `devnet`, `testnet`

## API

- `API_CONTRACT_VERSION`: `v1`
- `HELIUS_TX_API_BASE_BY_CLUSTER.devnet`: `https://api-devnet.helius.xyz`
- `HELIUS_TX_API_BASE_BY_CLUSTER.mainnet-beta`: `https://api.helius.xyz`
- `HELIUS_TX_API_BASE_BY_CLUSTER.testnet`: `null` (forces RPC fallback)
