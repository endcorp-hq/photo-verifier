#!/usr/bin/env bash
# =============================================================================
# Local Development Server
# =============================================================================
# Starts all services needed for local development using LocalStack
# for S3 emulation
#
# Requirements:
# - Docker (for LocalStack)
# - Node.js
# - Solana CLI
#
# Usage:
#   ./scripts/dev-local.sh          # Start all services
#   ./scripts/dev-local.sh --stop  # Stop all services
# =============================================================================

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# =============================================================================
# Check Docker
# =============================================================================
check_docker() {
  if ! command -v docker &> /dev/null; then
    log_error "Docker is required but not installed"
    exit 1
  fi

  if ! docker info &> /dev/null; then
    log_error "Docker is not running. Please start Docker and try again."
    exit 1
  fi

  log_success "Docker is running"
}

# =============================================================================
# Start LocalStack
# =============================================================================
start_localstack() {
  log_info "Starting LocalStack..."

  # Check if already running
  if docker ps | grep -q localstack; then
    log_info "LocalStack is already running"
    return 0
  fi

  # Start LocalStack
  docker run -d \
    --name localstack \
    -p 4566:4566 \
    -e SERVICES=s3 \
    -e DEBUG=1 \
    -e DEFAULT_REGION=us-east-1 \
    -e LAMBDA_EXECUTOR=local \
    -v /var/run/docker.sock:/var/run/docker.sock \
    localstack/localstack:latest

  # Wait for LocalStack to be ready
  log_info "Waiting for LocalStack to be ready..."
  local max_attempts=30
  local attempt=0
  
  while [ $attempt -lt $max_attempts ]; do
    if curl -s http://localhost:4566/_localstack/health | grep -q '"s3": "available"'; then
      log_success "LocalStack is ready"
      return 0
    fi
    sleep 1
    attempt=$((attempt + 1))
  done

  log_error "LocalStack failed to start"
  exit 1
}

# =============================================================================
# Setup Local S3
# =============================================================================
setup_local_s3() {
  log_info "Setting up local S3..."

  local S3_HOST="http://localhost:4566"
  local BUCKET="photoverifier-dev"

  # Create bucket
  aws --endpoint-url="$S3_HOST" s3 mb "s3://$BUCKET" 2>/dev/null || true

  # Set CORS
  aws --endpoint-url="$S3_HOST" s3api put-bucket-cors \
    --bucket "$BUCKET" \
    --cors-configuration '{
      "CORSRules": [
        {
          "AllowedHeaders": ["*"],
          "AllowedMethods": ["GET", "PUT", "POST"],
          "AllowedOrigins": ["*"],
          "ExposeHeaders": []
        }
      ]
    }'

  log_success "Local S3 configured"
}

