import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');

const coreHash = await import(
  pathToFileURL(path.join(repoRoot, 'packages/core/dist/hash.js')).href
);
const coreStorage = await import(
  pathToFileURL(path.join(repoRoot, 'packages/core/dist/storage.js')).href
);

const sdkHash = require(path.join(repoRoot, 'packages/photoverifier-sdk/dist/adapters/core/hash.js'));
const sdkStorage = require(
  path.join(repoRoot, 'packages/photoverifier-sdk/dist/adapters/core/storage.js')
);

test('sdk core adapters remain thin pass-through exports', async () => {
  const hashAdapterSource = await fs.readFile(
    path.join(repoRoot, 'packages/photoverifier-sdk/src/adapters/core/hash.ts'),
    'utf8'
  );
  const storageAdapterSource = await fs.readFile(
    path.join(repoRoot, 'packages/photoverifier-sdk/src/adapters/core/storage.ts'),
    'utf8'
  );

  assert.match(hashAdapterSource, /from '@photoverifier\/core\/dist\/hash\.js'/);
  assert.match(storageAdapterSource, /from '@photoverifier\/core\/dist\/storage\.js'/);
  assert.doesNotMatch(hashAdapterSource, /\bfunction\b/);
  assert.doesNotMatch(storageAdapterSource, /\bfunction\b/);
});

test('sdk package exposes targeted runtime entrypoints', async () => {
  const packageJson = JSON.parse(
    await fs.readFile(path.join(repoRoot, 'packages/photoverifier-sdk/package.json'), 'utf8')
  );
  assert.ok(packageJson.exports['./core']);
  assert.ok(packageJson.exports['./mobile']);
  assert.ok(packageJson.exports['./onchain']);

  await fs.access(path.join(repoRoot, 'packages/photoverifier-sdk/dist/core.js'));
  await fs.access(path.join(repoRoot, 'packages/photoverifier-sdk/dist/mobile.js'));
  await fs.access(path.join(repoRoot, 'packages/photoverifier-sdk/dist/onchain.js'));
});

test('sdk core types are sourced from canonical core package', async () => {
  const removedDuplicateTypesModule = path.join(
    repoRoot,
    'packages/photoverifier-sdk/src/core/types.ts'
  );
  await assert.rejects(() => fs.access(removedDuplicateTypesModule));
});

test('core public type contracts are re-exported from sdk without local duplication', async () => {
  const coreTypesSource = await fs.readFile(
    path.join(repoRoot, 'packages/core/src/types.ts'),
    'utf8'
  );
  const sdkIndexSource = await fs.readFile(
    path.join(repoRoot, 'packages/photoverifier-sdk/src/index.ts'),
    'utf8'
  );

  const exportedTypeNames = Array.from(
    coreTypesSource.matchAll(/export\s+(?:interface|type)\s+([A-Za-z0-9_]+)/g),
    (match) => match[1]
  );
  assert.ok(exportedTypeNames.length > 0);

  const coreExportBlockMatch = sdkIndexSource.match(
    /export\s*\{([\s\S]*?)\}\s*from\s*'@photoverifier\/core';/
  );
  assert.ok(coreExportBlockMatch);
  const coreExportBlock = coreExportBlockMatch[1];
  for (const typeName of exportedTypeNames) {
    assert.match(coreExportBlock, new RegExp(`type\\s+${typeName}\\b`));
    assert.doesNotMatch(sdkIndexSource, new RegExp(`export\\s+(?:interface|type)\\s+${typeName}\\b`));
  }
});

test('hash API parity between core and sdk wrappers', () => {
  const bytes = new Uint8Array([1, 2, 3, 4, 5, 255]);
  const base64 = Buffer.from(bytes).toString('base64');

  assert.equal(sdkHash.blake3HexFromBase64, coreHash.blake3HexFromBase64);
  assert.equal(sdkHash.blake3HexFromBytes, coreHash.blake3HexFromBytes);
  assert.equal(sdkHash.blake3Hash, coreHash.blake3Hash);

  assert.equal(
    sdkHash.blake3HexFromBase64(base64),
    coreHash.blake3HexFromBase64(base64)
  );
  assert.equal(sdkHash.blake3HexFromBytes(bytes), coreHash.blake3HexFromBytes(bytes));
  assert.deepEqual(sdkHash.blake3Hash(bytes), coreHash.blake3Hash(bytes));
});

test('storage API parity between core and sdk wrappers', () => {
  assert.equal(sdkStorage.buildS3KeyForPhoto, coreStorage.buildS3KeyForPhoto);
  assert.equal(sdkStorage.parseS3PhotoKey, coreStorage.parseS3PhotoKey);
  assert.equal(sdkStorage.buildS3Uri, coreStorage.buildS3Uri);
  assert.equal(sdkStorage.parseS3Uri, coreStorage.parseS3Uri);
  assert.equal(sdkStorage.uploadBytes, coreStorage.uploadBytes);
  assert.equal(sdkStorage.putToPresignedUrl, coreStorage.putToPresignedUrl);

  const keyParams = {
    seekerMint: 'seekerMint123',
    photoHashHex: 'abcdef0123456789',
    extension: 'jpeg',
    basePrefix: 'photos',
  };
  assert.equal(
    sdkStorage.buildS3KeyForPhoto(keyParams),
    coreStorage.buildS3KeyForPhoto(keyParams)
  );
  const builtKey = coreStorage.buildS3KeyForPhoto(keyParams);
  assert.deepEqual(
    sdkStorage.parseS3PhotoKey(builtKey, { basePrefix: keyParams.basePrefix }),
    coreStorage.parseS3PhotoKey(builtKey, { basePrefix: keyParams.basePrefix })
  );

  const bucket = 'photoverifier';
  const key = 'photos/seekerMint123/abcdef0123456789.jpeg';
  const sdkUri = sdkStorage.buildS3Uri(bucket, key);
  const coreUri = coreStorage.buildS3Uri(bucket, key);
  assert.equal(sdkUri, coreUri);
  assert.deepEqual(sdkStorage.parseS3Uri(sdkUri), coreStorage.parseS3Uri(coreUri));

  const edgeCaseKeys = [
    '/photos/seekerMint123/ABCDEF.jpg',
    'photos/seekerMint123/ABCDEF',
    'seekerMint123/ABCDEF.PNG',
  ];
  for (const edgeCaseKey of edgeCaseKeys) {
    assert.deepEqual(
      sdkStorage.parseS3PhotoKey(edgeCaseKey, { basePrefix: '' }),
      coreStorage.parseS3PhotoKey(edgeCaseKey, { basePrefix: '' })
    );
  }
});

test('storage upload helper parity between core and sdk wrappers', async () => {
  const bytes = new Uint8Array([1, 2, 3]);
  const cfg = {
    async upload(params) {
      return { url: `https://upload.example/${params.key}`, key: params.key };
    },
  };

  const sdkUploadResult = await sdkStorage.uploadBytes(cfg, 'photos/a.jpg', 'image/jpeg', bytes);
  const coreUploadResult = await coreStorage.uploadBytes(cfg, 'photos/a.jpg', 'image/jpeg', bytes);
  assert.deepEqual(sdkUploadResult, coreUploadResult);
});
