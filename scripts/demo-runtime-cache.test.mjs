import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sharedDistRoot = path.join(repoRoot, 'demo-site/.test-dist/app/api/_shared');
const sharedRequire = createRequire(path.join(sharedDistRoot, 'load-record-proof-entries.js'));

const { getRuntimeCacheMap } = require(path.join(sharedDistRoot, 'runtime-cache.js'));
const { loadTxIndexEntries } = require(path.join(sharedDistRoot, 'tx-index-service.js'));
const { loadRecordProofEntries } = require(path.join(sharedDistRoot, 'load-record-proof-entries.js'));
const { buildPhotoCatalogResponse } = require(
  path.join(sharedDistRoot, 'services/photo-catalog-service.js')
);
const { deletePhotoWithValidation } = require(
  path.join(sharedDistRoot, 'services/photo-deletion-service.js')
);
const { Connection } = sharedRequire('@solana/web3.js');

const demoProgramId = '3i6eNpCFvXhMg8LESAutXWKUtAey9mAbTziLLuUc78Hu';

function resetRuntimeCache() {
  const state = globalThis.__PHOTO_VERIFIER_DEMO_RUNTIME_CACHE__;
  if (state?.maps) state.maps.clear();
}

function patchConnection(overrides) {
  const originalGetSignatures = Connection.prototype.getSignaturesForAddress;
  const originalGetTransactions = Connection.prototype.getTransactions;

  if (overrides.getSignaturesForAddress) {
    Connection.prototype.getSignaturesForAddress = overrides.getSignaturesForAddress;
  }
  if (overrides.getTransactions) {
    Connection.prototype.getTransactions = overrides.getTransactions;
  }

  return () => {
    Connection.prototype.getSignaturesForAddress = originalGetSignatures;
    Connection.prototype.getTransactions = originalGetTransactions;
  };
}

test.beforeEach(() => {
  resetRuntimeCache();
});

test.afterEach(() => {
  resetRuntimeCache();
});

test('runtime cache maps are isolated by name and stable for same name', () => {
  const alpha = getRuntimeCacheMap('alpha-cache');
  const beta = getRuntimeCacheMap('beta-cache');

  alpha.set('shared-key', 'alpha-value');
  beta.set('shared-key', 'beta-value');

  assert.equal(alpha.get('shared-key'), 'alpha-value');
  assert.equal(beta.get('shared-key'), 'beta-value');

  const alphaAgain = getRuntimeCacheMap('alpha-cache');
  assert.equal(alphaAgain.get('shared-key'), 'alpha-value');
  assert.equal(alphaAgain, alpha);
});

test('tx-index-service consumes record-proof cache seeded from runtime-cache module', async () => {
  const cachedEntry = {
    hashHex: 'aa'.repeat(32),
    h3Cell: '8928308280fffff',
    payer: 'payer1111111111111111111111111111111111111',
    signature: 'signature11111111111111111111111111111111111',
    url: 'https://solscan.io/tx/signature11111111111111111111111111111111111?cluster=devnet',
    timestamp: '2026-01-01T00:00:00.000Z',
    nonce: '42',
  };

  getRuntimeCacheMap('record-proof-entries').set('seeded-cache', {
    ts: Date.now(),
    out: [cachedEntry],
  });

  const restoreConnection = patchConnection({
    getSignaturesForAddress: async () => {
      throw new Error('RPC should not be called when cache is fresh');
    },
  });

  try {
    const result = await loadTxIndexEntries({
      rpcUrl: 'https://api.devnet.solana.com',
      programId: demoProgramId,
      limit: 20,
      pageSize: 5,
      cacheTtlMs: 60_000,
      cacheKey: 'seeded-cache',
      heliusApiKey: null,
      heliusTxApiBase: null,
    });

    assert.deepEqual(result, { entries: [cachedEntry], warning: null });
  } finally {
    restoreConnection();
  }
});

