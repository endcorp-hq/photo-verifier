#!/usr/bin/env node
/**
 * Local Presigned URL Server
 * 
 * Provides presigned URLs for S3 upload without needing AWS.
 * Uses LocalStack for local development.
 * 
 * Run: node scripts/run-presign.js
 * Or:  docker-compose up presign-api
 */

import http from 'http';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'crypto';
import bs58 from 'bs58';

const S3_HOST = process.env.S3_HOST || 'http://localhost:4566';
const BUCKET = process.env.BUCKET || 'photoverifier-dev';
const PORT = process.env.PORT || 3000;
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || process.env.PHOTOVERIFIER_RPC_URL || 'https://api.devnet.solana.com';
const ATTESTATION_PRIVATE_KEY_B58 = process.env.ATTESTATION_PRIVATE_KEY_B58 || '';
const ATTESTATION_PUBLIC_KEY = process.env.ATTESTATION_PUBLIC_KEY || 'Ga6SxqKLPTzrc4pykqrawSi9pvz3ZGhAdnZSBDKKioYk';
const U64_MAX = (1n << 64n) - 1n;

const s3 = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  endpoint: S3_HOST,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
  },
});

const NONCE_TTL_MS = Number(process.env.NONCE_TTL_MS || 10 * 60 * 1000);
const nonceCache = new Map();

