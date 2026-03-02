# Devnet Deploy and Smoke Test Runbook

This runbook covers a full development deployment path for:

- on-chain program + IDL
- presign backend
- mobile app + demo site validation

## Prerequisites

- Solana CLI configured and funded on devnet
- Anchor CLI installed
- AWS CLI authenticated
- `ATTESTATION_PRIVATE_KEY_B58` available at deploy time

## 1) Build and Deploy Program

```bash
cd on-chain/photo-proof-compressed
anchor build
anchor deploy --provider.cluster devnet
```

Confirm expected program:

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

The deploy script:

- auto-detects S3 bucket region
- configures S3 CORS
- deploys CloudFormation stack
- prints API endpoint and `/uploads` URL

## 4) Configure App

Set app config/env to deployed presign URL and target write RPC.

Minimum values:

- `EXPO_PUBLIC_S3_PRESIGN_ENDPOINT`
- `EXPO_PUBLIC_S3_BUCKET`
- `EXPO_PUBLIC_S3_BASE_PREFIX`
- `EXPO_PUBLIC_SOLANA_RPC_URL`
- `EXPO_PUBLIC_SEEKER_VERIFICATION_RPC_URL` (mainnet allowed)

## 5) Smoke Test (Mobile)

1. Open app and connect wallet.
2. Ensure Seeker verification passes.
3. Capture photo.
4. Submit proof.
5. Confirm success notice and returned transaction signature.

## 6) Smoke Test (Demo Site)

1. Load `demo-site`.
2. Verify new image appears in list.
3. Verify proof metadata includes `hashHex`, `h3Cell`, signature/tx link.
4. Confirm verification summary updates.

## 7) Optional Program State Check

```bash
node - <<'NODE'
const { Connection, PublicKey } = require('@solana/web3.js');
(async () => {
  const conn = new Connection('https://api.devnet.solana.com', 'confirmed');
  const pid = new PublicKey('3i6eNpCFvXhMg8LESAutXWKUtAey9mAbTziLLuUc78Hu');
  const [treeConfig] = PublicKey.findProgramAddressSync([Buffer.from('tree_config')], pid);
  const info = await conn.getAccountInfo(treeConfig);
  console.log('tree_config', treeConfig.toBase58(), 'exists', !!info);
})();
NODE
```

## Post-Deploy Checklist

- Program deploy succeeded on expected ID
- IDL upgraded for same ID
- Presign response includes `attestationSignature`
- App upload + on-chain append succeeds
- Demo site displays corresponding proof data
