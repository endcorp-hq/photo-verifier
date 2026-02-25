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

const S3_HOST = process.env.S3_HOST || 'http://localhost:4566';
const BUCKET = process.env.BUCKET || 'photoverifier-dev';

const s3 = new S3Client({
  region: 'us-east-1',
  endpoint: S3_HOST,
  forcePathStyle: true,
  credentials: {
    accessKeyId: 'test',
    secretAccessKey: 'test',
  },
});

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
        const { key, contentType } = JSON.parse(body);
        
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
          bucket: BUCKET 
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
PHOTOVERIFIER_PROGRAM_ID=J8U2PEf8ZaXcG5Q7xPCob92qFA8H8LWj1j3xiuKA6QEt

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
