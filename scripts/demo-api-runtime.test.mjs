import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sharedDistRoot = path.join(repoRoot, 'demo-site/.test-dist/app/api/_shared');
const sharedRequire = createRequire(path.join(sharedDistRoot, 'storage-adapter.js'));

const {
  getStorageConfig,
  listPhotoKeys,
  getObjectViewUrl,
  loadOptionalSidecarJson,
  deletePhotoObject,
} = require(path.join(sharedDistRoot, 'storage-adapter.js'));
const { degraded, warningToDegraded, errorResponse } = require(
  path.join(sharedDistRoot, 'api-error.js')
);
const { withApiPolicy } = require(path.join(sharedDistRoot, 'with-api-policy.js'));
const { getRuntimeCacheMap } = require(path.join(sharedDistRoot, 'runtime-cache.js'));
const { S3Client } = sharedRequire('@aws-sdk/client-s3');
const { NextResponse } = sharedRequire('next/server');

const defaultStorageConfig = {
  bucket: 'photoverifier',
  region: 'us-east-1',
  prefix: 'photos/',
  cdnDomain: null,
};

function resetRuntimeCache() {
  const state = globalThis.__PHOTO_VERIFIER_DEMO_RUNTIME_CACHE__;
  if (state?.maps) state.maps.clear();
}

function withPatchedEnv(temp, run) {
  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    DEMO_SITE_API_TOKEN: process.env.DEMO_SITE_API_TOKEN,
    DEMO_SITE_API_TOKEN_SCOPES: process.env.DEMO_SITE_API_TOKEN_SCOPES,
  };
  for (const [key, value] of Object.entries(temp)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  return Promise.resolve(run()).finally(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

test.beforeEach(() => {
  resetRuntimeCache();
});

test.afterEach(() => {
  resetRuntimeCache();
});

test('storage config normalizes prefix and defaults', () => {
  assert.deepEqual(
    getStorageConfig({
      S3_BUCKET: 'demo-bucket',
      S3_REGION: 'us-west-2',
      S3_PREFIX: '/nested/photos//',
      S3_CDN_DOMAIN: 'cdn.example.com',
    }),
    {
      bucket: 'demo-bucket',
      region: 'us-west-2',
      prefix: 'nested/photos/',
      cdnDomain: 'cdn.example.com',
    }
  );

  assert.equal(getStorageConfig({ S3_PREFIX: '////' }).prefix, '');
});

test('listPhotoKeys paginates and honors maxItems with runtime cache client', async () => {
  const calls = [];
  const fakeClient = {
    send: async (command) => {
      calls.push(command.input);
      if (calls.length === 1) {
        return {
          Contents: [{ Key: 'photos/a.jpg' }, { Key: 'photos/readme.txt' }, { Key: 'photos/dir/' }],
          IsTruncated: true,
          NextContinuationToken: 'token-1',
        };
      }
      return {
        Contents: [{ Key: 'photos/b.png' }, { Key: 'photos/c.webp' }],
        IsTruncated: false,
      };
    },
  };

  getRuntimeCacheMap('storage-s3-clients-by-region').set('cache-region', fakeClient);

  const keys = await listPhotoKeys(
    { maxItems: 2 },
    {
      config: {
        ...defaultStorageConfig,
        region: 'cache-region',
      },
    }
  );

  assert.deepEqual(keys, ['photos/a.jpg', 'photos/b.png']);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].ContinuationToken, 'token-1');
});

test('getObjectViewUrl uses CDN branch when provided', async () => {
  const url = await getObjectViewUrl('photos/a.jpg', 'cdn.example.com', {
    config: defaultStorageConfig,
    client: { send: async () => ({}) },
  });
  assert.equal(url, 'https://cdn.example.com/photos/a.jpg');
});

