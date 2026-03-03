# @endcorp/photoverifier-seeker-sdk

Seeker-first React Native SDK for fast photo-proof capture, attestation envelope creation, upload, and Solana commit.

This package wraps and re-exports the core SDK with a narrower interface for mobile apps.

## Install

```bash
npm install @endcorp/photoverifier-seeker-sdk
```

## Quick Start

```ts
import { Connection, PublicKey } from '@solana/web3.js';
import { Buffer } from 'buffer';
import {
  blake3HexFromBytes,
  locationToH3Cell,
  h3CellToU64,
  createNonceU64,
  buildIntegrityPayload,
  createIntegrityEnvelope,
  requestAttestedPresignedPut,
  putToPresignedUrl,
  buildRecordPhotoProofTransaction,
} from '@endcorp/photoverifier-seeker-sdk';

async function submitSeekerProof(params: {
  photoBytes: Uint8Array;
  owner: PublicKey;
  walletAddress: string;
  location: { latitude: number; longitude: number };
  signMessage: (message: Uint8Array) => Promise<Uint8Array>;
  sendTx: (tx: any) => Promise<string>;
  presignEndpoint: string;
}) {
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  const hashHex = blake3HexFromBytes(params.photoBytes);
  const hash32 = Uint8Array.from(Buffer.from(hashHex, 'hex'));
  const h3Cell = locationToH3Cell(params.location, 7);
  const nonce = createNonceU64();
  const latest = await connection.getLatestBlockhashAndContext();
  const timestampSec = (await connection.getBlockTime(latest.context.slot)) ?? Math.floor(Date.now() / 1000);

  const payload = buildIntegrityPayload({
    hashHex,
    h3Cell,
    h3Resolution: 7,
    timestampSec,
    wallet: params.walletAddress,
    nonce: nonce.toString(),
    slot: latest.context.slot,
    blockhash: latest.value.blockhash,
  });
  const integrity = await createIntegrityEnvelope(payload, params.signMessage);

  const key = `photos/${params.walletAddress}/${hashHex}.jpg`;
  const presign = await requestAttestedPresignedPut(params.presignEndpoint, {
    key,
    contentType: 'image/jpeg',
    integrity,
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

Use this package when your app is Seeker-focused and you want a small, opinionated SDK surface.
