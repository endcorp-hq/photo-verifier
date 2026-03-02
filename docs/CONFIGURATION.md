# Configuration Reference

## Mobile App (`photo-verifier`)

Source: `photo-verifier/constants/app-config.ts` and `photo-verifier/app.json`.

| Variable | Required | Example | Purpose |
|---|---|---|---|
| `EXPO_PUBLIC_S3_BUCKET` | Yes | `photoverifier` | Target S3 bucket for generated `s3://` URI and key conventions |
| `EXPO_PUBLIC_S3_BASE_PREFIX` | Yes | `photos` | Object key prefix |
| `EXPO_PUBLIC_S3_PRESIGN_ENDPOINT` | Yes | `https://...execute-api.../uploads` | Presign API endpoint |
| `EXPO_PUBLIC_S3_CONTENT_TYPE` | No | `image/jpeg` | Upload content type |
| `EXPO_PUBLIC_SOLANA_RPC_URL` | Yes | `https://api.devnet.solana.com` | Cluster used for on-chain write flow |
| `EXPO_PUBLIC_SEEKER_VERIFICATION_RPC_URL` | Yes | `https://api.mainnet-beta.solana.com` | RPC used for Seeker token verification |
| `EXPO_PUBLIC_SEEKER_DEVNET_MINTS` | No | comma-separated mints | Optional cluster-specific Seeker allowlist |
| `EXPO_PUBLIC_SEEKER_TESTNET_MINTS` | No | comma-separated mints | Optional cluster-specific Seeker allowlist |
| `EXPO_PUBLIC_SEEKER_MAINNET_MINTS` | No | comma-separated mints | Optional cluster-specific Seeker allowlist |

## Demo Site (`demo-site`)

Primary runtime env consumed by API routes:

| Variable | Required | Example | Purpose |
|---|---|---|---|
| `S3_BUCKET` | Yes | `photoverifier` | Bucket to list/load images |
| `S3_REGION` | Yes | `us-east-1` | S3 client region |
| `S3_PREFIX` | Yes | `photos/` | List prefix |
| `S3_CDN_DOMAIN` | No | `cdn.example.com` | Optional public CDN URL fallback |
| `RPC_URL` | Yes | `https://api.devnet.solana.com` | Solana RPC for tx fallback/indexing |
| `PROGRAM_ID` | Yes | `3i6eNpCFvXhMg8LESAutXWKUtAey9mAbTziLLuUc78Hu` | Program to decode tx instructions for |
| `HELIUS_API_KEY` | No | key string | Enables Helius tx API path |
| `HELIUS_TX_API_BASE` | No | `https://api-devnet.helius.xyz` | Override tx API base |
| `MAX_LIST_ITEMS` | No | `200` | Max S3 items returned |
| `MAX_SIGNATURES` | No | `200` | Max signatures scanned |
| `TX_PAGE_SIZE` | No | `50` | Tx paging batch size |
| `LIST_CACHE_TTL_MS` | No | `15000` | List response cache TTL |
| `TX_CACHE_TTL_MS` | No | `5000` | Tx decode cache TTL |

## Presign Infra (`infra/presign-api.yaml` + `infra/deploy.sh`)

Deploy-time parameters:

| Parameter | Required | Example | Purpose |
|---|---|---|---|
| `BucketName` | Yes | `photoverifier` | S3 bucket for PUT URLs |
| `BucketRegion` | Yes | `us-east-1` | Region used for SigV4 signing and endpoint selection |
| `AllowedOrigin` | Yes | `*` | CORS allow origin |
| `UrlExpirySeconds` | Yes | `300` | Presigned URL expiry |
| `AttestationPrivateKeyBase58` | Yes | base58 secret | Server signing key used for on-chain attestation signatures |
| `AttestationPublicKey` | Yes | `Ga6...` | Expected public key for secret validation and response |

Runtime env in Lambda also includes AWS execution creds (`AWS_ACCESS_KEY_ID`, etc.) automatically.

## Local Presign Script (`scripts/run-presign.js`)

| Variable | Required | Example | Purpose |
|---|---|---|---|
| `S3_HOST` | Yes (local) | `http://localhost:4566` | LocalStack/endpoint |
| `BUCKET` | Yes | `photoverifier-dev` | Local bucket |
| `PORT` | No | `3000` | HTTP port |
| `SOLANA_RPC_URL` | Yes | `https://api.devnet.solana.com` | Chain anchor verification RPC |
| `ATTESTATION_PRIVATE_KEY_B58` | Yes | base58 secret | Attestation signer |
| `ATTESTATION_PUBLIC_KEY` | Yes | `Ga6...` | Signer pubkey check |
| `NONCE_TTL_MS` | No | `600000` | Replay cache TTL |
| `AWS_REGION` | No | `us-east-1` | S3 client region |

## Security Notes

- Never commit `ATTESTATION_PRIVATE_KEY_B58`.
- Treat RPC keys (`api-key` query strings, Helius keys) as secrets.
- Public keys and program IDs are safe to commit.
