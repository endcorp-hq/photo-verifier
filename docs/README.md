# Documentation Index

This folder documents the current photo verification stack and operations.

## Core Docs

- [Architecture](./ARCHITECTURE.md): components, data flow, trust boundaries, wire diagrams
- [Configuration](./CONFIGURATION.md): app/demo/backend environment variables
- [Devnet Runbook](./DEVNET_RUNBOOK.md): deploy and smoke test steps
- [Troubleshooting](./TROUBLESHOOTING.md): known failures and fixes
- [API](./API.md): `@endcorp/photoverifier-sdk` and `@endcorp/photoverifier-seeker-sdk` surfaces

## SDK/Product Docs

- [SDK Migration](./SDK_MIGRATION.md)
- [SDK Packaging Strategy](./SDK_PACKAGING_STRATEGY.md)
- [NPM Release Workflow](./NPM_RELEASE_WORKFLOW.md)
- [Licensing](./LICENSING.md)

## Current Baseline (March 2, 2026)

- Program ID: `3i6eNpCFvXhMg8LESAutXWKUtAey9mAbTziLLuUc78Hu`
- Presign endpoint: `https://yqc2akkjn0.execute-api.us-west-2.amazonaws.com/uploads`
- Attestation pubkey: `Ga6SxqKLPTzrc4pykqrawSi9pvz3ZGhAdnZSBDKKioYk`
- Mobile default H3 resolution: `7`

Do not commit private keys, mnemonics, or RPC API keys.
