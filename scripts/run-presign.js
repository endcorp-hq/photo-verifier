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
        await validateChainAnchor(payload);
        if (!payload.wallet || !payload.nonce) throw new Error('Missing wallet/nonce in integrity payload');
        ensureFreshNonce(String(payload.nonce));
        verifyDetachedSignature(
          Buffer.from(canonicalizeIntegrityPayload(payload), 'utf8'),
          String(signature),
          String(payload.wallet)
        );

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
