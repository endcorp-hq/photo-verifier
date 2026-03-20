import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const require = createRequire(import.meta.url);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');

const h3 = require(path.join(repoRoot, 'packages/photoverifier-sdk/dist/modules/h3.js'));
const contracts = require(
  path.join(repoRoot, 'packages/blockchain/dist/contracts/compressed-contracts.js')
);
const { PublicKey } = require('@solana/web3.js');

test('H3 conversion outputs remain deterministic for known coordinate vectors', () => {
  assert.equal(h3.latLngToH3Cell(37.7749, -122.4194, 7), '872830828ffffff');
  assert.equal(h3.locationToH3Cell({ latitude: 40.7128, longitude: -74.006 }, 7), '872a1072cffffff');
});

test('H3 conversion and u64 normalization enforce guard rails', () => {
  assert.throws(() => h3.latLngToH3Cell(37.7749, -122.4194, 16), /Invalid H3 resolution/);
  assert.equal(h3.h3CellToU64('0x872830828ffffff').toString(), '608692970719281151');
  assert.throws(() => h3.h3CellToU64('not-a-hex-cell'), /Invalid h3Cell hex string/);
});

test('compressed-contract PDA derivation and tree profiles remain stable', () => {
  const tree = new PublicKey('11111111111111111111111111111111');
  const authority = new PublicKey('So11111111111111111111111111111111111111112');

  assert.equal(contracts.BUBBLEGUM_PROGRAM_ID.toBase58(), 'DTNhearU7zbKfR4XSzWUGY4TFUgb6s86GY6T1aWPALEP');
  assert.equal(
    contracts.deriveTreeConfigPda(tree).toBase58(),
    '8NAF8xJf3qE54kg5NWCrnUebcM5PCGS47bhuL14ZvgfE'
  );
  assert.equal(
    contracts.deriveAuthorityPda(authority, tree).toBase58(),
    'CMK86dNqvWdaSDeEG3JteSqPh6fFz6fiqRUFB6fdRjus'
  );

  assert.deepEqual(contracts.TREE_CONFIGS.small, { maxDepth: 10, maxBufferSize: 8, canopyDepth: 8 });
  assert.deepEqual(contracts.TREE_CONFIGS.medium, {
    maxDepth: 14,
    maxBufferSize: 64,
    canopyDepth: 8,
  });
  assert.deepEqual(contracts.TREE_CONFIGS.large, {
    maxDepth: 20,
    maxBufferSize: 1024,
    canopyDepth: 12,
  });
});
