import assert from 'node:assert/strict';
import test from 'node:test';
import { degraded, errorResponse, warningToDegraded } from './api-error';

test('degraded normalizes code and trims message', () => {
  assert.deepEqual(
    degraded({ code: ' tx lookup unavailable! ', message: '  temporary outage  ' }),
    { code: 'TX_LOOKUP_UNAVAILABLE_', message: 'temporary outage' }
  );
});

test('warningToDegraded parses explicit code and fallback code branch', () => {
  assert.deepEqual(warningToDegraded('tx_lookup_failed: rate limited'), {
    code: 'TX_LOOKUP_FAILED',
    message: 'rate limited',
  });
  assert.deepEqual(warningToDegraded(': upstream timed out'), {
    code: 'UPSTREAM_DEGRADED',
    message: 'upstream timed out',
  });
});

test('errorResponse serializes unknown causes into stable error envelope', async () => {
  const response = errorResponse({
    status: 418,
    code: 'BREW_FAILED',
    message: 'teapot refused',
    cause: new Error('steam unavailable'),
  });

  assert.equal(response.status, 418);
  assert.deepEqual(await response.json(), {
    error: {
      code: 'BREW_FAILED',
      message: 'teapot refused',
      cause: 'steam unavailable',
    },
  });
});
