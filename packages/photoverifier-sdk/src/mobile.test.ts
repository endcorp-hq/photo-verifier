import assert from 'node:assert/strict';
import test from 'node:test';

import * as mobile from './mobile';

test('mobile entrypoint exposes device and seeker helpers', () => {
  assert.equal(typeof mobile.isSeekerDevice, 'function');
  assert.equal(typeof mobile.detectSeekerUser, 'function');
  assert.equal(typeof mobile.findSeekerMintForOwner, 'function');
});
