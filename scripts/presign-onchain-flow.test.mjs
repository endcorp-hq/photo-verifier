import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { PublicKey } from '@solana/web3.js';

const require = createRequire(import.meta.url);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');

const presignModule = require(path.join(repoRoot, 'packages/photoverifier-sdk/dist/modules/presign.js'));
const onchainModule = require(path.join(repoRoot, 'packages/photoverifier-sdk/dist/modules/onchain.js'));
const vectors = JSON.parse(
  await fs.readFile(path.join(repoRoot, 'scripts/fixtures/binary-codec-vectors.json'), 'utf8')
);

function makeFetchResponse({ ok, status = 200, json, text }) {
  return {
    ok,
    status,
    async json() {
      if (json instanceof Error) throw json;
      return json;
    },
    async text() {
      if (text instanceof Error) throw text;
      return text ?? '';
    },
  };
}

async function withMockFetch(mockImpl, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = mockImpl;
  try {
    return await fn();
  } finally {
    globalThis.fetch = original;
  }
}

function signature64Base64() {
  return Buffer.from(Array.from({ length: 64 }, (_, i) => i)).toString('base64');
}

function canonicalTreeAccountData() {
  return Buffer.from(vectors.treeConfigAccount.dataHex, 'hex');
}

function canonicalProofInput() {
  return {
    owner: new PublicKey(vectors.photoProof.ownerBase58),
    hash32: Uint8Array.from(Buffer.from(vectors.photoProof.hashHex, 'hex')),
    nonce: vectors.photoProof.nonce,
    timestampSec: vectors.photoProof.timestampSec,
    h3CellU64: vectors.recordPhotoProofInstruction.h3CellHex,
    attestationSignature64: Uint8Array.from(
      Buffer.from(vectors.recordPhotoProofInstruction.attestationSignatureHex, 'hex')
    ),
  };
}

test('requestAttestedPresignedPut returns typed success payload', async () => {
  const endpoint = 'https://example.com/presign';
  const signature = signature64Base64();

  await withMockFetch(
    async () =>
      makeFetchResponse({
        ok: true,
        json: {
          uploadURL: 'https://upload.example.com/put',
          key: 'photos/hash.jpg',
          attestationSignature: signature,
          attestationPublicKey: 'Ga6SxqKLPTzrc4pykqrawSi9pvz3ZGhAdnZSBDKKioYk',
        },
      }),
    async () => {
      const response = await presignModule.requestAttestedPresignedPut(endpoint, {
        key: 'photos/hash.jpg',
        contentType: 'image/jpeg',
        integrity: {
          version: 'v1',
          payload: {
            hashHex: 'ab',
            h3Cell: '8928308280fffff',
            timestampSec: 1,
            wallet: 'wallet',
            nonce: 'nonce',
            slot: 1,
            blockhash: 'blockhash',
          },
          signature: 'sig',
        },
      });

      assert.equal(response.uploadURL, 'https://upload.example.com/put');
      assert.equal(response.key, 'photos/hash.jpg');
      assert.equal(response.attestationSignature64.length, 64);
    }
  );
});

test('requestAttestedPresignedPut maps HTTP failures to PresignError', async () => {
  await withMockFetch(
    async () => makeFetchResponse({ ok: false, status: 502, text: 'gateway down' }),
    async () => {
      await assert.rejects(
        () =>
          presignModule.requestAttestedPresignedPut('https://example.com/presign', {
            key: 'k',
            contentType: 'image/jpeg',
            integrity: {
              version: 'v1',
              payload: {
                hashHex: 'ab',
                h3Cell: '8928308280fffff',
                timestampSec: 1,
                wallet: 'wallet',
                nonce: 'nonce',
                slot: 1,
                blockhash: 'blockhash',
              },
              signature: 'sig',
            },
          }),
        (error) => {
          assert.ok(error instanceof presignModule.PresignError);
          assert.equal(error.code, 'PRESIGN_HTTP_ERROR');
          assert.equal(error.status, 502);
          return true;
        }
      );
    }
  );
});

test('requestAttestedPresignedPut maps invalid JSON to PresignError', async () => {
  await withMockFetch(
    async () => makeFetchResponse({ ok: true, status: 200, json: new Error('bad json') }),
    async () => {
      await assert.rejects(
        () =>
          presignModule.requestAttestedPresignedPut('https://example.com/presign', {
            key: 'k',
            contentType: 'image/jpeg',
            integrity: {
              version: 'v1',
              payload: {
                hashHex: 'ab',
                h3Cell: '8928308280fffff',
                timestampSec: 1,
                wallet: 'wallet',
                nonce: 'nonce',
                slot: 1,
                blockhash: 'blockhash',
              },
              signature: 'sig',
            },
          }),
        (error) => {
          assert.ok(error instanceof presignModule.PresignError);
          assert.equal(error.code, 'PRESIGN_INVALID_JSON');
          return true;
        }
      );
    }
  );
});