# =============================================================================
# Create Local API
# =============================================================================
create_local_api() {
  log_info "Creating local presign API..."

  # Create a simple Express server for presigned URLs
  cat > /tmp/local-presign-server.mjs << 'EOF'
import http from 'http';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'crypto';
import bs58 from 'bs58';

const S3_HOST = process.env.S3_HOST || 'http://localhost:4566';
const BUCKET = process.env.BUCKET || 'photoverifier-dev';
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || process.env.PHOTOVERIFIER_RPC_URL || 'https://api.devnet.solana.com';

const s3 = new S3Client({
  region: 'us-east-1',
  endpoint: S3_HOST,
  forcePathStyle: true,
  credentials: {
    accessKeyId: 'test',
    secretAccessKey: 'test',
  },
});

const nonceCache = new Map();
const NONCE_TTL_MS = 10 * 60 * 1000;

function canonicalizeIntegrityPayload(payload) {
  return JSON.stringify({
    hashHex: payload.hashHex,
    location: payload.location,
    timestampSec: payload.timestampSec,
    wallet: payload.wallet,
    nonce: payload.nonce,
    slot: payload.slot,
    blockhash: payload.blockhash,
  });
}

function getHashFromKey(key) {
  const file = String(key).split('/').pop() || '';
  return file.split('.')[0]?.toLowerCase() || '';
}

function validateLocation(locationString) {
  const [latRaw, lonRaw] = String(locationString).split(',');
  const lat = Number(latRaw);
  const lon = Number(lonRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error('Invalid integrity location');
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) throw new Error('Integrity location out of range');
}

async function rpcRequest(method, params = []) {
  const res = await fetch(SOLANA_RPC_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`RPC ${method} failed with ${res.status}`);
  const data = await res.json();
  if (data?.error) throw new Error(`RPC ${method} error: ${JSON.stringify(data.error)}`);
  return data.result;
}

async function validateChainAnchor(payload) {
  const slot = Number(payload.slot);
  if (!Number.isInteger(slot) || slot <= 0) throw new Error('Invalid integrity slot');
  const blockhash = String(payload.blockhash || '');
  if (!blockhash) throw new Error('Missing integrity blockhash');

  const isValid = await rpcRequest('isBlockhashValid', [blockhash, { commitment: 'confirmed' }]);
  if (!isValid?.value) throw new Error('Integrity blockhash is not valid on selected cluster');

  const block = await rpcRequest('getBlock', [
    slot,
    {
      commitment: 'confirmed',
      transactionDetails: 'none',
      rewards: false,
      maxSupportedTransactionVersion: 0,
    },
  ]);
  if (!block || block.blockhash !== blockhash) throw new Error('Integrity slot/blockhash mismatch');

  const blockTimeSec = Number(block.blockTime);
  if (!Number.isFinite(blockTimeSec)) throw new Error('Unable to resolve integrity block time');
  const timestampSec = Number(payload.timestampSec);
  if (!Number.isInteger(timestampSec) || timestampSec <= 0) throw new Error('Invalid integrity timestampSec');
  if (Math.abs(blockTimeSec - timestampSec) > 120) throw new Error('Integrity timestamp does not match block time');
  if (Math.abs(Date.now() - blockTimeSec * 1000) > 10 * 60 * 1000) throw new Error('Integrity block time outside 10 minute window');
}

function ensureFreshNonce(nonce) {
  const now = Date.now();
  for (const [k, seenAt] of nonceCache.entries()) {
    if (now - seenAt > NONCE_TTL_MS) nonceCache.delete(k);
  }
  if (nonceCache.has(nonce)) throw new Error('Integrity nonce already used');
  nonceCache.set(nonce, now);
}

function verifyDetachedSignature(messageBytes, signatureBase64, walletBase58) {
  const pubkey = Buffer.from(bs58.decode(walletBase58));
  if (pubkey.length !== 32) throw new Error('Invalid wallet public key');
  const signature = Buffer.from(signatureBase64, 'base64');
  const spkiPrefix = Buffer.from('302a300506032b6570032100', 'hex');
  const spkiDer = Buffer.concat([spkiPrefix, pubkey]);
  const ok = crypto.verify(null, Buffer.from(messageBytes), { key: spkiDer, format: 'der', type: 'spki' }, signature);
  if (!ok) throw new Error('Integrity signature verification failed');
}

const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Health check
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', s3: S3_HOST, bucket: BUCKET }));
    return;
  }

  // POST /uploads - get presigned URL
  if (req.method === 'POST' && req.url === '/uploads') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { key, contentType, integrity } = JSON.parse(body);
        if (!key) throw new Error('Missing key');
        if (!integrity || integrity.version !== 'v1' || !integrity.payload || !integrity.signature) {
          throw new Error('Missing integrity envelope');
        }
        const { payload, signature } = integrity;
        const expectedHash = getHashFromKey(key);
        const payloadHash = String(payload.hashHex || '').toLowerCase();
        if (!expectedHash || expectedHash !== payloadHash) throw new Error('Integrity hash does not match key hash');
        validateLocation(payload.location);
        await validateChainAnchor(payload);
        if (!payload.wallet || !payload.nonce) throw new Error('Missing wallet/nonce in integrity payload');
        ensureFreshNonce(String(payload.nonce));
        verifyDetachedSignature(
          Buffer.from(canonicalizeIntegrityPayload(payload), 'utf8'),
          String(signature),
          String(payload.wallet)
        );
        
        const command = new PutObjectCommand({
          Bucket: BUCKET,
          Key: key,
          ContentType: contentType,
        });
        
        const url = await getSignedUrl(s3, command, { expiresIn: 300 });
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          uploadURL: url, 
          key,
          bucket: BUCKET,
          integrityAccepted: true
        }));
      } catch (err) {
        console.error('Error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // GET /uploads/:key - get presigned URL for download
  if (req.method === 'GET' && req.url.startsWith('/uploads/')) {
    const key = req.url.slice('/uploads/'.length);
    
    const command = new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
    });
    
    try {
      const url = await getSignedUrl(s3, command, { expiresIn: 3600 });
      res.writeHead(302, { Location: url });
      res.end();
    } catch (err) {
      res.writeHead(500);
      res.end(err.message);
    }
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Presign API running at http://localhost:${PORT}`);
  console.log(`S3 endpoint: ${S3_HOST}`);
  console.log(`Bucket: ${BUCKET}`);
});
EOF

  log_success "Local presign API created"
}

