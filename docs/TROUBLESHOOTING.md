# Troubleshooting

## 1) Missing Attestation in Presign Response

### Symptom

App shows:

- `Server update required: presign API must return attestation signature`
- or SDK `PRESIGN_MISSING_ATTESTATION_SIGNATURE`

### Cause

Backend is old or misconfigured and does not include `attestationSignature` in `/uploads` response.

### Fix

- Redeploy presign API with current `infra/presign-api.yaml`.
- Ensure `ATTESTATION_PRIVATE_KEY_B58` is supplied at deploy time.
- Confirm Lambda env includes `ATTESTATION_PUBLIC_KEY`.

## 2) S3 Upload Fails With 301 PermanentRedirect

### Symptom

`S3 upload failed (301)` with `PermanentRedirect` and endpoint mismatch.

### Cause

Presigned URL was signed for wrong region endpoint.

### Fix

- Use current `infra/deploy.sh` (auto-detects bucket region).
- Confirm Lambda has correct `BUCKET_REGION`.
- For `us-east-1` buckets, host should be `s3.amazonaws.com`.

## 3) Demo-Site Slow/Degraded With RPC 429

### Symptom

Logs show repeated `429 Too Many Requests`, delayed `/api/list`, or `tx_lookup_unavailable`.

### Cause

Tx index lookup rate-limited (RPC or Helius).

### Fix

- Configure `HELIUS_API_KEY` for higher-capacity tx indexing.
- Tune `MAX_SIGNATURES`, `TX_PAGE_SIZE`, `TX_CACHE_TTL_MS`.
- Use cache and graceful fallback behavior already implemented in `/api/list`.

## 4) On-chain Submit Fails: Invalid Attestation

### Symptom

Transaction fails on `InvalidAttestationInstruction`.

### Cause

Any of:

- Attestation signed by wrong key.
- Message fields do not exactly match tx args.
- Missing/incorrect `ed25519` pre-instruction ordering.

### Fix

- Ensure SDK tx builder inserts `Ed25519Program` instruction immediately before `record_photo_proof`.
- Ensure payload includes exact `owner/hash/nonce/timestamp/latitudeE6/longitudeE6` used in tx args.
- Ensure on-chain and backend share same attestation public key.

## 5) Tree Initialization / Authority Errors

### Symptom

Errors during first write or `initialize_tree` authority checks.

### Cause

Fee authority constant and signer wallet mismatch.

### Fix

- Verify `PROGRAM_FEE_AUTHORITY` in on-chain code and SDK constant align with intended wallet.
- Deploy updated program and IDL when authority constants change.

## 6) Program/IDL Mismatch

### Symptom

Decoded instructions/accounts look wrong in tools or demo-site.

### Cause

IDL not upgraded for current program build.

### Fix

Run:

```bash
cd on-chain/photo-proof-compressed
anchor idl upgrade --provider.cluster devnet --filepath target/idl/photo_proof_compressed.json 3i6eNpCFvXhMg8LESAutXWKUtAey9mAbTziLLuUc78Hu
```

## 7) Seeker Verification Confusion (Mainnet asset, Devnet writes)

### Symptom

User has Seeker token on mainnet but app writes on devnet.

### Intended behavior

- Seeker ownership is verified against `EXPO_PUBLIC_SEEKER_VERIFICATION_RPC_URL` (mainnet).
- Photo proof transactions are sent to selected write cluster (`EXPO_PUBLIC_SOLANA_RPC_URL`, currently devnet).

This split is expected for current demo architecture.
