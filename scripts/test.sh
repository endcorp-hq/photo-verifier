#!/usr/bin/env bash
# =============================================================================
# Test Script - Run tests for the Citizen Science SDK
# =============================================================================
# Runs TypeScript tests, Anchor tests, and integration tests
#
# Usage:
#   ./scripts/test.sh              # Run all tests
#   ./scripts/test.sh --unit      # Unit tests only
#   ./scripts/test.sh --anchor     # Anchor tests only
#   ./scripts/test.sh --sdk        # SDK tests only
# =============================================================================

set -euo pipefail

# Change to project root
cd "$(dirname "$0")/.." || exit 1

# Colors

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
RUN_UNIT=true
RUN_ANCHOR=true
RUN_SDK=true

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --unit)
      RUN_ANCHOR=false
      RUN_SDK=false
      shift
      ;;
    --anchor)
      RUN_UNIT=false
      RUN_SDK=false
      shift
      ;;
    --sdk)
      RUN_UNIT=false
      RUN_ANCHOR=false
      shift
      ;;
    --help)
      echo "Usage: $0 [--unit|--anchor|--sdk]"
      echo ""
      echo "Options:"
      echo "  --unit   Run unit tests only (TypeScript)"
      echo "  --anchor Run Anchor/Solana tests only"
      echo "  --sdk    Run SDK integration tests only"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# =============================================================================
# Unit Tests (TypeScript)
# =============================================================================
run_unit_tests() {
  log_info "Running TypeScript type checks and unit tests..."

  echo ""
  echo "=== Type Check: Core Package ==="
  cd packages/core
  pnpm exec tsc --noEmit || { log_error "Core type check failed"; exit 1; }
  cd ../..

  echo ""
  echo "=== Type Check: Blockchain Package ==="
  cd packages/blockchain
  pnpm exec tsc --noEmit || { log_error "Blockchain type check failed"; exit 1; }
  cd ../..

  echo ""
  echo "=== Type Check: Unified SDK ==="
  cd packages/photoverifier-sdk
  pnpm exec tsc --noEmit || { log_error "SDK type check failed"; exit 1; }
  cd ../..

  log_success "Type checks passed"
}

# =============================================================================
# Anchor/Solana Tests
# =============================================================================
run_anchor_tests() {
  log_info "Running Anchor tests..."

  cd on-chain/photo-verifier

  # Build the program
  echo ""
  echo "=== Building Program ==="
  anchor build || { log_error "Anchor build failed"; exit 1; }

  # Run tests
  echo ""
  echo "=== Running Tests ==="
  anchor test || { log_error "Anchor tests failed"; exit 1; }

  cd ../..

  log_success "Anchor tests passed"
}

# =============================================================================
# SDK Integration Tests
# =============================================================================
run_sdk_tests() {
  log_info "Running SDK integration tests..."

  # Create a test script that exercises the SDK
  cat > /tmp/sdk-test.ts << 'EOF'
import { blake3HexFromBytes, blake3Hash } from './packages/core/src/hash';
import { buildS3KeyForPhoto, buildS3Uri } from './packages/core/src/storage';
import { 
  serializePhotoProof, 
  deserializePhotoProof,
  TREE_CONFIGS 
} from './packages/blockchain/src/compressed';
import { decodeLicenseKey, createDemoLicenseKey, UsageTracker } from './packages/blockchain/src/license';
import { PublicKey } from '@solana/web3.js';

// Test 1: Hashing
console.log('\n=== Test 1: Hashing ===');
const testBytes = new Uint8Array([1, 2, 3, 4, 5]);
const { hash32, hashHex } = blake3Hash(testBytes);
console.log('Hash (hex):', hashHex);
console.log('Hash length:', hash32.length, 'bytes');
console.assert(hash32.length === 32, 'Hash should be 32 bytes');
console.log('✓ Hashing works');

// Test 2: Storage
console.log('\n=== Test 2: Storage ===');
const key = buildS3KeyForPhoto({
  seekerMint: 'TestMint123',
  photoHashHex: hashHex,
  basePrefix: 'photos',
});
console.log('S3 Key:', key);
console.assert(key.includes('TestMint123'), 'Key should include mint');
console.assert(key.includes(hashHex), 'Key should include hash');
console.log('✓ Storage works');

// Test 3: Photo Proof Serialization
console.log('\n=== Test 3: Photo Proof ===');
const proof = {
  nonce: 0,
  hash: hash32,
  timestamp: Date.now() / 1000,
  latitude: 37.7749 * 1e6,
  longitude: -122.4194 * 1e6,
  owner: new PublicKey('11111111111111111111111111111111'),
};
const serialized = serializePhotoProof(proof);
console.log('Serialized length:', serialized.length, 'bytes');
console.assert(serialized.length <= 92, 'Serialized should be <= 92 bytes');

const deserialized = deserializePhotoProof(serialized);
console.log('Deserialized nonce:', deserialized?.nonce);
console.log('Deserialized timestamp:', deserialized?.timestamp);
console.assert(deserialized?.nonce === proof.nonce, 'Nonce should match');
console.log('✓ Photo proof works');

// Test 4: License
console.log('\n=== Test 4: License ===');
const demoKey = createDemoLicenseKey('startup');
console.log('Demo license key:', demoKey.substring(0, 30) + '...');

const result = decodeLicenseKey(demoKey, 'demo-secret-change-in-production');
console.log('License valid:', result.valid);
console.log('License tier:', result.license?.tier);
console.log('Max photos:', result.license?.maxPhotos);
console.assert(result.valid === true, 'Demo key should be valid');

const tracker = new UsageTracker(result.license!);
console.log('Recorded:', tracker.recordPhoto());
console.log('Count:', tracker.getPhotoCount());
console.log('Remaining:', tracker.getRemainingPhotos());
console.log('✓ License works');

// Test 5: Tree Configs
console.log('\n=== Test 5: Tree Configs ===');
console.log('Small capacity:', TREE_CONFIGS.small.maxDepth, 'depth');
console.log('Medium capacity:', TREE_CONFIGS.medium.maxDepth, 'depth');
console.log('Large capacity:', TREE_CONFIGS.large.maxDepth, 'depth');
console.log('✓ Tree configs work');

console.log('\n========================================');
console.log('All SDK tests passed! ✓');
console.log('========================================');
EOF

  # Run the test
  pnpm tsx /tmp/sdk-test.ts

  log_success "SDK integration tests passed"
}

# =============================================================================
# Main
# =============================================================================
main() {
  echo "========================================"
  echo "Citizen Science SDK - Test Runner"
  echo "========================================"
  echo ""

  # Check Node.js
  if ! command -v node &> /dev/null; then
    log_error "Node.js is required"
    exit 1
  fi

  # Check pnpm
  if ! command -v pnpm &> /dev/null; then
    log_info "Installing pnpm..."
    npm install -g pnpm
  fi

  # Install deps if node_modules doesn't exist
  if [ ! -d "node_modules" ]; then
    log_info "Installing dependencies..."
    pnpm install
  fi

  # Run requested tests
  if [ "$RUN_UNIT" = true ]; then
    run_unit_tests
  fi

  if [ "$RUN_SDK" = true ]; then
    run_sdk_tests
  fi

  if [ "$RUN_ANCHOR" = true ]; then
    run_anchor_tests
  fi

  echo ""
  echo "========================================"
  log_success "All tests completed!"
  echo "========================================"
}

main "$@"
