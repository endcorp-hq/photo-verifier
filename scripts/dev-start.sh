#!/usr/bin/env bash
# =============================================================================
# PhotoVerifier - Development Startup Script
# =============================================================================
# Deploys Solana program to devnet and sets up local environment
# =============================================================================

set -euo pipefail

RPC_URL="https://api.devnet.solana.com"
SOLANA_VERSION="1.18.1"
ANCHOR_VERSION="0.31.0"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Check if Solana is installed
check_solana() {
  if ! command -v solana &> /dev/null; then
    log_info "Installing Solana CLI v$SOLANA_VERSION..."
    sh -c "$(curl -sSfL 'https://release.solana.com/v${SOLANA_VERSION}/install')"
    export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
  fi
  log_success "Solana: $(solana --version | awk '{print $2}')"
}

# Check if Anchor is installed
check_anchor() {
  if ! command -v anchor &> /dev/null; then
    log_info "Installing Anchor..."
    cargo install --git https://github.com/coral-xyz/anchor avm --locked --force 2>/dev/null || true
    avm install "$ANCHOR_VERSION" 2>/dev/null || true
    avm use "$ANCHOR_VERSION" 2>/dev/null || true
  fi
  log_success "Anchor: $(anchor --version | awk '{print $2}' 2>/dev/null || echo 'available')"
}

# Configure Solana for devnet
configure_solana() {
  log_info "Configuring Solana for devnet..."
  solana config set --url "$RPC_URL"
  solana config get
}

# Build and deploy program
deploy_program() {
  log_info "Deploying Solana program to devnet..."
  
  cd on-chain/photo-proof-compressed
  
  # Build the program
  anchor build
  
  # Get program ID
  PROGRAM_ID=$(solana address -k target/deploy/photo_proof_compressed-keypair.json 2>/dev/null || echo "Not found")
  
  # Deploy
  anchor deploy
  
  cd ../..
  
  log_success "Program deployed!"
  log_info "Program ID: $PROGRAM_ID"
  
  # Save to .env
  cat > photo-verifier/.env << EOF
# Solana
EXPO_PUBLIC_SOLANA_RPC_URL=$RPC_URL
PHOTOVERIFIER_PROGRAM_ID=$PROGRAM_ID
EOF
  
  log_success "Created photo-verifier/.env with program ID"
}

# Install node dependencies
install_deps() {
  log_info "Installing dependencies..."
  
  # Build SDK packages first
  cd packages/photoverifier-sdk
  pnpm build
  cd ../..
  
  cd packages/core
  pnpm build
  cd ../..
  
  cd packages/blockchain
  pnpm build
  cd ../..
  
  # Install photo-verifier deps
  cd photo-verifier
  pnpm install
  cd ..
  
  log_success "Dependencies installed"
}

# Main
main() {
  echo "========================================"
  echo "PhotoVerifier - Dev Startup"
  echo "========================================"
  echo ""
  
  check_solana
  check_anchor
  configure_solana
  
  echo ""
  read -p "Deploy Solana program to devnet? (y/n) " -n 1 -r
  echo ""
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    deploy_program
  fi
  
  echo ""
  read -p "Install dependencies? (y/n) " -n 1 -r
  echo ""
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    install_deps
  fi
  
  echo ""
  echo "========================================"
  log_success "Done!"
  echo "========================================"
  echo ""
  echo "Next steps:"
  echo "  1. Get test SOL:     solana airdrop 2"
  echo "  2. Run mobile app:   cd photo-verifier && pnpm dev"
  echo ""
}

main "$@"
