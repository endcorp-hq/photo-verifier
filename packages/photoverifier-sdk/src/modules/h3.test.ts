import assert from 'node:assert/strict';
import test from 'node:test';

import { h3CellToU64 } from './h3';

test('h3CellToU64 normalizes bigint, number, and hex string inputs', () => {
  assert.equal(h3CellToU64(1234n), 1234n);
  assert.equal(h3CellToU64(1234), 1234n);
  assert.equal(h3CellToU64('0x4d2'), 1234n);
});

test('h3CellToU64 rejects invalid ranges and malformed strings', () => {
  assert.throws(() => h3CellToU64(-1), /Invalid h3Cell number/);
  assert.throws(() => h3CellToU64('not-hex'), /Invalid h3Cell hex string/);
  assert.throws(() => h3CellToU64(0x1_0000_0000_0000_0000n), /out of range/);
});
