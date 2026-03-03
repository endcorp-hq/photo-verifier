import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const require = createRequire(import.meta.url);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');

const { verifySeeker } = require(
  path.join(repoRoot, 'packages/photoverifier-sdk/dist/modules/seeker.js')
);

const TOKEN_2022_PROGRAM_ID = {
  toBase58: () => 'TokenzQdYVYJ8Qx5smnuxD6f5h5RrD6S9w4fW8N3r6z',
};

function makeRuntime(options = {}) {
  const calls = {
    fetchPayloads: [],
    fallbackLookups: 0,
    getMultipleCalls: 0,
  };

  const runtime = {
    createConnection() {
      return {
        async getParsedTokenAccountsByOwner() {
          calls.fallbackLookups += 1;
          if (options.fallbackError) throw options.fallbackError;
          return options.fallbackParsedResult ?? { value: [] };
        },
        async getMultipleAccountsInfo(mints) {
          calls.getMultipleCalls += 1;
          return options.multipleAccountsResult ?? Array.from({ length: mints.length }, () => null);
        },
      };
    },
    createPublicKey(value) {
      return {
        toBase58: () => value,
      };
    },
    async loadSplToken() {
      return {
        TOKEN_2022_PROGRAM_ID,
        unpackMint(mintPubkey) {
          return {
            address: mintPubkey,
            mintAuthority: null,
          };
        },
        getMetadataPointerState() {
          return null;
        },
        getTokenGroupMemberState() {
          return null;
        },
      };
    },
    async fetchFn(_url, init) {
      const body = JSON.parse(String(init?.body ?? '{}'));
      calls.fetchPayloads.push(body);

      const response = options.fetchResponses?.[calls.fetchPayloads.length - 1] ?? {
        ok: true,
        status: 200,
        json: { result: { paginationKey: null, value: { accounts: [] } } },
      };

      return {
        ok: response.ok,
        status: response.status,
        async json() {
          return response.json;
        },
      };
    },
  };

  return { runtime, calls };
}

test('verifySeeker falls back to standard RPC when preferred lookup fails', async () => {
  const { runtime, calls } = makeRuntime({
    fetchResponses: [{ ok: false, status: 500, json: {} }],
    fallbackParsedResult: { value: [] },
  });

  const result = await verifySeeker(
    {
      walletAddress: '11111111111111111111111111111111',
      rpcUrl: 'https://rpc.example.test',
    },
    runtime
  );

  assert.equal(result.status, 'not_verified');
  assert.equal(result.reason, 'no_token_2022_balances');
  assert.equal(calls.fallbackLookups, 1);
});

test('verifySeeker reports unavailable when preferred and fallback lookups both fail', async () => {
  const { runtime } = makeRuntime({
    fetchResponses: [{ ok: false, status: 502, json: {} }],
    fallbackError: new Error('fallback exploded'),
  });

  const result = await verifySeeker(
    {
      walletAddress: '11111111111111111111111111111111',
      rpcUrl: 'https://rpc.example.test',
    },
    runtime
  );

  assert.equal(result.status, 'verification_unavailable');
  assert.equal(result.reason, 'token_lookup_failed');
  assert.match(result.cause ?? '', /HTTP 502/);
  assert.match(result.cause ?? '', /fallback exploded/);
});

test('verifySeeker paginates preferred lookup and avoids fallback when preferred returns mints', async () => {
  const { runtime, calls } = makeRuntime({
    fetchResponses: [
      {
        ok: true,
        status: 200,
        json: {
          result: {
            paginationKey: 'next-page',
            value: {
              accounts: [
                {
                  account: {
                    data: {
                      parsed: {
                        info: {
                          mint: 'So11111111111111111111111111111111111111112',
                          tokenAmount: { amount: '1' },
                        },
                      },
                    },
                  },
                },
              ],
            },
          },
        },
      },
      {
        ok: true,
        status: 200,
        json: {
          result: {
            paginationKey: null,
            value: { accounts: [] },
          },
        },
      },
    ],
  });

  const result = await verifySeeker(
    {
      walletAddress: '11111111111111111111111111111111',
      rpcUrl: 'https://rpc.example.test',
    },
    runtime
  );

  assert.equal(result.status, 'not_verified');
  assert.equal(result.reason, 'no_matching_sgt');
  assert.equal(calls.fetchPayloads.length, 2);
  assert.equal(calls.fetchPayloads[1].params[2].paginationKey, 'next-page');
  assert.equal(calls.fallbackLookups, 0);
  assert.equal(calls.getMultipleCalls, 1);
});
