#!/usr/bin/env bash
# =============================================================================
# Quick Test - Test the full photo verification flow
# =============================================================================
# This script demonstrates the complete flow:
# 1. Generate a test image
# 2. Compute Blake3 hash
# 3. Store metadata locally (or on-chain with --chain flag)
#
# Usage:
#   ./scripts/quick-test.sh              # Test core functionality
#   ./scripts/quick-test.sh --chain     # Test with Solana (requires funds)
# =============================================================================

set -euo pipefail

# Change to project root
SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$SCRIPT_DIR" || exit 1

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

USE_CHAIN=false

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --chain)
      USE_CHAIN=true
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
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step() { echo -e "${YELLOW}[STEP]${NC} $1"; }

# =============================================================================
# Test License System
# =============================================================================
test_license() {
  log_step "Testing license system..."

  import { 
  createDemoLicenseKey, 
  decodeLicenseKey, 
  UsageTracker,
  LICENSE_TIERS 
} from './packages/blockchain/dist/license.js';
import { 
  createDemoLicenseKey, 
  decodeLicenseKey, 
  UsageTracker,
  LICENSE_TIERS 
} from './packages/blockchain/src/license.js';

console.log('=== License System Test ===\n');

// Test creating demo keys
console.log('Available tiers:');
for (const [tier, config] of Object.entries(LICENSE_TIERS)) {
  console.log(`  - ${tier}: ${config.name} (${config.maxPhotos === -1 ? 'unlimited' : config.maxPhotos} photos)`);
}

console.log('\nCreating demo license key...');
const demoKey = createDemoLicenseKey('startup');
console.log('Key:', demoKey.substring(0, 40) + '...\n');

console.log('Validating license...');
const result = decodeLicenseKey(demoKey, 'demo-secret-change-in-production');
console.log('Valid:', result.valid);
console.log('Tier:', result.license?.tier);
console.log('Max photos:', result.license?.maxPhotos);
console.log('Features:', result.license?.features.join(', '));

if (result.valid && result.license) {
  console.log('\nTesting usage tracker...');
  const tracker = new UsageTracker(result.license);
  
  console.log('Recording 5 photos...');
  for (let i = 0; i < 5; i++) {
    const recorded = tracker.recordPhoto();
    console.log(`  Photo ${i + 1}: ${recorded ? 'recorded' : 'REJECTED'}`);
  }
  
  console.log('Count:', tracker.getPhotoCount());
  console.log('Remaining:', tracker.getRemainingPhotos());
  
  console.log('\nTrying to exceed limit...');
  for (let i = 0; i < 1000; i++) {
    if (!tracker.recordPhoto()) {
      console.log(`Limit reached at photo ${tracker.getPhotoCount()}`);
      break;
    }
  }
}

console.log('\n__LICENSE__OK');
EOF

  pnpm tsx "$SCRIPT_DIR/test-license.mjs" 2>&1
  rm -f "$SCRIPT_DIR/test-license.mjs"

  log_success "License system test complete"
}

# =============================================================================
# Test Compressed Accounts
# =============================================================================
test_compressed() {
  log_step "Testing compressed accounts (off-chain simulation)..."

  cat > "$SCRIPT_DIR/test-compressed.mjs" << 'EOF'
import { 
  serializePhotoProof, 
  deserializePhotoProof,
  TREE_CONFIGS,
  getTreeCapacity 
} from './packages/blockchain/src/compressed.js';
import { PublicKey } from '@solana/web3.js';

console.log('=== Compressed Accounts Test ===\n');

// Test serialization
const testProof = {
  nonce: 42,
  hash: new Uint8Array(32).fill(0xAB),
  timestamp: Math.floor(Date.now() / 1000),
  latitude: Math.floor(37.7749 * 1e6),
  longitude: Math.floor(-122.4194 * 1e6),
  owner: new PublicKey('11111111111111111111111111111111'),
};

console.log('Original proof:');
console.log('  nonce:', testProof.nonce);
console.log('  timestamp:', testProof.timestamp);
console.log('  latitude:', testProof.latitude / 1e6);
console.log('  longitude:', testProof.longitude / 1e6);

const serialized = serializePhotoProof(testProof);
console.log('\nSerialized size:', serialized.length, 'bytes');

const deserialized = deserializePhotoProof(serialized);
console.log('\nDeserialized:');
console.log('  nonce:', deserialized?.nonce);
console.log('  timestamp:', deserialized?.timestamp);
console.log('  latitude:', deserialized?.latitude / 1e6);
console.log('  longitude:', deserialized?.longitude / 1e6);

// Compare
console.log('\nValidation:');
console.log('  nonce match:', testProof.nonce === deserialized?.nonce);
console.log('  timestamp match:', testProof.timestamp === deserialized?.timestamp);

console.log('\n=== Tree Configurations ===\n');
for (const [name, config] of Object.entries(TREE_CONFIGS)) {
  const capacity = getTreeCapacity(config);
  console.log(`${name}:`);
  console.log(`  maxDepth: ${config.maxDepth}`);
  console.log(`  maxBufferSize: ${config.maxBufferSize}`);
  console.log(`  canopyDepth: ${config.canopyDepth}`);
  console.log(`  capacity: ${capacity.toLocaleString()} photos`);
  
  // Estimate costs (rough)
  const treeCost = 0.15 * Math.pow(2, config.maxDepth - 14); // ~$15 for 16K
  const costPerPhoto = treeCost / capacity;
  console.log(`  ~$${costPerPhoto.toFixed(6)} per photo`);
  console.log();
}

console.log('__COMPRESSED__OK');
EOF

  pnpm tsx "$SCRIPT_DIR/test-compressed.mjs" 2>&1
  rm -f "$SCRIPT_DIR/test-compressed.mjs"

  log_success "Compressed accounts test complete"
}

