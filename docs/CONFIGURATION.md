# Configuration Reference

## Mobile App (`photo-verifier`)

Source of truth:

- `photo-verifier/constants/app-config.ts`
- `photo-verifier/app.json` (`expo.extra`)

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `EXPO_PUBLIC_S3_BUCKET` | No | `photoverifier` | S3 bucket used for URI/key conventions |
| `EXPO_PUBLIC_S3_BASE_PREFIX` | No | `photos` | S3 object key prefix |
| `EXPO_PUBLIC_S3_PRESIGN_ENDPOINT` | Yes | none | Presign API endpoint (`/uploads`) |
| `EXPO_PUBLIC_S3_CONTENT_TYPE` | No | `image/jpeg` | Upload content type |
| `EXPO_PUBLIC_SOLANA_RPC_URL` | No | `https://api.mainnet-beta.solana.com` | Default write RPC used by providers |
| `EXPO_PUBLIC_H3_RESOLUTION` | No | `7` | Default H3 resolution (0-15) |
| `EXPO_PUBLIC_SEEKER_VERIFICATION_RPC_URL` | No | `https://api.mainnet-beta.solana.com` | RPC for Seeker ownership checks |
| `EXPO_PUBLIC_SEEKER_DEVNET_MINTS` | No | empty | Optional CSV allowlist |
| `EXPO_PUBLIC_SEEKER_TESTNET_MINTS` | No | empty | Optional CSV allowlist |
| `EXPO_PUBLIC_SEEKER_MAINNET_MINTS` | No | empty | Optional CSV allowlist |

Notes:

- Seeker verification RPC and proof write RPC can intentionally differ.
- App UI routes are gated by wallet connection + Seeker verification.

## Demo Site (`demo-site`)

Primary env vars used by API routes:

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `S3_BUCKET` | Yes | `photoverifier` | Bucket to list images |
| `S3_REGION` | No | `us-east-1` | S3 client region |
| `S3_PREFIX` | No | `photos/` | Prefix for list operations |
| `S3_CDN_DOMAIN` | No | none | Optional CDN host for image URLs |
| `RPC_URL` | No | `https://api.devnet.solana.com` | RPC for tx fallback and decoding |
| `PROGRAM_ID` | No | current devnet program ID | Program used for tx instruction decoding |
| `HELIUS_API_KEY` | No | derived from `RPC_URL` query if present | Helius tx index path |
| `HELIUS_TX_API_BASE` | No | inferred | Override Helius tx API base |
| `MAX_LIST_ITEMS` | No | `200` | Max image objects returned |
| `MAX_SIGNATURES` | No | `200` | Max signatures scanned |
| `TX_PAGE_SIZE` | No | `50` | Batch size for tx fetch |
| `LIST_CACHE_TTL_MS` | No | `15000` | List response cache TTL |
| `TX_CACHE_TTL_MS` | No | `5000` | Tx decode cache TTL |

## Presign Infra (`infra/presign-api.yaml`)

CloudFormation deploy parameters:

| Parameter | Required | Default | Purpose |
|---|---|---|---|
| `BucketName` | Yes | none | S3 bucket name |
| `BucketRegion` | Yes | none | Region used for signing and endpoint logic |
| `AllowedOrigin` | Yes | `*` | CORS allow-origin |
| `UrlExpirySeconds` | No | `300` | Presigned URL expiration |
| `AttestationPrivateKeyBase58` | Yes | none | Attestation signing key (secret) |
| `AttestationPublicKey` | Yes | `Ga6Sx...` | Public key expected by verifier |

`infra/deploy.sh` auto-detects bucket region and sets S3 CORS.

## Local Presign Server (`scripts/run-presign.js`)

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `S3_HOST` | No | `http://localhost:4566` | S3/LocalStack endpoint |
| `BUCKET` | No | `photoverifier-dev` | Bucket for local testing |
| `PORT` | No | `3000` | HTTP bind port |
| `SOLANA_RPC_URL` | No | `https://api.devnet.solana.com` | Chain anchor validation RPC |
| `PHOTOVERIFIER_RPC_URL` | No | none | Alias fallback for RPC URL |
| `ATTESTATION_PRIVATE_KEY_B58` | Yes | none | Attestation signer secret |
| `ATTESTATION_PUBLIC_KEY` | No | `Ga6Sx...` | Attestation signer pubkey |
| `NONCE_TTL_MS` | No | `600000` | Replay nonce cache TTL |
| `AWS_REGION` | No | `us-east-1` | S3 client region |
| `AWS_ACCESS_KEY_ID` | No | `test` | Local credentials (non-production) |
| `AWS_SECRET_ACCESS_KEY` | No | `test` | Local credentials (non-production) |

## Security Guidance

- Never commit private keys, seed phrases, or `ATTESTATION_PRIVATE_KEY_B58`.
- Treat RPC URLs containing API keys as secrets.
- Public program IDs and public keys are safe to commit.
