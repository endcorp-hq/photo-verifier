# Devnet Deploy and Smoke Test Runbook

This runbook describes a fresh deploy of program + presign API and a minimal smoke validation.

## Prerequisites

- Solana CLI configured and funded for devnet.
- Anchor CLI installed.
- AWS CLI authenticated for target account.
- `ATTESTATION_PRIVATE_KEY_B58` available at deploy time.

## 1) Build and Deploy Program

From repo root:

```bash
cd on-chain/photo-proof-compressed
anchor build
anchor deploy --provider.cluster devnet
```

Confirm program:

```bash
solana program show 3i6eNpCFvXhMg8LESAutXWKUtAey9mAbTziLLuUc78Hu --url devnet
```

## 2) Upgrade IDL on Devnet

```bash
cd on-chain/photo-proof-compressed
anchor idl upgrade \
  --provider.cluster devnet \
  --filepath target/idl/photo_proof_compressed.json \
  3i6eNpCFvXhMg8LESAutXWKUtAey9mAbTziLLuUc78Hu
```

## 3) Deploy Presign API

```bash
cd infra
AWS_DEFAULT_REGION=us-west-2 \
ATTESTATION_PRIVATE_KEY_B58=<base58-secret> \
./deploy.sh photoverifier-presign photoverifier '*' Ga6SxqKLPTzrc4pykqrawSi9pvz3ZGhAdnZSBDKKioYk
```

Notes:

- `deploy.sh` detects bucket region and passes it to CloudFormation.
- This avoids S3 `PermanentRedirect` errors caused by wrong endpoint signing.

## 4) Confirm Lambda Runtime and Key Wiring

```bash
aws lambda get-function-configuration \
  --region us-west-2 \
  --function-name photoverifier-presign-PresignFunction-MpFXgnHuIyze \
  --query '{Runtime:Runtime,BucketRegion:Environment.Variables.BUCKET_REGION,AttestationPublicKey:Environment.Variables.ATTESTATION_PUBLIC_KEY}' \
  --output json
```

Expected:

- `Runtime` is `nodejs18.x`
- `BucketRegion` matches bucket region (for `photoverifier`, `us-east-1`)
- `AttestationPublicKey` is current public key

## 5) App Validation Path

1. Launch app with `EXPO_PUBLIC_S3_PRESIGN_ENDPOINT` pointing to deployed `/uploads`.
2. Capture a photo and submit.
3. Verify upload succeeds and tx signature is returned.
4. Verify demo-site shows image and on-chain match.

## 6) Optional CLI Checks

Check current tree config account exists:

```bash
node - <<'NODE'
const { Connection, PublicKey } = require('@solana/web3.js');
(async()=>{
  const conn = new Connection('https://api.devnet.solana.com','confirmed');
  const pid = new PublicKey('3i6eNpCFvXhMg8LESAutXWKUtAey9mAbTziLLuUc78Hu');
  const [treeConfig] = PublicKey.findProgramAddressSync([Buffer.from('tree_config')], pid);
  const info = await conn.getAccountInfo(treeConfig);
  console.log('tree_config', treeConfig.toBase58(), 'exists', !!info);
})();
NODE
```

## 7) Post-Deploy Checklist

- Program deploy succeeded on expected ID.
- IDL upgraded for same ID.
- Presign endpoint returns `attestationSignature` and `attestationPublicKey`.
- App can complete upload + on-chain append on devnet.
