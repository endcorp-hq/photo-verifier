import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const require = createRequire(import.meta.url);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');

const { estimateCostPerPhoto, getTreeCapacity } = require(
  path.join(repoRoot, 'packages/blockchain/dist/economics/tree-cost.js')
);

const config = {
  maxDepth: 10,
  maxBufferSize: 8,
  canopyDepth: 8,
};

function createConnection(treeCostLamports = 2_048) {
  return {
    async getMinimumBalanceForRentExemption() {
      return treeCostLamports;
    },
  };
}

test('estimateCostPerPhoto rejects zero/negative/non-finite expected photo counts', async () => {
  const connection = createConnection();

  await assert.rejects(
    () => estimateCostPerPhoto(connection, config, 0),
    /expectedPhotos must be a positive finite integer/
  );
  await assert.rejects(
    () => estimateCostPerPhoto(connection, config, -5),
    /expectedPhotos must be a positive finite integer/
  );
  await assert.rejects(
    () => estimateCostPerPhoto(connection, config, Number.POSITIVE_INFINITY),
    /expectedPhotos must be a positive finite integer/
  );
});

test('estimateCostPerPhoto supports minimum valid expected photo count', async () => {
  const connection = createConnection(4_096);
  const lamportsPerPhoto = await estimateCostPerPhoto(connection, config, 1);
  assert.equal(lamportsPerPhoto, 4_096);
});

test('estimateCostPerPhoto caps denominator by tree capacity', async () => {
  const connection = createConnection(2_048);
  const capacity = getTreeCapacity(config);

  const lamportsPerPhoto = await estimateCostPerPhoto(connection, config, capacity * 10);
  assert.equal(lamportsPerPhoto, 2_048 / capacity);
});
