# @endcorp/photoverifier-sdk

PhotoVerifier SDK for React Native/Expo apps that need tamper-evident photo proofs anchored on Solana.

## Features

- BLAKE3 photo hashing
- H3 location cell derivation (privacy-preserving geospatial bucket)
- Integrity payload canonicalization
- Presigned S3 upload helpers
- Solana transaction builders for compressed photo-proof flows

## Stability Boundaries

- Production path: module-first helpers (`core/*`, `modules/presign`, `modules/onchain`).
- Experimental class path (`ExperimentalPhotoVerifier` via `mobile` or `experimental` entrypoint): requires explicit `proofRuntime` configuration for `storeProof`/`verifyProof`.
- Experimental compatibility path: `experimental.*` aliases for migration-safe imports.

## Migration Notes

- Canonical core APIs now come directly from `@photoverifier/core`.
- Canonical blockchain APIs now come directly from `@photoverifier/blockchain`.
- Deprecated SDK-local duplicate module paths were removed.
- Prefer targeted entrypoints to reduce transitive dependencies:
  - `@endcorp/photoverifier-sdk/core`
  - `@endcorp/photoverifier-sdk/mobile`
  - `@endcorp/photoverifier-sdk/onchain`

## Install

```bash
npm install @endcorp/photoverifier-sdk
```

## Quick Start

```ts
import { Connection, PublicKey } from '@solana/web3.js';
import { Base64 } from 'js-base64';
import { Buffer } from 'buffer';
import {
  blake3HexFromBytes,
  putToPresignedUrl,
} from '@endcorp/photoverifier-sdk/core';
import {
  locationToH3Cell,
  h3CellToU64,
  canonicalizeIntegrityPayload,
  requestAttestedPresignedPut,
  buildRecordPhotoProofTransaction,
} from '@endcorp/photoverifier-sdk/onchain';

async function submitPhotoProof(params: {
  photoBytes: Uint8Array;
  owner: PublicKey;
  signMessage: (m: Uint8Array) => Promise<Uint8Array>;
  sendTx: (tx: any) => Promise<string>;
  presignEndpoint: string;
  wallet: string;
  location: { latitude: number; longitude: number };
}) {
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  const hashHex = blake3HexFromBytes(params.photoBytes);
  const hash32 = Uint8Array.from(Buffer.from(hashHex, 'hex'));
  const h3Cell = locationToH3Cell(params.location, 7);

  const latest = await connection.getLatestBlockhashAndContext();
  const slot = latest.context.slot;
  const blockhash = latest.value.blockhash;
  const timestampSec = (await connection.getBlockTime(slot)) ?? Math.floor(Date.now() / 1000);
  const nonce = BigInt(Date.now());
  const key = `photos/${params.wallet}/${hashHex}.jpg`;

  const integrityPayload = {
    hashHex,
    h3Cell,
    h3Resolution: 7,
    timestampSec,
    wallet: params.wallet,
    nonce: nonce.toString(),
    slot,
    blockhash,
  };
  const canonical = canonicalizeIntegrityPayload(integrityPayload);
  const signature = Base64.fromUint8Array(
    await params.signMessage(new TextEncoder().encode(canonical))
  );

  const presign = await requestAttestedPresignedPut(params.presignEndpoint, {
    key,
    contentType: 'image/jpeg',
    integrity: { version: 'v1', payload: integrityPayload, signature },
  });

  await putToPresignedUrl({
    url: presign.uploadURL,
    bytes: params.photoBytes,
    contentType: 'image/jpeg',
  });

  const txBuild = await buildRecordPhotoProofTransaction({
    connection,
    owner: params.owner,
    hash32,
    nonce,
    timestampSec,
    h3CellU64: h3CellToU64(h3Cell),
    attestationSignature64: presign.attestationSignature64,
  });
  const txSig = await params.sendTx(txBuild.transaction);
  await connection.confirmTransaction(txSig, 'confirmed');
  return txSig;
}
```

## Peer Dependencies

This package expects your app to provide:

- `expo`, `react`, `react-native`
- `expo-camera`, `expo-location`, `expo-file-system`, `expo-media-library`
- `@solana/web3.js`, `@solana/spl-token`

Use this package when you want the full SDK surface and direct control over capture, attestation, upload, and on-chain commit flows.
