import assert from 'node:assert/strict';
import test from 'node:test';

import * as core from './core';

test('core entrypoint exposes hashing and storage contracts', () => {
  assert.equal(typeof core.blake3HexFromBytes, 'function');
  assert.equal(typeof core.uploadBytes, 'function');
  assert.equal(typeof core.buildS3KeyForPhoto, 'function');
});
