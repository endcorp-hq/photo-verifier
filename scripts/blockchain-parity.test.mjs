import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import { PublicKey } from '@solana/web3.js';

const require = createRequire(import.meta.url);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');

const blockchainModuleUrl = pathToFileURL(
  path.join(repoRoot, 'packages/blockchain/dist/index.js')
).href;
const sdkModulePath = path.join(
  repoRoot,
  'packages/photoverifier-sdk/dist/adapters/blockchain/index.js'
);

const blockchain = await import(blockchainModuleUrl);
const sdkNamespace = require(sdkModulePath);

function fromSdk(name) {
  return sdkNamespace[name] ?? sdkNamespace.default?.[name];
}

function normalizeLicenseValidationResult(result) {
  return {
    valid: result.valid,
    error: result.error ?? null,
    license: result.license
      ? {
          licenseKey: result.license.licenseKey,
          tier: result.license.tier,
          maxPhotos: result.license.maxPhotos,
          expiresAt: result.license.expiresAt ? result.license.expiresAt.toISOString() : null,
          features: [...result.license.features],
        }
      : null,
  };
}

test('sdk blockchain source remains an adapter to canonical package', async () => {
  const blockchainSourceDir = path.join(
    repoRoot,
    'packages/photoverifier-sdk/src/adapters/blockchain'
  );
  const files = await fs.readdir(blockchainSourceDir);
  assert.deepEqual(files.sort(), ['index.ts']);

  const adapterSource = await fs.readFile(path.join(blockchainSourceDir, 'index.ts'), 'utf8');
  assert.match(adapterSource, /export\s+\*\s+from\s+['"]@photoverifier\/blockchain['"]/);
});

test('license encode/decode parity across packages', () => {
  const encodeSdk = fromSdk('encodeLicenseKey');
  const decodeSdk = fromSdk('decodeLicenseKey');
  const encodeBlockchain = blockchain.encodeLicenseKey;
  const decodeBlockchain = blockchain.decodeLicenseKey;

  assert.equal(typeof encodeSdk, 'function');
  assert.equal(typeof decodeSdk, 'function');
  assert.equal(typeof encodeBlockchain, 'function');
  assert.equal(typeof decodeBlockchain, 'function');

  const params = {
    tier: 'startup',
    maxPhotos: 1234,
    expiresAt: 1_900_000_000,
    secret: 'parity-secret',
  };

  const sdkLicenseKey = encodeSdk(params);
  const blockchainLicenseKey = encodeBlockchain(params);
  assert.equal(sdkLicenseKey, blockchainLicenseKey);

  const decodedFromSdk = decodeSdk(sdkLicenseKey, params.secret);
  const decodedFromBlockchain = decodeBlockchain(blockchainLicenseKey, params.secret);
  assert.deepEqual(decodedFromSdk, decodedFromBlockchain);
});

test('license invalid-input parity across packages', () => {
  const encodeSdk = fromSdk('encodeLicenseKey');
  const decodeSdk = fromSdk('decodeLicenseKey');
  const encodeBlockchain = blockchain.encodeLicenseKey;
  const decodeBlockchain = blockchain.decodeLicenseKey;

  const params = {
    tier: 'free',
    maxPhotos: 100,
    expiresAt: 2_000_000_000,
    secret: 'invalid-parity-secret',
  };
  const validKey = encodeSdk(params);
  const tamperedKey = `${validKey.slice(0, -1)}${validKey.slice(-1) === 'A' ? 'B' : 'A'}`;

  const cases = [
    { key: '', secret: params.secret },
    { key: 'not-a-license', secret: params.secret },
    { key: validKey, secret: 'wrong-secret' },
    { key: tamperedKey, secret: params.secret },
  ];

  for (const testCase of cases) {
    const sdkResult = normalizeLicenseValidationResult(
      decodeSdk(testCase.key, testCase.secret)
    );
    const blockchainResult = normalizeLicenseValidationResult(
      decodeBlockchain(testCase.key, testCase.secret)
    );
    assert.deepEqual(sdkResult, blockchainResult);
  }

  // Defensive assertion that both encode paths are still fully delegated/canonical.
  assert.equal(encodeSdk(params), encodeBlockchain(params));
});

test('proof serialization/hash parity across packages', () => {
  const serializeSdk = fromSdk('serializePhotoProof');
  const deserializeSdk = fromSdk('deserializePhotoProof');
  const hashSdk = fromSdk('hashPhotoProof');

  assert.equal(typeof serializeSdk, 'function');
  assert.equal(typeof deserializeSdk, 'function');
  assert.equal(typeof hashSdk, 'function');

  const owner = PublicKey.default;
  const proof = {
    nonce: 42,
    hash: new Uint8Array(Array.from({ length: 32 }, (_, i) => i + 1)),
    timestamp: 1_700_000_000,
    latitude: 47.6205,
    longitude: -122.3493,
    owner,
  };

  const serializedSdk = serializeSdk(proof);
  const serializedBlockchain = blockchain.serializePhotoProof(proof);
  assert.deepEqual(serializedSdk, serializedBlockchain);

  const hashFromSdk = hashSdk(proof);
  const hashFromBlockchain = blockchain.hashPhotoProof(proof);
  assert.deepEqual(hashFromSdk, hashFromBlockchain);

  const deserializedSdk = deserializeSdk(serializedSdk);
  const deserializedBlockchain = blockchain.deserializePhotoProof(serializedBlockchain);
  assert.ok(deserializedSdk);
  assert.ok(deserializedBlockchain);
  assert.equal(deserializedSdk.nonce, deserializedBlockchain.nonce);
  assert.deepEqual(deserializedSdk.hash, deserializedBlockchain.hash);
  assert.equal(deserializedSdk.timestamp, deserializedBlockchain.timestamp);
  assert.equal(deserializedSdk.latitude, deserializedBlockchain.latitude);
  assert.equal(deserializedSdk.longitude, deserializedBlockchain.longitude);
  assert.equal(deserializedSdk.owner.toBase58(), deserializedBlockchain.owner.toBase58());
});
