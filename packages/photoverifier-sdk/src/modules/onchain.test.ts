import assert from 'node:assert/strict';
import test from 'node:test';

import { PublicKey } from '@solana/web3.js';
import {
  buildAttestationMessage,
  buildInitializeTreeInstruction,
  deriveGlobalTreeAuthorityPda,
  deriveGlobalTreeConfigPda,
  PHOTO_PROOF_COMPRESSED_PROGRAM_ID,
  hashBytes,
} from './onchain';

test('global PDA derivation is deterministic', () => {
  const [treeConfigA, bumpA] = deriveGlobalTreeConfigPda();
  const [treeConfigB, bumpB] = deriveGlobalTreeConfigPda();
  const [treeAuthority, authorityBump] = deriveGlobalTreeAuthorityPda();

  assert.equal(treeConfigA.toBase58(), treeConfigB.toBase58());
  assert.equal(bumpA, bumpB);
  assert.match(treeAuthority.toBase58(), /^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
  assert.ok(authorityBump >= 0 && authorityBump <= 255);
});

test('buildAttestationMessage packs prefix, owner, hash, nonce, timestamp, and h3', () => {
  const owner = PublicKey.default;
  const hash32 = new Uint8Array(32).fill(2);
  const message = buildAttestationMessage({
    owner,
    hash32,
    nonce: 7n,
    timestampSec: 1_700_000_000,
    h3CellU64: 1234n,
  });

  const prefix = new TextEncoder().encode('photo-proof-attestation-v1');
  assert.equal(message.length, prefix.length + 32 + 32 + 8 + 8 + 8);
  assert.deepEqual(message.slice(0, prefix.length), prefix);
});

test('buildInitializeTreeInstruction wires expected accounts/program', () => {
  const authority = PublicKey.default;
  const merkleTree = new PublicKey('11111111111111111111111111111111');
  const payload = buildInitializeTreeInstruction({ authority, merkleTree });

  assert.equal(payload.merkleTree.toBase58(), merkleTree.toBase58());
  assert.equal(payload.instruction.keys.length, 7);
  assert.equal(
    payload.instruction.programId.toBase58(),
    PHOTO_PROOF_COMPRESSED_PROGRAM_ID.toBase58()
  );
});

test('hashBytes returns a 32-byte digest and 64-char hex string', async () => {
  const { hash32, hashHex } = await hashBytes(new Uint8Array([1, 2, 3]));
  assert.equal(hash32.length, 32);
  assert.match(hashHex, /^[0-9a-f]{64}$/);
});