test('parseAttestedPresignResponse validates required fields and signature shape', () => {
  const checks = [
    [{ key: 'x', attestationSignature: signature64Base64() }, 'PRESIGN_MISSING_UPLOAD_URL'],
    [{ uploadURL: 'https://upload.example.com', attestationSignature: signature64Base64() }, 'PRESIGN_MISSING_KEY'],
    [{ uploadURL: 'https://upload.example.com', key: 'x' }, 'PRESIGN_MISSING_ATTESTATION_SIGNATURE'],
    [
      { uploadURL: 'https://upload.example.com', key: 'x', attestationSignature: 'not-valid-base64' },
      'PRESIGN_INVALID_ATTESTATION_SIGNATURE',
    ],
    [
      { uploadURL: 'https://upload.example.com', key: 'x', attestationSignature: Buffer.from([1, 2]).toString('base64') },
      'PRESIGN_INVALID_ATTESTATION_SIGNATURE',
    ],
  ];

  for (const [payload, expectedCode] of checks) {
    assert.throws(
      () => presignModule.parseAttestedPresignResponse(payload),
      (error) => {
        assert.ok(error instanceof presignModule.PresignError);
        assert.equal(error.code, expectedCode);
        return true;
      }
    );
  }
});

test('buildRecordPhotoProofTransaction enforces initialization authority when tree is missing', async () => {
  const input = canonicalProofInput();
  const mockConnection = {
    async getAccountInfo() {
      return null;
    },
    async getMinimumBalanceForRentExemption() {
      return 1;
    },
    async getLatestBlockhash() {
      return { blockhash: '11111111111111111111111111111111' };
    },
  };

  await assert.rejects(
    () =>
      onchainModule.buildRecordPhotoProofTransaction({
        connection: mockConnection,
        owner: input.owner,
        hash32: input.hash32,
        nonce: input.nonce,
        timestampSec: input.timestampSec,
        h3CellU64: input.h3CellU64,
        attestationSignature64: input.attestationSignature64,
      }),
    /Compressed tree is not initialized/
  );
});

test('buildRecordPhotoProofTransaction includes setup signer for tree initialization by fee authority', async () => {
  const input = canonicalProofInput();
  const mockConnection = {
    async getAccountInfo() {
      return null;
    },
    async getMinimumBalanceForRentExemption() {
      return 123456;
    },
    async getLatestBlockhash() {
      return { blockhash: '11111111111111111111111111111111' };
    },
  };

  const result = await onchainModule.buildRecordPhotoProofTransaction({
    connection: mockConnection,
    owner: onchainModule.PHOTO_PROOF_FEE_AUTHORITY,
    hash32: input.hash32,
    nonce: input.nonce,
    timestampSec: input.timestampSec,
    h3CellU64: input.h3CellU64,
    attestationSignature64: input.attestationSignature64,
  });

  assert.equal(result.additionalSigners.length, 1);
});

test('uploadAndSubmit surfaces confirmation errors after upload and submit', async () => {
  const input = canonicalProofInput();
  const mockConnection = {
    async getAccountInfo() {
      return { data: canonicalTreeAccountData() };
    },
    async getLatestBlockhash() {
      return { blockhash: '11111111111111111111111111111111', lastValidBlockHeight: 1 };
    },
    async confirmTransaction() {
      throw new Error('confirmation failed');
    },
  };

  const s3 = {
    async upload({ key }) {
      return { url: `https://upload.example.com/${key}`, key };
    },
  };

  await withMockFetch(
    async () => makeFetchResponse({ ok: true, status: 200 }),
    async () => {
      await assert.rejects(
        () =>
          onchainModule.uploadAndSubmit({
            connection: mockConnection,
            owner: input.owner,
            sendTransaction: async () => 'mock-signature',
            s3,
            bucket: 'bucket',
            seekerMint: 'seekerMint123',
            photoBytes: new Uint8Array([1, 2, 3]),
            h3Cell: vectors.recordPhotoProofInstruction.h3CellHex,
            timestamp: vectors.photoProof.timestampSec,
            nonce: input.nonce,
            attestationSignature64: input.attestationSignature64,
          }),
        /confirmation failed/
      );
    }
  );
});

test('uploadAndSubmit rejects malformed timestamp before transaction build', async () => {
  const input = canonicalProofInput();
  const mockConnection = {
    async getAccountInfo() {
      return { data: canonicalTreeAccountData() };
    },
    async getLatestBlockhash() {
      return { blockhash: '11111111111111111111111111111111', lastValidBlockHeight: 1 };
    },
    async confirmTransaction() {
      return { value: { err: null } };
    },
  };
  const s3 = {
    async upload({ key }) {
      return { url: `https://upload.example.com/${key}`, key };
    },
  };

  await withMockFetch(
    async () => makeFetchResponse({ ok: true, status: 200 }),
    async () => {
      await assert.rejects(
        () =>
          onchainModule.uploadAndSubmit({
            connection: mockConnection,
            owner: input.owner,
            sendTransaction: async () => 'mock-signature',
            s3,
            bucket: 'bucket',
            seekerMint: 'seekerMint123',
            photoBytes: new Uint8Array([1, 2, 3]),
            h3Cell: vectors.recordPhotoProofInstruction.h3CellHex,
            timestamp: 'not-a-valid-date',
            nonce: input.nonce,
            attestationSignature64: input.attestationSignature64,
          }),
        /Invalid timestamp/
      );
    }
  );
});
