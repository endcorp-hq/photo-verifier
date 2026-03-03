import assert from 'node:assert/strict';
import test from 'node:test';

import * as onchain from './onchain';

test('onchain entrypoint exposes transaction and contract primitives', () => {
  assert.equal(typeof onchain.buildRecordPhotoProofInstruction, 'function');
  assert.equal(typeof onchain.requestAttestedPresignedPut, 'function');
  assert.equal(typeof onchain.h3CellToU64, 'function');
});
