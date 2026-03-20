import assert from 'node:assert/strict';
import test from 'node:test';

import * as storage from './storage';

test('storage adapter re-exports core storage helpers', () => {
  assert.equal(typeof storage.uploadBytes, 'function');
  assert.equal(typeof storage.buildS3KeyForPhoto, 'function');
  assert.equal(typeof storage.parseS3Uri, 'function');
});