function canonicalizeIntegrityPayload(payload) {
  return JSON.stringify({
    hashHex: payload.hashHex,
    location: payload.location,
    latitudeE6: payload.latitudeE6,
    longitudeE6: payload.longitudeE6,
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

function parseAndValidateLocation(locationString) {
  const [latRaw, lonRaw] = String(locationString).split(',');
  const lat = Number(latRaw);
  const lon = Number(lonRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new Error('Invalid integrity location');
  }
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    throw new Error('Integrity location out of range');
  }
}

function parseIntField(name, value) {
  const asNumber = Number(value);
  if (!Number.isInteger(asNumber)) throw new Error(`Invalid ${name}`);
  return asNumber;
}

function parseNonceU64(value) {
  let nonce;
  try {
    nonce = BigInt(String(value));
  } catch {
    throw new Error('Invalid nonce');
  }
  if (nonce < 0n || nonce > U64_MAX) throw new Error('Nonce out of range for u64');
  return nonce;
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
  if (!block || block.blockhash !== blockhash) {
    throw new Error('Integrity slot/blockhash mismatch');
  }

  const blockTimeSec = Number(block.blockTime);
  if (!Number.isFinite(blockTimeSec)) throw new Error('Unable to resolve integrity block time');
  const timestampSec = Number(payload.timestampSec);
  if (!Number.isInteger(timestampSec) || timestampSec <= 0) throw new Error('Invalid integrity timestampSec');
  if (Math.abs(blockTimeSec - timestampSec) > 120) {
    throw new Error('Integrity timestamp does not match block time');
  }
  if (Math.abs(Date.now() - blockTimeSec * 1000) > 10 * 60 * 1000) {
    throw new Error('Integrity block time outside 10 minute window');
  }
}

function ensureFreshNonce(nonce) {
  const now = Date.now();
  for (const [n, seenAt] of nonceCache.entries()) {
    if (now - seenAt > NONCE_TTL_MS) nonceCache.delete(n);
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

function loadAttestationSigner() {
  if (!ATTESTATION_PRIVATE_KEY_B58) {
    throw new Error('ATTESTATION_PRIVATE_KEY_B58 is required');
  }
  const raw = Buffer.from(bs58.decode(ATTESTATION_PRIVATE_KEY_B58));
  const seed = raw.length === 64 ? raw.subarray(0, 32) : raw;
  if (seed.length !== 32) {
    throw new Error('ATTESTATION_PRIVATE_KEY_B58 must decode to 32-byte seed or 64-byte secret key');
  }
  const pkcs8Prefix = Buffer.from('302e020100300506032b657004220420', 'hex');
  const privateKeyDer = Buffer.concat([pkcs8Prefix, seed]);
  const privateKey = crypto.createPrivateKey({ key: privateKeyDer, format: 'der', type: 'pkcs8' });
  const publicKeyDer = crypto.createPublicKey(privateKey).export({ format: 'der', type: 'spki' });
  const derivedPublicKey = Buffer.from(publicKeyDer).subarray(-32);
  const configuredPublicKey = Buffer.from(bs58.decode(ATTESTATION_PUBLIC_KEY));
  if (!derivedPublicKey.equals(configuredPublicKey)) {
    throw new Error('ATTESTATION_PUBLIC_KEY does not match ATTESTATION_PRIVATE_KEY_B58');
  }
  return privateKey;
}

function buildAttestationMessage(payload) {
  const wallet = Buffer.from(bs58.decode(String(payload.wallet)));
  if (wallet.length !== 32) throw new Error('Invalid wallet in integrity payload');
  const hashHex = String(payload.hashHex || '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(hashHex)) throw new Error('Invalid hashHex in integrity payload');
  const hash = Buffer.from(hashHex, 'hex');

  const nonce = parseNonceU64(payload.nonce);
  const timestampSec = parseIntField('timestampSec', payload.timestampSec);
  const latitudeE6 = parseIntField('latitudeE6', payload.latitudeE6);
  const longitudeE6 = parseIntField('longitudeE6', payload.longitudeE6);

  if (latitudeE6 < -90_000_000 || latitudeE6 > 90_000_000) throw new Error('latitudeE6 out of range');
  if (longitudeE6 < -180_000_000 || longitudeE6 > 180_000_000) throw new Error('longitudeE6 out of range');

  const out = Buffer.alloc(26 + 32 + 32 + 8 + 8 + 8 + 8);
  let o = 0;
  Buffer.from('photo-proof-attestation-v1', 'utf8').copy(out, o);
  o += 26;
  wallet.copy(out, o);
  o += 32;
  hash.copy(out, o);
  o += 32;
  out.writeBigUInt64LE(nonce, o);
  o += 8;
  out.writeBigInt64LE(BigInt(timestampSec), o);
  o += 8;
  out.writeBigInt64LE(BigInt(latitudeE6), o);
  o += 8;
  out.writeBigInt64LE(BigInt(longitudeE6), o);
  return out;
}

const attestationSigner = loadAttestationSigner();

const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  // Health check
  if (url.pathname === '/health') {
    try {
      // Test S3 connection
      await s3.send(new PutObjectCommand({
        Bucket,
        Key: '.health-check',
        Body: 'ok',
        ContentType: 'text/plain',
      }));
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        status: 'ok', 
        s3: S3_HOST, 
        bucket: BUCKET,
        timestamp: new Date().toISOString(),
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        status: 'error', 
        error: err.message,
        s3: S3_HOST,
        bucket: BUCKET,
      }));
    }
    return;
  }

  // POST /uploads - get presigned URL for upload
  if (req.method === 'POST' && url.pathname === '/uploads') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { key, contentType = 'image/jpeg', integrity } = JSON.parse(body);
        
        if (!key) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing key parameter' }));
          return;
        }

        if (!integrity || integrity.version !== 'v1' || !integrity.payload || !integrity.signature) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing integrity envelope' }));
          return;
        }

        const { payload, signature } = integrity;
        const expectedHash = getHashFromKey(key);
        const payloadHash = String(payload.hashHex || '').toLowerCase();
        if (!expectedHash || expectedHash !== payloadHash) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Integrity hash does not match key hash' }));
          return;
        }

        parseAndValidateLocation(payload.location);
        const latitudeE6 = parseIntField('latitudeE6', payload.latitudeE6);
        const longitudeE6 = parseIntField('longitudeE6', payload.longitudeE6);
        if (Math.round(Number(payload.location.split(',')[0]) * 1_000_000) !== latitudeE6) {
          throw new Error('latitudeE6 does not match location');
        }
        if (Math.round(Number(payload.location.split(',')[1]) * 1_000_000) !== longitudeE6) {
          throw new Error('longitudeE6 does not match location');
        }
        await validateChainAnchor(payload);
        if (!payload.wallet || !payload.nonce) throw new Error('Missing wallet/nonce in integrity payload');
        ensureFreshNonce(String(payload.nonce));
        verifyDetachedSignature(
          Buffer.from(canonicalizeIntegrityPayload(payload), 'utf8'),
          String(signature),
          String(payload.wallet)
        );
        const attestationMessage = buildAttestationMessage(payload);
        const attestationSignature = crypto
          .sign(null, attestationMessage, attestationSigner)
          .toString('base64');

        const command = new PutObjectCommand({
          Bucket,
          Key: key,
          ContentType: contentType,
        });
        
        const uploadURL = await getSignedUrl(s3, command, { expiresIn: 300 });
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          uploadURL, 
          key,
          bucket: BUCKET,
          expiresIn: 300,
          integrityAccepted: true,
          attestationSignature,
          attestationPublicKey: ATTESTATION_PUBLIC_KEY,
        }));
        
        console.log(`Generated presigned URL for: ${key}`);
      } catch (err) {
        console.error('Error generating presigned URL:', err);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // GET /uploads/:key - get presigned URL for download
  if (req.method === 'GET' && url.pathname.startsWith('/uploads/')) {
    const key = url.pathname.slice('/uploads/'.length);
    const decodedKey = decodeURIComponent(key);
    
    try {
      const command = new GetObjectCommand({
        Bucket,
        Key: decodedKey,
      });
      
      const downloadURL = await getSignedUrl(s3, command, { expiresIn: 3600 });
      res.writeHead(302, { Location: downloadURL });
      res.end();
    } catch (err) {
      res.writeHead(500);
      res.end(err.message);
    }
    return;
  }

  // List buckets
  if (req.method === 'GET' && url.pathname === '/buckets') {
    try {
      const { Buckets } = await s3.send({ command: { type: 'ListBuckets' } });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ buckets: Buckets || [] }));
    } catch (err) {
      res.writeHead(500);
      res.end(err.message);
    }
    return;
  }

  // 404
  res.writeHead(404);
  res.end('Not found. Available endpoints:\n  GET  /health\n  POST /uploads\n  GET  /uploads/:key\n  GET  /buckets\n');
});

server.listen(PORT, () => {
  console.log('='.repeat(50));
  console.log('Presigned URL Server');
  console.log('='.repeat(50));
  console.log(`Server:      http://localhost:${PORT}`);
  console.log(`S3 Endpoint: ${S3_HOST}`);
  console.log(`Bucket:      ${BUCKET}`);
  console.log('');
  console.log('Endpoints:');
  console.log('  GET  /health        - Health check');
  console.log('  POST /uploads       - Get presigned upload URL');
  console.log('  GET  /uploads/:key  - Get presigned download URL');
  console.log('  GET  /buckets       - List buckets');
  console.log('='.repeat(50));
});