test('getObjectViewUrl falls back to signed S3 URL branch', async () => {
  const client = new S3Client({
    region: 'us-east-1',
    credentials: {
      accessKeyId: 'AKIA_TEST_KEY',
      secretAccessKey: 'secret-test-key',
    },
  });

  const signedUrl = await getObjectViewUrl('photos/a.jpg', null, {
    config: defaultStorageConfig,
    client,
  });

  assert.match(signedUrl, /^https?:\/\//);
  assert.match(signedUrl, /X-Amz-Signature=/);
  assert.match(signedUrl, /photos%2Fa.jpg|photos\/a.jpg/);
});

test('loadOptionalSidecarJson handles sidecar fetch failures safely', async () => {
  const client = new S3Client({
    region: 'us-east-1',
    credentials: {
      accessKeyId: 'AKIA_TEST_KEY',
      secretAccessKey: 'secret-test-key',
    },
  });

  const notFound = await loadOptionalSidecarJson('photos/a.jpg', {
    config: defaultStorageConfig,
    client,
    fetchImpl: async () => ({
      ok: false,
      json: async () => ({ ignored: true }),
    }),
  });
  assert.deepEqual(notFound, { sidecar: null, proofUrl: null });

  const invalidJson = await loadOptionalSidecarJson('photos/a.jpg', {
    config: defaultStorageConfig,
    client,
    fetchImpl: async () => ({
      ok: true,
      json: async () => {
        throw new Error('invalid json');
      },
    }),
  });
  assert.equal(invalidJson.sidecar, null);
  assert.equal(typeof invalidJson.proofUrl, 'string');

  const noSidecar = await loadOptionalSidecarJson('photos/no-extension', {
    config: defaultStorageConfig,
    client,
    fetchImpl: async () => ({ ok: true, json: async () => ({}) }),
  });
  assert.deepEqual(noSidecar, { sidecar: null, proofUrl: null });
});

test('deletePhotoObject deletes sidecar by default and can skip sidecar deletion', async () => {
  const deletedKeys = [];
  const fakeClient = {
    send: async (command) => {
      deletedKeys.push(command.input.Key);
      return {};
    },
  };

  const withSidecar = await deletePhotoObject(
    { key: 'photos/a.jpg' },
    { config: defaultStorageConfig, client: fakeClient }
  );
  assert.equal(withSidecar.sidecarDeleted, true);
  assert.deepEqual(deletedKeys, ['photos/a.jpg', 'photos/a.json']);

  deletedKeys.length = 0;
  const withoutSidecar = await deletePhotoObject(
    { key: 'photos/a.jpg', deleteSidecar: false },
    { config: defaultStorageConfig, client: fakeClient }
  );
  assert.equal(withoutSidecar.sidecarDeleted, false);
  assert.deepEqual(deletedKeys, ['photos/a.jpg']);
});

test('api-error helpers normalize degraded/warning contracts and error envelopes', async () => {
  assert.deepEqual(
    degraded({ code: ' tx lookup unavailable! ', message: '  temporary outage  ' }),
    { code: 'TX_LOOKUP_UNAVAILABLE_', message: 'temporary outage' }
  );
  assert.deepEqual(warningToDegraded('tx_lookup_failed: rate limited'), {
    code: 'TX_LOOKUP_FAILED',
    message: 'rate limited',
  });
  assert.deepEqual(warningToDegraded(': upstream timed out'), {
    code: 'UPSTREAM_DEGRADED',
    message: 'upstream timed out',
  });

  const response = errorResponse({
    status: 418,
    code: 'BREW_FAILED',
    message: 'teapot refused',
    cause: new Error('steam unavailable'),
  });
  assert.equal(response.status, 418);
  assert.deepEqual(await response.json(), {
    error: {
      code: 'BREW_FAILED',
      message: 'teapot refused',
      cause: 'steam unavailable',
    },
  });
});

test('withApiPolicy enforces auth and scope denial/allow branches', async () => {
  await withPatchedEnv(
    {
      NODE_ENV: 'production',
      DEMO_SITE_API_TOKEN: 'secret-token',
      DEMO_SITE_API_TOKEN_SCOPES: 'photos:read',
    },
    async () => {
      const allowedHandler = withApiPolicy({ scopes: ['photos:read'] }, async () =>
        NextResponse.json({ ok: true })
      );
      const missingAuth = await allowedHandler(new Request('https://demo.local/api/list'));
      assert.equal(missingAuth.status, 401);

      const forbiddenHandler = withApiPolicy({ scopes: ['photos:delete'] }, async () =>
        NextResponse.json({ ok: true })
      );
      const forbidden = await forbiddenHandler(
        new Request('https://demo.local/api/photo', {
          headers: { authorization: 'Bearer secret-token' },
        })
      );
      assert.equal(forbidden.status, 403);

      const allowed = await allowedHandler(
        new Request('https://demo.local/api/list', {
          headers: { authorization: 'Bearer secret-token' },
        })
      );
      assert.equal(allowed.status, 200);
      assert.deepEqual(await allowed.json(), { ok: true });
    }
  );
});