test('loadRecordProofEntries returns stale cache with warning when live lookup fails', async () => {
  const staleEntry = {
    hashHex: 'bb'.repeat(32),
    h3Cell: '8928308280fffff',
    payer: 'payer2222222222222222222222222222222222222',
    signature: 'signature22222222222222222222222222222222222',
    url: 'https://solscan.io/tx/signature22222222222222222222222222222222222?cluster=devnet',
    timestamp: '2026-01-02T00:00:00.000Z',
    nonce: '84',
  };
  const cacheStore = new Map([
    [
      'stale-cache',
      {
        ts: Date.now() - 10_000,
        out: [staleEntry],
      },
    ],
  ]);

  const restoreConnection = patchConnection({
    getSignaturesForAddress: async () => {
      throw new Error('rpc offline');
    },
  });

  try {
    const result = await loadRecordProofEntries({
      rpcUrl: 'https://api.devnet.solana.com',
      programId: demoProgramId,
      explorerCluster: 'devnet',
      limit: 10,
      pageSize: 5,
      cacheTtlMs: 1,
      cacheKey: 'stale-cache',
      cacheStore,
      heliusApiKey: null,
      heliusTxApiBase: null,
    });

    assert.deepEqual(result.entries, [staleEntry]);
    assert.match(String(result.warning), /tx_lookup_unavailable:/);
    assert.match(String(result.warning), /using stale cache/);
  } finally {
    restoreConnection();
  }
});

test('loadRecordProofEntries falls back from Helius to RPC and keeps warning', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: false,
    status: 500,
    text: async () => 'helius exploded',
  });

  const restoreConnection = patchConnection({
    getSignaturesForAddress: async () => [],
  });

  try {
    const result = await loadRecordProofEntries({
      rpcUrl: 'https://api.devnet.solana.com',
      programId: demoProgramId,
      explorerCluster: 'devnet',
      limit: 10,
      pageSize: 5,
      cacheTtlMs: 0,
      heliusApiKey: 'demo-key',
      heliusTxApiBase: 'https://helius.invalid',
    });

    assert.deepEqual(result.entries, []);
    assert.match(String(result.warning), /^tx_lookup_helius_failed:/);
  } finally {
    restoreConnection();
    globalThis.fetch = originalFetch;
  }
});

test('photo catalog service returns cached response body without touching network loaders', async () => {
  const cachedBody = {
    items: [],
    proofs: [],
    summary: {
      totalPhotos: 0,
      matchedByHash: 0,
      matchedBySidecar: 0,
      unmatched: 0,
    },
    bucket: 'photoverifier',
    prefix: 'photos/',
    programId: demoProgramId,
    txLookupWarning: null,
    degraded: null,
  };

  getRuntimeCacheMap('list-route-response').set('default', {
    ts: Date.now(),
    out: cachedBody,
  });

  const out = await buildPhotoCatalogResponse({
    requestUrl: new URL('https://demo.local/api/list'),
    env: {
      S3_BUCKET: 'photoverifier',
      S3_PREFIX: 'photos/',
      RPC_URL: 'https://api.devnet.solana.com',
      PROGRAM_ID: demoProgramId,
      LIST_CACHE_TTL_MS: '15000',
    },
  });

  assert.deepEqual(out, cachedBody);
});

test('photo deletion service validates bad payload and executes delete using cached storage client', async () => {
  const missingKey = await deletePhotoWithValidation({});
  assert.deepEqual(missingKey, {
    ok: false,
    error: {
      status: 400,
      code: 'PHOTO_MISSING_KEY',
      message: 'Missing key',
    },
  });

  const invalidKey = await deletePhotoWithValidation({ key: '../secret.jpg' });
  assert.deepEqual(invalidKey, {
    ok: false,
    error: {
      status: 400,
      code: 'PHOTO_INVALID_KEY',
      message: 'Invalid or unauthorized key',
    },
  });

  const deletedKeys = [];
  getRuntimeCacheMap('storage-s3-clients-by-region').set('us-east-1', {
    send: async (command) => {
      deletedKeys.push(command.input.Key);
      return {};
    },
  });

  const success = await deletePhotoWithValidation({ key: 'photos/ok.jpg' }, {
    S3_BUCKET: 'photoverifier',
    S3_REGION: 'us-east-1',
    S3_PREFIX: 'photos/',
  });

  assert.equal(success.ok, true);
  assert.equal(success.value.bucket, 'photoverifier');
  assert.deepEqual(deletedKeys, ['photos/ok.jpg', 'photos/ok.json']);
});
