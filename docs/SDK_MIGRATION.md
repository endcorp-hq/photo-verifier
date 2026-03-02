# SDK Migration Guide

Use this when moving older app code to the current H3 + attestation flow.

## Summary

- Keep using `@photoverifier/sdk` for full surface.
- Use `@photoverifier/seeker-sdk` for a narrower Seeker-focused app surface.
- Remove custom/local integrity canonicalizers; use SDK helper.
- Remove direct `h3-js` usage in React Native; use SDK H3 helpers.

## Install

```bash
npm install @photoverifier/seeker-sdk
```

## Common Mapping

| Previous pattern | Current pattern |
|---|---|
| local `canonicalizeIntegrityPayload` function | `canonicalizeIntegrityPayload` from SDK |
| direct `h3-js` import in mobile app | `locationToH3Cell` from SDK |
| manual nonce bit packing | `createNonceU64` + `nonceToString` |
| bespoke presign parsing | `requestAttestedPresignedPut` + `parseAttestedPresignResponse` |

## Example Migration

```ts
import {
  createNonceU64,
  nonceToString,
  buildIntegrityPayload,
  createIntegrityEnvelope,
  locationToH3Cell,
  requestAttestedPresignedPut,
  buildRecordPhotoProofTransaction,
} from '@photoverifier/seeker-sdk';

const h3Cell = locationToH3Cell({ latitude, longitude }, 7);
const nonce = createNonceU64();

const payload = buildIntegrityPayload({
  hashHex,
  h3Cell,
  h3Resolution: 7,
  timestampSec,
  wallet,
  nonce: nonceToString(nonce),
  slot,
  blockhash,
});

const integrity = await createIntegrityEnvelope(payload, signMessage);
const presign = await requestAttestedPresignedPut(presignEndpoint, {
  key,
  contentType: 'image/jpeg',
  integrity,
});

await buildRecordPhotoProofTransaction({
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

- `@photoverifier/seeker-sdk` re-exports from `@photoverifier/sdk`; keep versions aligned.
- Current app default H3 resolution is `7`.
- The flow does not include legacy latitude/longitude payload compatibility.
