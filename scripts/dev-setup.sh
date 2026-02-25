#!/usr/bin/env bash
# =============================================================================
# Citizen Science SDK - Development Setup Script
# =============================================================================
# This script sets up the complete development environment including:
# - Solana CLI and Anchor
# - Node.js dependencies
# - S3 backend (local or AWS)
# - Solana program deployment
# - Test wallet setup
#
# Usage:
#   ./scripts/dev-setup.sh              # Full setup
#   ./scripts/dev-setup.sh --skip-deps # Skip installing dependencies
#   ./scripts/dev-setup.sh --local-s3   # Use local S3 instead of AWS
# =============================================================================

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SOLANA_VERSION="1.18.1"
ANCHOR_VERSION="0.31.0"
RPC_URL="https://api.devnet.solana.com"

# Parse arguments
SKIP_DEPS=false
LOCAL_S3=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --skip-deps)
      SKIP_DEPS=true
      shift
      ;;
    --local-s3)
      LOCAL_S3=true
      shift
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# =============================================================================
# Check Prerequisites
# =============================================================================
check_prereqs() {
  log_info "Checking prerequisites..."

  local missing=()

  if ! command -v node &> /dev/null; then
    missing+=("Node.js")
  fi

  if ! command -v yarn &> /dev/null && ! command -v pnpm &> /dev/null && ! command -v npm &> /dev/null; then
    missing+=("Package manager (npm/yarn/pnpm)")
  fi

  if ! command -v aws &> /dev/null; then
    missing+=("AWS CLI")
  fi

  if [ ${#missing[@]} -gt 0 ]; then
    log_error "Missing prerequisites: ${missing[*]}"
    echo "Please install the missing tools and try again."
    exit 1
  fi

  log_success "All prerequisites found"
}

# =============================================================================
# Install Solana CLI
# =============================================================================
install_solana() {
  if command -v solana &> /dev/null; then
    local current_version
    current_version=$(solana --version | awk '{print $2}')
    log_info "Solana CLI already installed: v${current_version}"
    
    if [[ "$current_version" == "$SOLANA_VERSION" ]]; then
      return 0
    fi
    
    log_warn "Version mismatch. Expected: $SOLANA_VERSION"
  fi

  log_info "Installing Solana CLI v$SOLANA_VERSION..."
  
  sh -c "$(curl -sSfL 'https://release.solana.com/v${SOLANA_VERSION}/install')"
  
  # Add to PATH for current session
  export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
  
  log_success "Solana CLI installed"
}

# =============================================================================
# Install Anchor
# =============================================================================
install_anchor() {
  if command -v anchor &> /dev/null; then
    local current_version
    current_version=$(anchor --version | awk '{print $2}')
    log_info "Anchor already installed: v${current_version}"
    return 0
  fi

  log_info "Installing Anchor v$ANCHOR_VERSION..."

  # Install cargo if needed
  if ! command -v cargo &> /dev/null; then
    log_info "Installing Rust..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source "$HOME/.cargo/env"
  fi

  # Install anchor
  cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
  avm install "$ANCHOR_VERSION"
  avm use "$ANCHOR_VERSION"

  log_success "Anchor installed"
}

# =============================================================================
# Install Node Dependencies
# =============================================================================
install_deps() {
  if [ "$SKIP_DEPS" = true ]; then
    log_info "Skipping dependency installation"
    return 0
  fi

  log_info "Installing Node dependencies..."

  # Install pnpm if not present
  if ! command -v pnpm &> /dev/null; then
    npm install -g pnpm
  fi

  # Install root dependencies
  pnpm install --frozen-lockfile

  # Install workspace dependencies
  pnpm install

  log_success "Node dependencies installed"
}

# =============================================================================
# Configure Solana
# =============================================================================
configure_solana() {
  log_info "Configuring Solana..."

  # Set config for devnet
  solana config set --url "$RPC_URL"

  # Create dev wallet if it doesn't exist
  if [ ! -f "$HOME/.config/solana/dev-wallet.json" ]; then
    log_info "Creating dev wallet..."
    solana-keygen new --no-passphrase --outfile "$HOME/.config/solana/dev-wallet.json"
    log_warn "Dev wallet created at: $HOME/.config/solana/dev-wallet.json"
    log_warn "IMPORTANT: This is for testing only! Backup this file!"
  fi

  # Set wallet
  solana config set --keypair "$HOME/.config/solana/dev-wallet.json"

  # Show config
  solana config get

  log_success "Solana configured"
}

# =============================================================================
# Setup S3 Backend
# =============================================================================
setup_s3() {
  log_info "Setting up S3 backend..."

  if [ "$LOCAL_S3" = true ]; then
    log_warn "Local S3 mode requested - will use mocked endpoints"
    log_info "Set these environment variables in your .env:"
    echo "
PHOTOVERIFIER_S3_PRESIGN_URL=http://localhost:3000/api/presign
PHOTOVERIFIER_S3_BUCKET=photoverifier-dev
PHOTOVERIFIER_RPC_URL=$RPC_URL
"
    return 0
  fi

  # Check if AWS credentials are configured
  if ! aws sts get-caller-identity &> /dev/null; then
    log_error "AWS credentials not configured"
    log_info "Run 'aws configure' to set up your credentials"
    exit 1
  fi

  # Prompt for bucket name
  read -p "Enter S3 bucket name [photoverifier-dev]: " BUCKET_NAME
  BUCKET_NAME=${BUCKET_NAME:-photoverifier-dev}

  # Create bucket if it doesn't exist
  if ! aws s3api head-bucket --bucket "$BUCKET_NAME" 2>/dev/null; then
    log_info "Creating S3 bucket: $BUCKET_NAME"
    aws s3 mb "s3://$BUCKET_NAME" --region us-east-1
  else
    log_info "S3 bucket already exists: $BUCKET_NAME"
  fi

  # Set CORS
  log_info "Setting CORS configuration..."
  aws s3api put-bucket-cors \
    --bucket "$BUCKET_NAME" \
    --cors-configuration file://"$(pwd)/infra/s3-cors.json"

  # Deploy presign API
  log_info "Deploying presign API..."
  STACK_NAME="photoverifier-$(date +%s)"
  cd infra
  bash deploy.sh "$STACK_NAME" "$BUCKET_NAME" "*"
  cd ..

  log_success "S3 backend configured"
}

# =============================================================================
# Deploy Solana Program
# =============================================================================
deploy_program() {
  log_info "Deploying Solana program..."

  # Get airdrop for devnet if needed
  log_info "Checking SOL balance..."
  BALANCE=$(solana balance --lamports | awk '{print $1}')
  
  if [ "$BALANCE" -lt 1000000000 ]; then
    log_info "Requesting airdrop..."
    solana airdrop 2
  fi

  # Build and deploy the program
  cd on-chain/photo-verifier
  anchor build
  anchor deploy
  cd ../..

  # Get the program ID
  PROGRAM_ID=$(solana program show "$(ls -t on-chain/photo-verifier/target/deploy/*.so | head -1 | sed 's/.*-//; s/.so//')" | awk '/Program Id:/ {print $3}')

  log_success "Program deployed: $PROGRAM_ID"
  log_info "Update PHOTO_VERIFIER_PROGRAM_ID in your config"
}

# =============================================================================
# Create Test Data
# =============================================================================
create_test_data() {
  log_info "Creating test data..."

  # Generate a test wallet for the app
  TEST_WALLET="$HOME/.config/solana/test-wallet.json"
  
  if [ ! -f "$TEST_WALLET" ]; then
    solana-keygen new --no-passphrase --outfile "$TEST_WALLET"
    log_info "Test wallet created: $TEST_WALLET"
  fi

  # Airdrop to test wallet
  solana airdrop 2 --keypair "$TEST_WALLET"

  # Create .env.local for demo-site
  cat > demo-site/.env.local << EOF
# Solana
RPC_URL=$RPC_URL

# S3 (update after running setup-s3)
S3_BUCKET=photoverifier-dev
S3_REGION=us-east-1
S3_PREFIX=photos/
EOF

  log_success "Test data created"
}

# =============================================================================
# Main
# =============================================================================
main() {
  echo "========================================"
  echo "Citizen Science SDK - Dev Setup"
  echo "========================================"
  echo ""

  check_prereqs
  install_solana
  install_anchor
  configure_solana
  install_deps
  setup_s3
  create_test_data

  echo ""
  echo "========================================"
  log_success "Setup complete!"
  echo "========================================"
  echo ""
  echo "Next steps:"
  echo "  1. Run the mobile app:     cd photo-verifier && pnpm dev"
  echo "  2. Run the demo site:      cd demo-site && pnpm dev"
  echo "  3. Run tests:              cd on-chain/photo-verifier && anchor test"
  echo ""
  echo "Environment variables to set:"
  echo "  export PHOTOVERIFIER_S3_PRESIGN_URL=<from S3 setup>"
  echo "  export PHOTOVERIFIER_S3_BUCKET=<bucket-name>"
  echo "  export PHOTOVERIFIER_RPC_URL=$RPC_URL"
  echo ""
}

main "$@"
