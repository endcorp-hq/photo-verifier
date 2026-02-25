# PhotoVerifier SDK

A monorepo for building verifiable photo capture experiences with blockchain anchoring. In a world of AI‑generated content, we need trustworthy proofs that a photo was actually taken by a real device at a real time and place.

## Features

- **Core SDK (free, MIT)**: Photo capture, cryptographic hashing, location services, S3 storage
- **Blockchain SDK (licensed)**: Solana compressed accounts for ~$0.001/photo on-chain storage
- **Mobile App**: React Native/Expo test app demonstrating the full flow
- **On‑Chain Programs**: Anchor Solana programs for proof verification

## Architecture

This is an open-core product:
- **Core features** are free (MIT license) — hashing, camera, location, storage
- **Blockchain features** require a license — compressed accounts, on-chain verification

## Repository layout

```
photo-verifier/
├── packages/
│   ├── core/                    # Free MIT-licensed SDK (hashing, camera, location, storage)
│   ├── blockchain/               # Licensed SDK (compressed accounts, Solana)
│   └── photoverifier-sdk/        # Unified SDK (core + blockchain)
├── photo-verifier/               # Expo/React Native mobile test app
├── on-chain/photo-proof-compressed/  # Anchor Solana program
├── infra/                       # AWS infrastructure (presign API, S3)
├── demo-site/                   # Next.js demo site
└── docs/                        # API docs, licensing info
```

## Motivation

AI makes it trivial to fabricate convincing images. For climate science, journalism, and public infrastructure monitoring, we need a way to attest that images are authentic: captured by a device, at a time and location, with an auditable trail.

This SDK enables:
- Capturing photos with cryptographic proof of authenticity
- Reducing on-chain costs from ~$1/photo to ~$0.001/photo using compressed accounts
- Verifying photo proofs on the Solana blockchain

## Quick Start

### Install SDK

```bash
npm install @photoverifier/sdk
```

### Peer Dependencies

```bash
npm install @solana/web3.js @solana/spl-token expo expo-camera expo-location expo-file-system expo-media-library
```

### Basic Usage

```typescript
import { PhotoVerifier, darkTheme, ThemeProvider } from '@photoverifier/sdk';

// Initialize with license (for blockchain features)
const verifier = new PhotoVerifier({
  licenseKey: 'your-license-key',  // Required for blockchain
  rpcUrl: 'https://api.devnet.solana.com',
});

// Capture and hash a photo
const { capture, data } = await verifier.capturePhoto(cameraRef);

// Store proof on blockchain (requires license)
const { signature } = await verifier.storeProof(data);
```

## Documentation

- [API Reference](./docs/API.md) — Full SDK API documentation
- [Licensing](./docs/LICENSING.md) — License tiers, pricing, and terms

## Packages

### @photoverifier/core (MIT)

Free, open-source core functionality:
- `blake3HexFromBase64`, `blake3Hash` — Cryptographic hashing
- `captureAndPersist`, `readFileAsBytes` — Camera capture
- `getCurrentLocation`, `locationToString` — Location services
- `buildS3KeyForPhoto`, `putToPresignedUrl` — S3 storage
- `ThemeProvider`, `darkTheme` — Theming

### @photoverifier/blockchain (Proprietary)

Licensed blockchain features:
- Compressed accounts (Bubblegum/Merkle trees)
- PDA derivation and transaction building
- License key validation and usage tracking

### @photoverifier/sdk (MIT + Proprietary)

Unified SDK combining both. Core features work without a license; blockchain features require a valid license key.

## Prerequisites

- Node 18+ and pnpm
- For mobile: Expo tooling and native build env (Android Studio/Xcode)
- For infra: AWS CLI configured with credentials
- For on‑chain: Solana toolchain and Anchor CLI

## Development

```bash
# Install dependencies
pnpm install

# Build all packages
cd packages/photoverifier-sdk && pnpm build

# Run mobile app
cd photo-verifier && pnpm dev
```

## License

- **Core SDK**: MIT License (free, open source)
- **Blockchain Layer**: Proprietary (requires license)

See [docs/LICENSING.md](./docs/LICENSING.md) for details.

## Contributing

Issues and PRs welcome. Please open an issue to discuss significant changes before submitting PRs.
