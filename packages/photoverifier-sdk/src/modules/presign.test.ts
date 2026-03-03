import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canonicalizeIntegrityPayload,
  decodeAttestationSignature64,
  parseAttestedPresignResponse,
  PresignError,
} from './presign';

const TEST_UPLOAD_ENDPOINT = 'upload-endpoint';

test('canonicalizeIntegrityPayload emits stable ordered JSON', () => {
  const payload = {
    hashHex: 'a'.repeat(64),
    h3Cell: '8a2a1072b59ffff',
    h3Resolution: 7,
    timestampSec: 1_700_000_000,
    wallet: 'wallet1111111111111111111111111111111111',
    nonce: '123',
    slot: 456,
    blockhash: 'blockhash',
  };

  const serialized = canonicalizeIntegrityPayload(payload);
  assert.equal(
    serialized,
    JSON.stringify({
      hashHex: payload.hashHex,
      h3Cell: payload.h3Cell,
      h3Resolution: payload.h3Resolution,
      timestampSec: payload.timestampSec,
      wallet: payload.wallet,
      nonce: payload.nonce,
      slot: payload.slot,
      blockhash: payload.blockhash,
    })
  );
});

test('parseAttestedPresignResponse reads nested data envelope', () => {
  const signatureBytes = new Uint8Array(64).fill(1);
  const signatureBase64 = Buffer.from(signatureBytes).toString('base64');

  const parsed = parseAttestedPresignResponse({
    data: {
      uploadUrl: TEST_UPLOAD_ENDPOINT,
      objectKey: 'photos/seeker/hash.jpg',
      attestation_signature: signatureBase64,
    },
  });

  assert.equal(parsed.uploadURL, TEST_UPLOAD_ENDPOINT);
  assert.equal(parsed.key, 'photos/seeker/hash.jpg');
  assert.equal(parsed.attestationSignature, signatureBase64);
  assert.deepEqual(parsed.attestationSignature64, signatureBytes);
});

test('parseAttestedPresignResponse surfaces missing attestation as PresignError', () => {
  assert.throws(
    () => parseAttestedPresignResponse({ uploadURL: TEST_UPLOAD_ENDPOINT, key: 'k' }),
    (error: unknown) => {
      assert.ok(error instanceof PresignError);
      assert.equal(error.code, 'PRESIGN_MISSING_ATTESTATION_SIGNATURE');
      return true;
    }
  );
});

test('decodeAttestationSignature64 rejects wrong-length signatures', () => {
  const shortSignature = Buffer.from(new Uint8Array(32)).toString('base64');

  assert.throws(
    () => decodeAttestationSignature64(shortSignature),
    (error: unknown) => {
      assert.ok(error instanceof PresignError);
      assert.equal(error.code, 'PRESIGN_INVALID_ATTESTATION_SIGNATURE');
      return true;
    }
  );
});
