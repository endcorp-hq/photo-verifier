import assert from 'node:assert/strict';
import test from 'node:test';

import type { VerificationResult } from '@photoverifier/blockchain';
import { MissingProofRuntimeError, PhotoVerifier } from './sdk';

test('getCapabilities reflects configured runtime hooks', () => {
  const verifier = new PhotoVerifier(
    { s3Config: { upload: async () => ({ key: 'k', url: 'u' }) }, s3Bucket: 'bucket' },
    {
      proofRuntime: {
        sendTransaction: async () => 'sig',
        resolveAttestationSignature64: async () => new Uint8Array(64),
      },
    }
  );

  const capabilities = verifier.getCapabilities();
  assert.equal(capabilities.capturePhoto, true);
  assert.equal(capabilities.hashPhoto, true);
  assert.equal(capabilities.uploadToS3, true);
  assert.equal(capabilities.storeProof, false);
  assert.equal(capabilities.verifyProof, false);
  assert.equal(capabilities.verifyProofPresence, false);
});

test('verifyProof delegates to runtime verifier when provided', async () => {
  const expected: VerificationResult = { valid: true, proof: null };
  const verifier = new PhotoVerifier(
    {},
    {
      proofRuntime: {
        sendTransaction: async () => 'sig',
        resolveAttestationSignature64: async () => new Uint8Array(64),
        verifyProofByHash: async (hashHex: string) => {
          assert.equal(hashHex, 'a'.repeat(64));
          return expected;
        },
      },
    }
  );

  const actual = await verifier.verifyProof('0x' + 'a'.repeat(64));
  assert.deepEqual(actual, expected);
});

test('verifyProofPresence throws typed runtime error when endpoint is unset', async () => {
  const verifier = new PhotoVerifier();

  await assert.rejects(
    verifier.verifyProofPresence('a'.repeat(64)),
    (error: unknown) => {
      assert.ok(error instanceof MissingProofRuntimeError);
      assert.match(String(error), /verifyProofPresence runtime unavailable/);
      return true;
    }
  );
});
