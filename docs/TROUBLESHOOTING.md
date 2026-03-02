# Troubleshooting

## 1) Hermes Crash: `Unknown encoding: utf-16le`

### Symptom

React Native app crashes at startup with:

`RangeError: Unknown encoding: utf-16le (normalized: utf-16le), js engine: hermes`

### Cause

`h3-js` browser build initializes `TextDecoder('utf-16le')`, which Hermes does not support.

### Fix

- Use SDK H3 helpers backed by `h3-reactnative`.
- Remove direct `h3-js` imports from app code.
- Rebuild app bundle.

## 2) Router Warning: missing default export for camera route

### Symptom

Expo Router warns:

`Route "./(tabs)/camera/index.tsx" is missing the required default export.`

### Cause

Commonly a downstream effect of module crash during route import (for example the Hermes H3 crash above).

### Fix

- Resolve import-time crash first.
- Confirm `export default` exists in route file.

## 3) Missing Attestation in Presign Response

### Symptom

- `PRESIGN_MISSING_ATTESTATION_SIGNATURE`
- UI shows server update/attestation error

### Cause

Presign backend is outdated or misconfigured.

### Fix

- Redeploy presign stack with current template.
- Ensure `ATTESTATION_PRIVATE_KEY_B58` and `ATTESTATION_PUBLIC_KEY` are set correctly.

## 4) S3 Upload Fails With 301 `PermanentRedirect`

### Symptom

`S3 upload failed (301)` and endpoint mismatch XML error.

### Cause

Presigned URL signed for wrong S3 region endpoint.

### Fix

- Use `infra/deploy.sh` (bucket region auto-detection).
- Verify Lambda `BUCKET_REGION` matches actual bucket region.

## 5) Wallet Authorization Fails Intermittently

### Symptom

`authorization request failed` from mobile wallet adapter.

### Cause

Session interruptions or stale wallet authorization context.

### Fix

- Reconnect wallet and retry.
- Keep retry/reconnect guard in app for `signMessage` and `signAndSendTransaction`.

## 6) On-chain Submit Fails: `InvalidAttestationInstruction`

### Symptom

Transaction simulation/program logs show attestation instruction error.

### Cause

Any of:

- wrong attestation key
- signed message mismatch (owner/hash/nonce/timestamp/h3)
- missing/incorrect ed25519 pre-instruction ordering

### Fix

- Use SDK transaction builder.
- Verify payload canonicalization is consistent between app and server.
- Verify backend public key matches on-chain `ATTESTATION_AUTHORITY`.

## 7) Demo Site Slow or Degraded With 429

### Symptom

Repeated `429 Too Many Requests`, delayed `/api/list`, or warning `tx_lookup_unavailable`.

### Cause

Rate-limited tx indexing path (RPC and/or Helius).

### Fix

- Configure `HELIUS_API_KEY`.
- Tune `MAX_SIGNATURES`, `TX_PAGE_SIZE`, cache TTL variables.
- Keep fallback behavior enabled.

## 8) Mainnet Seeker Token + Devnet Writes Confusion

### Symptom

User has Seeker token on mainnet but app writes proofs to devnet.

### Intended Behavior

This split is valid for development:

- verification RPC checks Seeker ownership on mainnet
- write RPC submits proofs to selected devnet/testnet cluster

Configure explicitly via env vars to avoid ambiguity.
