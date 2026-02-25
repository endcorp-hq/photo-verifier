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

const S3_HOST = process.env.S3_HOST || 'http://localhost:4566';
const BUCKET = process.env.BUCKET || 'photoverifier-dev';
const PORT = process.env.PORT || 3000;

const s3 = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  endpoint: S3_HOST,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
  },
});

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
        const { key, contentType = 'image/jpeg' } = JSON.parse(body);
        
        if (!key) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing key parameter' }));
          return;
        }

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
        }));
        
        console.log(`Generated presigned URL for: ${key}`);
      } catch (err) {
        console.error('Error generating presigned URL:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
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
