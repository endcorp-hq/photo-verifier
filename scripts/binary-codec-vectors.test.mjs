import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import { PublicKey } from '@solana/web3.js';

const require = createRequire(import.meta.url);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');

const vectorsPath = path.join(repoRoot, 'scripts/fixtures/binary-codec-vectors.json');
const blockchainModuleUrl = pathToFileURL(
  path.join(repoRoot, 'packages/blockchain/dist/index.js')
).href;
const onchainModulePath = path.join(repoRoot, 'packages/photoverifier-sdk/dist/modules/onchain.js');

const vectors = JSON.parse(await fs.readFile(vectorsPath, 'utf8'));
const blockchain = await import(blockchainModuleUrl);
const onchainNamespace = require(onchainModulePath);

function hexToBytes(hex) {
  return Uint8Array.from(Buffer.from(hex, 'hex'));
}

function bytesToHex(bytes) {
  return Buffer.from(bytes).toString('hex');
}

function canonicalProofFromVectors() {
  return {
    nonce: vectors.photoProof.nonce,
    hash: hexToBytes(vectors.photoProof.hashHex),
    timestamp: vectors.photoProof.timestampSec,
    latitude: vectors.photoProof.latitude,
    longitude: vectors.photoProof.longitude,
    owner: new PublicKey(vectors.photoProof.ownerBase58),
  };
}

test('photo proof codec matches canonical golden vectors', () => {
  const proof = canonicalProofFromVectors();

  const serialized = blockchain.serializePhotoProof(proof);
  assert.equal(bytesToHex(serialized), vectors.photoProof.serializedHex);

  const hashed = blockchain.hashPhotoProof(proof);
  assert.equal(bytesToHex(hashed), vectors.photoProof.blake3Hex);

  const decoded = blockchain.deserializePhotoProof(hexToBytes(vectors.photoProof.serializedHex));
  assert.ok(decoded);
  assert.equal(decoded.nonce, vectors.photoProof.nonce);
  assert.equal(decoded.timestamp, vectors.photoProof.timestampSec);
  assert.equal(decoded.latitude, vectors.photoProof.latitude);
  assert.equal(decoded.longitude, vectors.photoProof.longitude);
  assert.equal(decoded.owner.toBase58(), vectors.photoProof.ownerBase58);
  assert.equal(bytesToHex(decoded.hash), vectors.photoProof.hashHex);
});

test('on-chain instruction payloads match IDL-derived discriminators and vectors', () => {
  const buildInitializeTreeInstruction =
    onchainNamespace.buildInitializeTreeInstruction;
  const buildRecordPhotoProofInstruction =
    onchainNamespace.buildRecordPhotoProofInstruction;
  const buildAttestationMessage = onchainNamespace.buildAttestationMessage;

  assert.equal(typeof buildInitializeTreeInstruction, 'function');
  assert.equal(typeof buildRecordPhotoProofInstruction, 'function');
  assert.equal(typeof buildAttestationMessage, 'function');

  const owner = new PublicKey(vectors.photoProof.ownerBase58);
  const merkleTree = new PublicKey(vectors.treeConfigAccount.merkleTreeBase58);

  const initializeIx = buildInitializeTreeInstruction({ authority: owner, merkleTree }).instruction;
  assert.equal(
    bytesToHex(initializeIx.data),
    vectors.initializeTreeInstruction.discriminatorHex
  );

  const recordIx = buildRecordPhotoProofInstruction({
    owner,
    hash32: hexToBytes(vectors.photoProof.hashHex),
    nonce: vectors.photoProof.nonce,
    timestampSec: vectors.photoProof.timestampSec,
    h3CellU64: vectors.recordPhotoProofInstruction.h3CellHex,
    attestationSignature64: hexToBytes(vectors.recordPhotoProofInstruction.attestationSignatureHex),
    merkleTree,
  }).instruction;

  assert.equal(bytesToHex(recordIx.data), vectors.recordPhotoProofInstruction.encodedArgsHex);
  assert.equal(
    bytesToHex(recordIx.data.subarray(0, 8)),
    vectors.recordPhotoProofInstruction.discriminatorHex
  );

  const attestationMessage = buildAttestationMessage({
    owner,
    hash32: hexToBytes(vectors.photoProof.hashHex),
    nonce: vectors.photoProof.nonce,
    timestampSec: vectors.photoProof.timestampSec,
    h3CellU64: vectors.recordPhotoProofInstruction.h3CellHex,
  });
  assert.equal(bytesToHex(attestationMessage), vectors.attestationMessage.hex);
});

test('tree_config account decoding remains compatible with canonical account layout', async () => {
  const buildRecordPhotoProofTransaction =
    onchainNamespace.buildRecordPhotoProofTransaction;
  assert.equal(typeof buildRecordPhotoProofTransaction, 'function');

  const treeConfigAccountData = Buffer.from(vectors.treeConfigAccount.dataHex, 'hex');
  const owner = new PublicKey(vectors.photoProof.ownerBase58);

  const mockConnection = {
    async getAccountInfo() {
      return { data: treeConfigAccountData };
    },
    async getLatestBlockhash() {
      return { blockhash: '11111111111111111111111111111111' };
    },
  };

  const result = await buildRecordPhotoProofTransaction({
    connection: mockConnection,
    owner,
    hash32: hexToBytes(vectors.photoProof.hashHex),
    nonce: vectors.photoProof.nonce,
    timestampSec: vectors.photoProof.timestampSec,
    h3CellU64: vectors.recordPhotoProofInstruction.h3CellHex,
    attestationSignature64: hexToBytes(vectors.recordPhotoProofInstruction.attestationSignatureHex),
  });

  assert.equal(result.merkleTree.toBase58(), vectors.treeConfigAccount.merkleTreeBase58);
  assert.equal(result.additionalSigners.length, 0);
});
