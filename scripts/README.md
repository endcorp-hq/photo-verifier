# Development Scripts

This directory contains scripts for setting up and testing the Citizen Science SDK.

## Quick Start

```bash
# 1. Full setup (installs all dependencies, configures Solana, deploys S3)
./scripts/dev-setup.sh

# 2. Quick test (tests all SDK components)
./scripts/quick-test.sh

# 3. Start local development services
./scripts/dev-local.sh
```

## Available Scripts

### dev-setup.sh
Full development environment setup:
- Checks and installs prerequisites (Node.js, AWS CLI)
- Installs Solana CLI and Anchor
- Configures Solana for devnet
- Sets up S3 bucket and presign API
- Creates test wallets
- Installs Node.js dependencies

**Usage:**
```bash
./scripts/dev-setup.sh              # Full setup
./scripts/dev-setup.sh --skip-deps  # Skip installing dependencies
./scripts/dev-setup.sh --local-s3   # Use local S3 instead of AWS
```

### dev-local.sh
Starts local development services using LocalStack (Docker):
- LocalStack container for S3 emulation
- Presigned URL API server
- Creates `.env.local` with local configuration

**Usage:**
```bash
./scripts/dev-local.sh     # Start services
./scripts/dev-local.sh --stop  # Stop services
```

### test.sh
Runs tests for the SDK:
- TypeScript type checking
- SDK unit tests
- Anchor/Solana program tests

**Usage:**
```bash
./scripts/test.sh       # Run all tests
./scripts/test.sh --unit    # TypeScript tests only
./scripts/test.sh --anchor  # Anchor tests only
./scripts/test.sh --sdk     # SDK integration tests only
```

### quick-test.sh
Quick smoke test of all SDK components without needing full infrastructure:
- License system
- Compressed accounts serialization
- Storage utilities
- Hashing
- Location services (if available)

**Usage:**
```bash
./scripts/quick-test.sh      # Test core functionality
./scripts/quick-test.sh --chain  # Include Solana tests (requires devnet)
```

## Manual Setup (Alternative)

If you prefer to set up manually:

### 1. Install Dependencies
```bash
# Install Node.js dependencies
pnpm install

# Install Solana CLI
sh -c "$(curl -sSfL 'https://release.solana.com/v1.18.1/install')"

# Install Anchor
cargo install --git https://github.com/coral-xyz/anchor avm --locked
avm install latest
avm use latest
```

### 2. Configure Solana
```bash
solana config set --url https://api.devnet.solana.com
solana-keygen new --no-passphrase  # Create wallet
solana airdrop 2  # Get test SOL
```

### 3. Set Up S3
Option A - Local with LocalStack:
```bash
docker run -d -p 4566:4566 localstack/localstack
aws --endpoint-url=http://localhost:4566 s3 mb s3://photoverifier-dev
```

Option B - Real AWS:
```bash
aws configure
aws s3 mb s3://photoverifier-dev
# Deploy CloudFormation
cd infra && ./deploy.sh photoverifier photoverifier-dev "*"
```

### 4. Set Environment Variables
```bash
export PHOTOVERIFIER_RPC_URL=https://api.devnet.solana.com
export PHOTOVERIFIER_S3_PRESIGN_URL=https://your-api.execute-api.region.amazonaws.com/prod/uploads
export PHOTOVERIFIER_S3_BUCKET=photoverifier-dev
export PHOTOVERIFIER_S3_REGION=us-east-1
```

### 5. Build and Deploy Program
```bash
cd on-chain/photo-verifier
anchor build
anchor deploy
```

## Troubleshooting

### "Command not found: pnpm"
```bash
npm install -g pnpm
```

### "AWS credentials not configured"
```bash
aws configure
# Or use LocalStack: ./scripts/dev-local.sh
```

### "Solana airdrop failed"
- Devnet may be congested. Try again or use a different RPC:
```bash
solana config set --url https://api.mainnet-beta.solana.com  # Not recommended for testing
```

### "LocalStack not responding"
```bash
# Restart LocalStack
docker restart localstack
# Or check logs
docker logs localstack
```

## Next Steps

After setup:
1. Run the mobile app: `cd photo-verifier && pnpm dev`
2. Run the demo site: `cd demo-site && pnpm dev`
3. Deploy the Solana program: `cd on-chain/photo-verifier && anchor deploy`
