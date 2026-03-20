import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const cacheModuleUrl = pathToFileURL(
  path.join(repoRoot, 'photo-verifier/utils/seeker-verification-cache.ts')
).href;
const cacheModule = await import(cacheModuleUrl);

const { createSeekerVerificationCache } = cacheModule;

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test('seeker cache dedupes in-flight requests by wallet+rpc key', async () => {
  let calls = 0;
  const pending = deferred();
  const cache = createSeekerVerificationCache({
    verifySeekerFn: async () => {
      calls += 1;
      return pending.promise;
    },
  });

  const reqA = cache.verifySeekerCached({ walletAddress: 'walletA', rpcUrl: 'rpc1' });
  const reqB = cache.verifySeekerCached({ walletAddress: 'walletA', rpcUrl: 'rpc1' });
  assert.equal(calls, 1);

  pending.resolve({ status: 'verified', isVerified: true, isSeeker: true, seekerMint: 'mintA' });
  const [a, b] = await Promise.all([reqA, reqB]);
  assert.deepEqual(a, b);
});

test('seeker cache honors TTL and force refresh', async () => {
  let now = 1_000;
  let calls = 0;
  const cache = createSeekerVerificationCache({
    now: () => now,
    ttlMs: 50,
    verifySeekerFn: async () => {
      calls += 1;
      return {
        status: 'not_verified',
        isVerified: false,
        isSeeker: false,
        seekerMint: null,
        mint: null,
        reason: `call-${calls}`,
      };
    },
  });

  const first = await cache.verifySeekerCached({ walletAddress: 'walletA', rpcUrl: 'rpc1' });
  const second = await cache.verifySeekerCached({ walletAddress: 'walletA', rpcUrl: 'rpc1' });
  assert.equal(calls, 1);
  assert.equal(first.reason, second.reason);

  now += 51;
  const afterTtl = await cache.verifySeekerCached({ walletAddress: 'walletA', rpcUrl: 'rpc1' });
  assert.equal(calls, 2);
  assert.equal(afterTtl.reason, 'call-2');

  const forced = await cache.verifySeekerCached({ walletAddress: 'walletA', rpcUrl: 'rpc1', force: true });
  assert.equal(calls, 3);
  assert.equal(forced.reason, 'call-3');
});

test('seeker cache does not cache verification_unavailable results', async () => {
  let calls = 0;
  const cache = createSeekerVerificationCache({
    verifySeekerFn: async () => {
      calls += 1;
      return {
        status: 'verification_unavailable',
        isVerified: false,
        isSeeker: false,
        seekerMint: null,
        mint: null,
        reason: 'rpc_down',
      };
    },
  });

  await cache.verifySeekerCached({ walletAddress: 'walletA', rpcUrl: 'rpc1' });
  await cache.verifySeekerCached({ walletAddress: 'walletA', rpcUrl: 'rpc1' });
  assert.equal(calls, 2);
});

test('seeker cache selective invalidation prevents stale in-flight repopulation', async () => {
  let now = 1_000;
  let calls = 0;
  const pending = deferred();
  const cache = createSeekerVerificationCache({
    now: () => now,
    ttlMs: 500,
    verifySeekerFn: async ({ walletAddress }) => {
      calls += 1;
      if (walletAddress === 'walletA' && calls === 1) {
        return pending.promise;
      }
      return {
        status: 'verified',
        isVerified: true,
        isSeeker: true,
        seekerMint: `mint-${calls}`,
      };
    },
  });

  const firstRequest = cache.verifySeekerCached({ walletAddress: 'walletA', rpcUrl: 'rpc1' });
  cache.clearSeekerVerificationCache('walletA');
  pending.resolve({ status: 'verified', isVerified: true, isSeeker: true, seekerMint: 'stale-mint' });
  await firstRequest;

  const fresh = await cache.verifySeekerCached({ walletAddress: 'walletA', rpcUrl: 'rpc1' });
  assert.equal(calls, 2);
  assert.equal(fresh.seekerMint, 'mint-2');

  await cache.verifySeekerCached({ walletAddress: 'walletB', rpcUrl: 'rpc1' });
  cache.clearSeekerVerificationCache('walletA');
  now += 1;
  await cache.verifySeekerCached({ walletAddress: 'walletB', rpcUrl: 'rpc1' });
  assert.equal(calls, 3);
});

test('seeker cache global clear invalidates all wallet entries', async () => {
  let calls = 0;
  const cache = createSeekerVerificationCache({
    verifySeekerFn: async ({ walletAddress }) => {
      calls += 1;
      return {
        status: 'not_verified',
        isVerified: false,
        isSeeker: false,
        seekerMint: null,
        mint: null,
        reason: walletAddress,
      };
    },
  });

  await cache.verifySeekerCached({ walletAddress: 'walletA', rpcUrl: 'rpc1' });
  await cache.verifySeekerCached({ walletAddress: 'walletB', rpcUrl: 'rpc1' });
  assert.equal(calls, 2);

  cache.clearSeekerVerificationCache();
  await cache.verifySeekerCached({ walletAddress: 'walletA', rpcUrl: 'rpc1' });
  await cache.verifySeekerCached({ walletAddress: 'walletB', rpcUrl: 'rpc1' });
  assert.equal(calls, 4);
});
