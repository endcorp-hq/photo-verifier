# Photo Verifier Demo Site

Next.js site that lists uploaded photos and correlates them with on-chain `record_photo_proof` transactions.

## Features

- list images from S3 prefix
- decode proof metadata from transaction instructions
- show verification summary (matched/unmatched)
- fallback from Helius tx API to RPC scan when rate-limited

## Run

```bash
pnpm install
pnpm -C demo-site dev
```

## Environment Variables

| Variable | Required | Purpose |
|---|---|---|
| `S3_BUCKET` | Yes | S3 bucket containing image objects |
| `S3_REGION` | No | S3 client region (default `us-east-1`) |
| `S3_PREFIX` | No | Object prefix (default `photos/`) |
| `S3_CDN_DOMAIN` | No | Optional CDN domain |
| `RPC_URL` | No | Solana RPC for fallback tx scan |
| `PROGRAM_ID` | No | Program ID used for instruction decoding |
| `HELIUS_API_KEY` | No | Enables Helius tx index path |
| `HELIUS_TX_API_BASE` | No | Override Helius tx API base |
| `MAX_LIST_ITEMS` | No | Max objects to list |
| `MAX_SIGNATURES` | No | Max signatures to scan |
| `TX_PAGE_SIZE` | No | Tx page size |
| `LIST_CACHE_TTL_MS` | No | List cache TTL |
| `TX_CACHE_TTL_MS` | No | Tx cache TTL |

## AWS Permissions

Runtime identity needs:

- `s3:ListBucket` on the target bucket
- `s3:GetObject` on objects under configured prefix
