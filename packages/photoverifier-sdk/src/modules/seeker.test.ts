import assert from 'node:assert/strict';
import test from 'node:test';

import { PublicKey } from '@solana/web3.js';
import { detectSeekerUser, findSeekerMintForOwner } from './seeker';

test('findSeekerMintForOwner returns not_verified when seeker mint list is empty', async () => {
  const mockConnection = {
    getParsedTokenAccountsByOwner: async () => ({ value: [] as unknown[] }),
  } as unknown;

  const result = await findSeekerMintForOwner({
    connection: mockConnection as never,
    owner: PublicKey.default,
    seekerMintsByCluster: [],
  });

  assert.equal(result.status, 'not_verified');
  assert.equal(result.isVerified, false);
  assert.equal(result.reason, 'no_seeker_mints_configured');
});

test('detectSeekerUser positional overload delegates to finder branch', async () => {
  const mockConnection = {
    getParsedTokenAccountsByOwner: async () => ({ value: [] as unknown[] }),
  } as unknown;

  const result = await detectSeekerUser(
    mockConnection as never,
    PublicKey.default,
    []
  );

  assert.equal(result.status, 'not_verified');
  assert.equal(result.reason, 'no_seeker_mints_configured');
});