# =============================================================================
# Start All Services
# =============================================================================
start_services() {
  check_docker
  start_localstack
  setup_local_s3
  create_local_api

  # Create environment file
  cat > .env.local << EOF
# Local Development Environment
# Generated by scripts/dev-local.sh

# Solana (devnet)
PHOTOVERIFIER_RPC_URL=https://api.devnet.solana.com
PHOTOVERIFIER_PROGRAM_ID=8bQahCyQ6pLf5bFgj21kSd19mu1KZ2RfS7wALf35QyXz

# LocalStack S3
PHOTOVERIFIER_S3_PRESIGN_URL=http://localhost:3000/uploads
PHOTOVERIFIER_S3_BUCKET=photoverifier-dev
PHOTOVERIFIER_S3_REGION=us-east-1
PHOTOVERIFIER_S3_ENDPOINT=http://localhost:4566

# License (demo key - for testing only)
PHOTOVERIFIER_LICENSE_KEY=
PHOTOVERIFIER_LICENSE_SECRET=demo-secret-change-in-production
EOF

  echo ""
  echo "========================================"
  log_success "Local development environment ready!"
  echo "========================================"
  echo ""
  echo "Environment file created: .env.local"
  echo ""
  echo "To start the presign API server:"
  echo "  S3_HOST=http://localhost:4566 BUCKET=photoverifier-dev node /tmp/local-presign-server.mjs"
  echo ""
  echo "To run the mobile app:"
  echo "  cd photo-verifier && pnpm dev"
  echo ""
  echo "To run the demo site:"
  echo "  cd demo-site && pnpm dev"
  echo ""
  echo "LocalStack dashboard: http://localhost:4566/_localstack"
  echo ""
}

# =============================================================================
# Stop All Services
# =============================================================================
stop_services() {
  log_info "Stopping services..."

  # Stop LocalStack
  if docker ps | grep -q localstack; then
    docker stop localstack
    docker rm localstack
    log_success "LocalStack stopped"
  fi

  # Kill any node processes on port 3000
  if lsof -ti:3000 | xargs kill &> /dev/null; then
    log_success "Stopped local API server"
  fi

  log_success "All services stopped"
}

# =============================================================================
# Main
# =============================================================================
main() {
  case "${1:-}" in
    --stop)
      stop_services
      ;;
    --help)
      echo "Usage: $0 [--stop]"
      echo ""
      echo "Options:"
      echo "  --stop  Stop all services"
      exit 0
      ;;
    *)
      start_services
      ;;
  esac
}

main "$@"
