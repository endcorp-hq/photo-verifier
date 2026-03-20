import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const require = createRequire(import.meta.url);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');

const seekerHelpers = require(path.join(repoRoot, 'packages/photoverifier-seeker-sdk/dist/helpers.js'));
const onchainSdk = require(path.join(repoRoot, 'packages/photoverifier-sdk/dist/onchain.js'));

test('seeker sdk index remains a strict facade over the base sdk', async () => {
  const builtIndex = await fs.readFile(
    path.join(repoRoot, 'packages/photoverifier-seeker-sdk/dist/index.js'),
    'utf8'
  );
  assert.match(
    builtIndex,
    /__exportStar\(require\(['"]@endcorp\/photoverifier-sdk['"]\),\s*exports\)/
  );
});

test('seeker sdk owned helpers behave as deterministic contract helpers', async () => {
  const originalRandom = Math.random;
  Math.random = () => 0;
  const nonce = seekerHelpers.createNonceU64(1_700_000_000_000, 20);
  Math.random = originalRandom;
  assert.equal(seekerHelpers.nonceToString(nonce), nonce.toString());

  const payload = seekerHelpers.buildIntegrityPayload({
    hashHex: '11'.repeat(32),
    h3Cell: '872830828ffffff',
    h3Resolution: 7,
    timestampSec: 1_700_000_000,
    wallet: 'wallet1111111111111111111111111111111111',
    nonce: '123',
    slot: 456,
    blockhash: 'blockhash-abc',
  });

  let signedBytes = null;
  const envelope = await seekerHelpers.createIntegrityEnvelope(payload, async (message) => {
    signedBytes = message;
    return Uint8Array.from([1, 2, 3, 4]);
  });

  assert.equal(envelope.version, 'v1');
  assert.deepEqual(envelope.payload, payload);
  assert.equal(envelope.signature, 'AQIDBA==');
  assert.equal(
    new TextDecoder().decode(signedBytes),
    onchainSdk.canonicalizeIntegrityPayload(payload)
  );
});
