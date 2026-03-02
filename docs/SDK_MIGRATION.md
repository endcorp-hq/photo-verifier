# SDK Migration Guide

## Overview

If you are currently importing from `@photoverifier/sdk`, you can keep doing so.

If you want a Seeker-first React Native integration path, move to `@photoverifier/seeker-sdk` for day-to-day app flow imports.

## Install

```bash
npm install @photoverifier/seeker-sdk
```

## Common Import Mapping

| Existing import | Seeker import |
|---|---|
| `@photoverifier/sdk` `verifySeeker` | `@photoverifier/seeker-sdk` `verifySeeker` |
| `@photoverifier/sdk` `buildRecordPhotoProofTransaction` | `@photoverifier/seeker-sdk` `buildRecordPhotoProofTransaction` |
| local integrity helpers | `@photoverifier/seeker-sdk` `buildIntegrityPayload`, `createIntegrityEnvelope` |
| manual nonce assembly | `@photoverifier/seeker-sdk` `createNonceU64`, `nonceToString` |

## Example (Seeker Flow)

```ts
import {
  createNonceU64,
  nonceToString,
  buildIntegrityPayload,
  createIntegrityEnvelope,
  requestAttestedPresignedPut,
  buildRecordPhotoProofTransaction,
} from '@photoverifier/seeker-sdk';

const nonce = createNonceU64();
const payload = buildIntegrityPayload({
  hashHex,
  h3Cell,
  h3Resolution: 9,
  timestampSec,
  wallet,
  nonce: nonceToString(nonce),
  slot,
  blockhash,
});

const envelope = await createIntegrityEnvelope(payload, signMessage);
const presign = await requestAttestedPresignedPut(presignEndpoint, {
  key,
  contentType: 'image/jpeg',
  integrity: envelope,
});

const tx = await buildRecordPhotoProofTransaction({
  connection,
  owner,
  hash32,
  nonce,
  timestampSec,
  h3CellU64: BigInt(`0x${h3Cell}`),
  attestationSignature64: presign.attestationSignature64,
});
```

## Compatibility Notes

- Seeker SDK is a wrapper package, not an independent protocol implementation.
- Underlying constants/program IDs come from the base SDK.
- Keep versions aligned across both packages.
