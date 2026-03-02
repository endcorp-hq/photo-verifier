# Photo Verifier App (Expo)

Mobile reference app for the photo verification flow.

## What It Does

- wallet sign-in and Seeker gating
- camera capture and local BLAKE3 hashing
- H3 location encoding (default resolution `7`)
- presign attestation request
- S3 upload
- on-chain proof submit (compressed append route)
- local gallery/history view

## Run

```bash
pnpm install
pnpm -C photo-verifier dev
```

## Useful Commands

```bash
pnpm -C photo-verifier exec tsc --noEmit
pnpm -C photo-verifier lint:check
pnpm -C photo-verifier android
pnpm -C photo-verifier ios
```

## Required App Config

Set via env or `app.json` `expo.extra`:

- `EXPO_PUBLIC_S3_PRESIGN_ENDPOINT`
- `EXPO_PUBLIC_S3_BUCKET`
- `EXPO_PUBLIC_S3_BASE_PREFIX`
- `EXPO_PUBLIC_SOLANA_RPC_URL`
- `EXPO_PUBLIC_SEEKER_VERIFICATION_RPC_URL`

Optional:

- `EXPO_PUBLIC_H3_RESOLUTION` (default `7`)
- `EXPO_PUBLIC_S3_CONTENT_TYPE` (default `image/jpeg`)

## Notes

- Seeker verification cluster can differ from proof write cluster.
- Do not commit API keys or secrets in config values.
