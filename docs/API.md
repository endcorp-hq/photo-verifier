# SDK API Reference

This document summarizes the public API currently exported by:

- `@photoverifier/sdk`
- `@photoverifier/seeker-sdk`

Source of truth is package source files in `packages/photoverifier-sdk/src/index.ts` and `packages/photoverifier-seeker-sdk/src/index.ts`.

## Installation

```bash
npm install @photoverifier/sdk
# optional wrapper
npm install @photoverifier/seeker-sdk
```

Peer deps (typical RN app):

```bash
npm install @solana/web3.js @solana/spl-token expo expo-camera expo-location expo-file-system expo-media-library react react-native
```

## `@photoverifier/sdk`

### Core re-exports

From `@photoverifier/core`:

- Hash: `blake3HexFromBase64`, `blake3HexFromBytes`, `blake3Hash`
- Camera: `captureAndPersist`, `readFileAsBase64`, `readFileAsBytes`
- Location: `getCurrentLocation`, `hasLocationServicesEnabled`, `requestLocationPermission`, `locationToString`, `parseLocationString`
- Storage: `uploadBytes`, `buildS3KeyForPhoto`, `buildS3Uri`, `parseS3Uri`, `putToPresignedUrl`
- Types: `Blake3HashResult`, `GeoLocation`, `PhotoMetadata`, `CaptureResult`, `S3Config`, `S3KeyParams`

### Blockchain re-exports

From `@photoverifier/blockchain`:

- Compressed proof helpers: `serializePhotoProof`, `deserializePhotoProof`, `hashPhotoProof`, `calculateTreeCost`, `deriveTreeConfigPda`, `deriveAuthorityPda`, `getTreeCapacity`, `estimateCostPerPhoto`, `createLeafSchema`
- Constants/types: `PHOTO_PROOF_PROGRAM_ID`, `BUBBLEGUM_PROGRAM_ID`, `TREE_CONFIGS`, `TreeConfig`, `PhotoProof`, `CompressedAccountConfig`, `PhotoProofResult`, `VerificationResult`
- License helpers: `LICENSE_TIERS`, `encodeLicenseKey`, `decodeLicenseKey`, `hasFeature`, `createDemoLicenseKey`, `UsageTracker`, `LicenseInfo`, `LicenseValidationResult`

### SDK class

- `PhotoVerifier`
- `PhotoVerifierConfig`, `PhotoVerifierOptions`

Note: the class exists, but production app flow uses direct module helpers for upload/attestation/on-chain submit.

### Seeker helpers

- `isSeekerDevice`
- `verifySeeker`
- `detectSeekerUser`
- `findSeekerMintForOwner`
- `SeekerDetectionResult`

### H3 helpers

- `latLngToH3Cell`
- `locationToH3Cell`
- `h3CellToU64`
- `H3LocationInput`

### On-chain transaction helpers (`photo-proof-compressed`)

- `buildRecordPhotoProofTransaction`
- `buildRecordPhotoProofInstruction`
- `buildInitializeTreeInstruction`
- `deriveOnchainTreeConfigPda`
- `deriveTreeAuthorityPda`
- `buildAttestationMessage`
- `sendTransactionWithKeypair`
- `confirmTransaction`
- `uploadAndSubmit`
- `hashBytes`

Constants:

- `PHOTO_PROOF_COMPRESSED_PROGRAM_ID`
- `SPL_ACCOUNT_COMPRESSION_PROGRAM_ID`
- `SPL_NOOP_PROGRAM_ID`
- `PHOTO_PROOF_FEE_AUTHORITY`
- `PHOTO_PROOF_ATTESTATION_AUTHORITY`

### Presign helpers

- `canonicalizeIntegrityPayload`
- `requestAttestedPresignedPut`
- `parseAttestedPresignResponse`
- `decodeAttestationSignature64`
- `PresignError`
- `PresignErrorCode`
- `PresignIntegrityPayload`
- `PresignIntegrityEnvelope`
- `AttestedPresignResponse`

## `@photoverifier/seeker-sdk`

Wrapper package that re-exports key base SDK symbols plus seeker-centric helpers:

- `createNonceU64`
- `nonceToString`
- `buildIntegrityPayload`
- `createIntegrityEnvelope`

Also re-exports:

- verification helpers
- H3 helpers
- transaction builders
- presign helpers/types

## Recommended App Flow (Current)

```ts
import {
  blake3HexFromBytes,
  locationToH3Cell,
  canonicalizeIntegrityPayload,
  buildRecordPhotoProofTransaction,
  requestAttestedPresignedPut,
  putToPresignedUrl,
} from '@photoverifier/sdk';

// 1) hash bytes
const hashHex = blake3HexFromBytes(photoBytes);

// 2) derive H3
const h3Cell = locationToH3Cell({ latitude, longitude }, 7);

// 3) sign canonical payload with wallet
const payload = { hashHex, h3Cell, h3Resolution: 7, timestampSec, wallet, nonce, slot, blockhash };
const message = new TextEncoder().encode(canonicalizeIntegrityPayload(payload));
const signature = await signMessage(message);

// 4) presign + attestation
const presign = await requestAttestedPresignedPut(presignEndpoint, {
  key,
  contentType: 'image/jpeg',
  integrity: { version: 'v1', payload, signature: Buffer.from(signature).toString('base64') },
});

// 5) upload image
await putToPresignedUrl({ url: presign.uploadURL, bytes: photoBytes, contentType: 'image/jpeg' });

// 6) build + send tx
const tx = await buildRecordPhotoProofTransaction({
  connection,
  owner,
  hash32,
  nonce: BigInt(nonce),
  timestampSec,
  h3CellU64: BigInt(`0x${h3Cell}`),
  attestationSignature64: presign.attestationSignature64,
});
```
