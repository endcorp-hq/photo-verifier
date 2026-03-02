# Citizen Science Photo Verifier

Monorepo for a Seeker-gated photo verification system that:

1. captures image bytes on device
2. hashes with BLAKE3
3. encodes location as H3 (privacy-preserving cell)
4. requests server attestation for integrity payload
5. uploads image to S3
6. appends proof metadata to Solana via compressed tree append

## Repository Layout

- `photo-verifier/`: Expo mobile app (camera, sign-in, on-chain submit, local gallery)
- `demo-site/`: Next.js gallery and proof verification view
- `packages/photoverifier-sdk/`: main SDK (`@photoverifier/sdk`)
- `packages/photoverifier-seeker-sdk/`: Seeker-focused wrapper SDK (`@photoverifier/seeker-sdk`)
- `packages/core/`: free core primitives (hash/camera/location/storage)
- `packages/blockchain/`: licensed blockchain helpers
- `on-chain/photo-proof-compressed/`: Anchor program
- `infra/`: presign API + deploy scripts
- `docs/`: architecture, runbooks, config, troubleshooting, API docs

## Current Devnet Baseline

- Program ID: `3i6eNpCFvXhMg8LESAutXWKUtAey9mAbTziLLuUc78Hu`
- Attestation pubkey: `Ga6SxqKLPTzrc4pykqrawSi9pvz3ZGhAdnZSBDKKioYk`
- Fee authority: `DTrsex7XGyS6QstUr4GFZ4cHYEm4YoeD75799A7ns7Sc`
- Presign endpoint (current deploy): `https://yqc2akkjn0.execute-api.us-west-2.amazonaws.com/uploads`

Treat values above as environment-specific. Do not commit private keys or API secrets.

## Quick Start

```bash
pnpm install
```

Run mobile app:

```bash
pnpm -C photo-verifier dev
```

Run demo site:

```bash
pnpm -C demo-site dev
```

Build SDK packages:

```bash
pnpm -C packages/photoverifier-sdk build
pnpm -C packages/photoverifier-seeker-sdk build
```

## Documentation Index

See [docs/README.md](./docs/README.md).

Recommended order:

1. [Architecture](./docs/ARCHITECTURE.md)
2. [Configuration](./docs/CONFIGURATION.md)
3. [Devnet Runbook](./docs/DEVNET_RUNBOOK.md)
4. [Troubleshooting](./docs/TROUBLESHOOTING.md)
5. [API](./docs/API.md)