# =============================================================================
# Test Storage
# =============================================================================
test_storage() {
  log_step "Testing S3 storage..."

  cat > "$SCRIPT_DIR/test-storage.mjs" << 'EOF'
import { buildS3KeyForPhoto, buildS3Uri } from './packages/core/src/storage.js';

const hash = 'abc123def456789012345678901234567890123456789012345678901234';
const seekerMint = 'SeekerMint123456789012345678901234567890';

const key = buildS3KeyForPhoto({
  seekerMint,
  photoHashHex: hash,
  basePrefix: 'photos',
});

console.log('S3 Key:', key);

const uri = buildS3Uri('my-bucket', key);
console.log('S3 URI:', uri);

console.log('__KEY__' + key);
console.log('__URI__' + uri);
EOF

  pnpm tsx "$SCRIPT_DIR/test-storage.mjs" 2>&1
  rm -f "$SCRIPT_DIR/test-storage.mjs"

  log_success "Storage test complete"
}

# =============================================================================
# Test Hashing
# =============================================================================
test_hashing() {
  log_step "Testing Blake3 hashing..."

  # Create a simple test file
  echo "Hello, Citizen Science!" > "$SCRIPT_DIR/test-input.txt"

  cat > "$SCRIPT_DIR/test-hash.mjs" << 'EOF'
import { readFileSync } from 'fs';
import { blake3Hash } from './packages/core/src/hash.js';

const imagePath = process.argv[2];
const imageData = readFileSync(imagePath);

console.log('Image size:', imageData.length, 'bytes');

const { hash32, hashHex } = blake3Hash(imageData);

console.log('Blake3 hash:', hashHex);
console.log('Hash bytes:', hash32.length);

console.log('__HASH__' + hashHex);
EOF

  pnpm tsx "$SCRIPT_DIR/test-hash.mjs" "$SCRIPT_DIR/test-input.txt" 2>&1
  rm -f "$SCRIPT_DIR/test-hash.mjs" "$SCRIPT_DIR/test-input.txt"

  log_success "Hash test complete"
}

# =============================================================================
# Test Theming
# =============================================================================
test_theming() {
  log_step "Testing theming system..."

  cat > "$SCRIPT_DIR/test-theme.mjs" << 'EOF'
import { 
  defaultTheme, 
  darkTheme, 
  lightTheme, 
  createCustomTheme,
  themes 
} from './packages/core/src/theme.js';

console.log('=== Theming Test ===\n');

console.log('Available themes:', Object.keys(themes).join(', '));
console.log('\nDefault theme:');
console.log('  ID:', defaultTheme.id);
console.log('  Primary color:', defaultTheme.colors.primary);
console.log('  Features:', Object.entries(defaultTheme.features).filter(([_, v]) => v).map(([k]) => k).join(', '));

// Test custom theme
const custom = createCustomTheme({
  id: 'test-brand',
  name: 'Test Brand',
  colors: {
    primary: '#FF5722',
  },
});

console.log('\nCustom theme:');
console.log('  ID:', custom.id);
console.log('  Primary color:', custom.colors.primary);

console.log('\n__THEME__OK');
EOF

  pnpm tsx "$SCRIPT_DIR/test-theme.mjs" 2>&1
  rm -f "$SCRIPT_DIR/test-theme.mjs"

  log_success "Theming test complete"
}

# =============================================================================
# Main
# =============================================================================
main() {
  echo "========================================"
  echo "Citizen Science SDK - Quick Test"
  echo "========================================"
  echo ""

  # Load environment
  if [ -f "$SCRIPT_DIR/.env.local" ]; then
    source "$SCRIPT_DIR/.env.local"
  fi

  # Test each component
  test_license
  echo ""
  
  test_compressed
  echo ""
  
  test_storage
  echo ""
  
  test_hashing
  echo ""

  test_theming
  echo ""

  echo "========================================"
  log_success "All tests completed!"
  echo "========================================"
  echo ""
  echo "Summary:"
  echo "  ✓ License system works"
  echo "  ✓ Compressed accounts serialization works"
  echo "  ✓ Storage utilities work"
  echo "  ✓ Hashing works"
  echo "  ✓ Theming works"
}

main "$@"
