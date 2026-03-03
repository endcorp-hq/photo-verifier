import {
  type Connection,
  type Transaction,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  Keypair,
  TransactionMessage,
  VersionedTransaction,
  ComputeBudgetProgram,
  Ed25519Program,
  SYSVAR_INSTRUCTIONS_PUBKEY,
} from '@solana/web3.js';
import { sha256 } from '@noble/hashes/sha256';
import { blake3 } from '@noble/hashes/blake3';
import { bytesToHex } from '@noble/hashes/utils';
import type { S3Config } from '@photoverifier/core/dist/types.js';
import {
  buildS3KeyForPhoto,
  buildS3Uri,
  putToPresignedUrl,
} from '@photoverifier/core/dist/storage.js';
import { h3CellToU64 } from './h3';

export const PHOTO_PROOF_COMPRESSED_PROGRAM_ID = new PublicKey(
  '3i6eNpCFvXhMg8LESAutXWKUtAey9mAbTziLLuUc78Hu'
);
export const SPL_ACCOUNT_COMPRESSION_PROGRAM_ID = new PublicKey(
  'cmtDvXumGCrqC1Age74AVPhSRVXJMd8PJS91L8KbNCK'
);
export const SPL_NOOP_PROGRAM_ID = new PublicKey(
  'noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV'
);
export const PHOTO_PROOF_FEE_AUTHORITY = new PublicKey(
  'DTrsex7XGyS6QstUr4GFZ4cHYEm4YoeD75799A7ns7Sc'
);
export const PHOTO_PROOF_ATTESTATION_AUTHORITY = new PublicKey(
  'Ga6SxqKLPTzrc4pykqrawSi9pvz3ZGhAdnZSBDKKioYk'
);
const MERKLE_TREE_ACCOUNT_SPACE = 31_800;
const TREE_CONFIG_MIN_DATA_LEN = 8 + 1 + 32 + 1 + 32;
const ATTESTATION_PREFIX = new TextEncoder().encode('photo-proof-attestation-v1');
const MILLISECONDS_PER_SECOND = 1_000;

function instructionDiscriminator(name: string): Uint8Array {
  return sha256(new TextEncoder().encode(`global:${name}`)).slice(0, 8);
}

function putI64LE(view: DataView, offset: number, value: bigint): number {
  view.setBigInt64(offset, value, true);
  return offset + 8;
}

function putU64LE(view: DataView, offset: number, value: bigint): number {
  view.setBigUint64(offset, value, true);
  return offset + 8;
}

function unixSeconds(input: string | number): number {
  if (typeof input === 'number') return Math.trunc(input);
  const parsed = Date.parse(input);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid timestamp: ${input}`);
  return Math.trunc(parsed / MILLISECONDS_PER_SECOND);
}

export function deriveGlobalTreeConfigPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from('tree_config')], PHOTO_PROOF_COMPRESSED_PROGRAM_ID);
}

export function deriveGlobalTreeAuthorityPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from('tree_authority')], PHOTO_PROOF_COMPRESSED_PROGRAM_ID);
}

function encodeInitializeTreeArgs(): Uint8Array {
  return instructionDiscriminator('initialize_tree');
}

type RecordArgs = {
  hash32: Uint8Array;
  nonce: number | bigint;
  timestampSec: number | bigint;
  h3CellU64: number | bigint;
  attestationSignature64: Uint8Array;
};

function encodeRecordPhotoProofArgs(args: RecordArgs): Uint8Array {
  if (args.hash32.length !== 32) throw new Error('hash32 must be 32 bytes');
  if (args.attestationSignature64.length !== 64) {
    throw new Error('attestationSignature64 must be 64 bytes');
  }
  const totalLen = 8 + 32 + 8 + 8 + 8 + 64;
  const out = new Uint8Array(totalLen);
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
  let o = 0;
  out.set(instructionDiscriminator('record_photo_proof'), o);
  o += 8;
  out.set(args.hash32, o);
  o += 32;
  o = putU64LE(view, o, BigInt(args.nonce));
  o = putI64LE(view, o, BigInt(args.timestampSec));
  o = putU64LE(view, o, h3CellToU64(args.h3CellU64));
  out.set(args.attestationSignature64, o);
  return out;
}

export function buildAttestationMessage(params: {
  owner: PublicKey;
  hash32: Uint8Array;
  nonce: number | bigint;
  timestampSec: number | bigint;
  h3CellU64: number | bigint;
}): Uint8Array {
  if (params.hash32.length !== 32) throw new Error('hash32 must be 32 bytes');

  const out = new Uint8Array(ATTESTATION_PREFIX.length + 32 + 32 + 8 + 8 + 8);
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
  let o = 0;
  out.set(ATTESTATION_PREFIX, o);
  o += ATTESTATION_PREFIX.length;
  out.set(params.owner.toBytes(), o);
  o += 32;
  out.set(params.hash32, o);
  o += 32;
  o = putU64LE(view, o, BigInt(params.nonce));
  o = putI64LE(view, o, BigInt(params.timestampSec));
  putU64LE(view, o, h3CellToU64(params.h3CellU64));
  return out;
}

function decodeTreeConfigMerkleTree(data: Buffer): PublicKey {
  if (data.length < TREE_CONFIG_MIN_DATA_LEN) {
    throw new Error(`tree_config account data too short (${data.length} bytes)`);
  }
  // Anchor layout: discriminator(8) + version(1) + authority(32) + tree_authority_bump(1) + merkle_tree(32)
  const merkleTreeOffset = 8 + 1 + 32 + 1;
  return new PublicKey(data.subarray(merkleTreeOffset, merkleTreeOffset + 32));
}

export function buildInitializeTreeInstruction(params: {
  authority: PublicKey;
  merkleTree: PublicKey;
}): {
  instruction: TransactionInstruction;
  treeConfigPda: PublicKey;
  merkleTree: PublicKey;
  treeAuthorityPda: PublicKey;
} {
  const [treeConfigPda] = deriveGlobalTreeConfigPda();
  const [treeAuthorityPda] = deriveGlobalTreeAuthorityPda();
  const keys = [
    { pubkey: treeConfigPda, isSigner: false, isWritable: true },
    { pubkey: params.merkleTree, isSigner: true, isWritable: true },
    { pubkey: treeAuthorityPda, isSigner: false, isWritable: false },
    { pubkey: params.authority, isSigner: true, isWritable: true },
    { pubkey: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SPL_NOOP_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];
  return {
    instruction: new TransactionInstruction({
      programId: PHOTO_PROOF_COMPRESSED_PROGRAM_ID,
      keys,
      data: Buffer.from(encodeInitializeTreeArgs()),
    }),
    treeConfigPda,
    merkleTree: params.merkleTree,
    treeAuthorityPda,
  };
}

export function buildRecordPhotoProofInstruction(params: {
  owner: PublicKey;
  hash32: Uint8Array;
  nonce: number | bigint;
  timestampSec: number | bigint;
  h3CellU64: number | bigint;
  attestationSignature64: Uint8Array;
  feeRecipient?: PublicKey;
  treeConfigPda?: PublicKey;
  merkleTree?: PublicKey;
  treeAuthorityPda?: PublicKey;
}): {
  instruction: TransactionInstruction;
  treeConfigPda: PublicKey;
  merkleTree: PublicKey;
  treeAuthorityPda: PublicKey;
} {
  const treeConfigPda = params.treeConfigPda ?? deriveGlobalTreeConfigPda()[0];
  if (!params.merkleTree) {
    throw new Error('merkleTree is required');
  }
  const treeAuthorityPda = params.treeAuthorityPda ?? deriveGlobalTreeAuthorityPda()[0];
  const feeRecipient = params.feeRecipient ?? PHOTO_PROOF_FEE_AUTHORITY;
  const data = encodeRecordPhotoProofArgs({
    hash32: params.hash32,
    nonce: params.nonce,
    timestampSec: params.timestampSec,
    h3CellU64: params.h3CellU64,
    attestationSignature64: params.attestationSignature64,
  });
  const keys = [
    { pubkey: treeConfigPda, isSigner: false, isWritable: true },
    { pubkey: params.merkleTree, isSigner: false, isWritable: true },
    { pubkey: treeAuthorityPda, isSigner: false, isWritable: false },
    { pubkey: params.owner, isSigner: true, isWritable: true },
    { pubkey: feeRecipient, isSigner: false, isWritable: true },
    { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
    { pubkey: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SPL_NOOP_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];
  return {
    instruction: new TransactionInstruction({
      programId: PHOTO_PROOF_COMPRESSED_PROGRAM_ID,
      keys,
      data: Buffer.from(data),
    }),
    treeConfigPda,
    merkleTree: params.merkleTree,
    treeAuthorityPda,
  };
}

export async function buildRecordPhotoProofTransaction(params: {
  connection: Connection;
  owner: PublicKey;
  hash32: Uint8Array;
  nonce: number | bigint;
  timestampSec: number | bigint;
  h3CellU64: number | bigint;
  attestationSignature64: Uint8Array;
  feeRecipient?: PublicKey;
}): Promise<{
  transaction: VersionedTransaction;
  treeConfigPda: PublicKey;
  merkleTree: PublicKey;
  additionalSigners: Keypair[];
}> {
  const [treeConfigPda] = deriveGlobalTreeConfigPda();
  const [treeAuthorityPda] = deriveGlobalTreeAuthorityPda();
  const maybeTree = await params.connection.getAccountInfo(treeConfigPda);
  const setupInstructions: TransactionInstruction[] = [];
  const additionalSigners: Keypair[] = [];
  let merkleTree: PublicKey;
  if (!maybeTree) {
    if (!params.owner.equals(PHOTO_PROOF_FEE_AUTHORITY)) {
      throw new Error(
        `Compressed tree is not initialized. Initialization must be sent by ${PHOTO_PROOF_FEE_AUTHORITY.toBase58()}`
      );
    }
    const merkleTreeKeypair = Keypair.generate();
    const lamports = await params.connection.getMinimumBalanceForRentExemption(
      MERKLE_TREE_ACCOUNT_SPACE
    );
    setupInstructions.push(
      SystemProgram.createAccount({
        fromPubkey: params.owner,
        newAccountPubkey: merkleTreeKeypair.publicKey,
        lamports,
        space: MERKLE_TREE_ACCOUNT_SPACE,
        programId: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
      })
    );
    setupInstructions.push(
      buildInitializeTreeInstruction({
        authority: params.owner,
        merkleTree: merkleTreeKeypair.publicKey,
      }).instruction
    );
    additionalSigners.push(merkleTreeKeypair);
    merkleTree = merkleTreeKeypair.publicKey;
  } else {
    merkleTree = decodeTreeConfigMerkleTree(maybeTree.data);
  }

  const { instruction } = buildRecordPhotoProofInstruction({
    owner: params.owner,
    hash32: params.hash32,
    nonce: params.nonce,
    timestampSec: params.timestampSec,
    h3CellU64: params.h3CellU64,
    attestationSignature64: params.attestationSignature64,
    feeRecipient: params.feeRecipient,
    treeConfigPda,
    merkleTree,
    treeAuthorityPda,
  });
  const attestationMessage = buildAttestationMessage({
    owner: params.owner,
    hash32: params.hash32,
    nonce: params.nonce,
    timestampSec: params.timestampSec,
    h3CellU64: params.h3CellU64,
  });
  const attestationIx = Ed25519Program.createInstructionWithPublicKey({
    publicKey: PHOTO_PROOF_ATTESTATION_AUTHORITY.toBytes(),
    message: attestationMessage,
    signature: params.attestationSignature64,
  });

  const { blockhash } = await params.connection.getLatestBlockhash();
  const message = new TransactionMessage({
    payerKey: params.owner,
    recentBlockhash: blockhash,
    instructions: [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 240_000 }),
      ...setupInstructions,
      attestationIx,
      instruction,
    ],
  }).compileToV0Message();

  return {
    transaction: new VersionedTransaction(message),
    treeConfigPda,
    merkleTree,
    additionalSigners,
  };
}

export function sendTransactionWithKeypair(
  connection: Connection,
  tx: Transaction,
  signer: Keypair
): Promise<string> {
  tx.partialSign(signer);
  return connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
}

export async function confirmTransaction(connection: Connection, signature: string): Promise<void> {
  const latest = await connection.getLatestBlockhash();
  await connection.confirmTransaction({ signature, ...latest }, 'confirmed');
}

export function hashBytes(bytes: Uint8Array): Promise<{ hash32: Uint8Array; hashHex: string }> {
  const digest = blake3(bytes);
  return Promise.resolve({ hash32: digest, hashHex: bytesToHex(digest) });
}

export async function submitRecordPhotoProof(params: {
  connection: Connection;
  owner: PublicKey;
  sendTransaction: (
    tx: Transaction | VersionedTransaction,
    minContextSlot: number
  ) => Promise<string>;
  hash32: Uint8Array;
  nonce: number | bigint;
  timestamp: string | number;
  h3Cell: string;
  attestationSignature64: Uint8Array;
}): Promise<{ signature: string; merkleTree: PublicKey }> {
  const { transaction, merkleTree } = await buildRecordPhotoProofTransaction({
    connection: params.connection,
    owner: params.owner,
    hash32: params.hash32,
    nonce: params.nonce,
    timestampSec: unixSeconds(params.timestamp),
    h3CellU64: h3CellToU64(params.h3Cell),
    attestationSignature64: params.attestationSignature64,
  });
  const signature = await params.sendTransaction(
    transaction,
    await resolveMinContextSlot(params.connection)
  );
  await confirmTransaction(params.connection, signature);
  return { signature, merkleTree };
}

async function resolveMinContextSlot(connection: Connection): Promise<number> {
  const maybeConnection = connection as Connection & {
    getLatestBlockhashAndContext?: () => Promise<{ context: { slot: number } }>;
  };
  if (typeof maybeConnection.getLatestBlockhashAndContext !== 'function') {
    return 0;
  }
  const { context } = await maybeConnection.getLatestBlockhashAndContext();
  return context.slot;
}

export async function uploadAndSubmit(params: {
  connection: Connection;
  owner: PublicKey;
  sendTransaction: (tx: Transaction | VersionedTransaction) => Promise<string>;
  s3: S3Config;
  bucket: string;
  seekerMint: string;
  basePrefix?: string;
  photoBytes: Uint8Array;
  h3Cell: string;
  contentType?: string;
  timestamp: string | number;
  nonce: number | bigint;
  attestationSignature64: Uint8Array;
}): Promise<{
  signature: string;
  s3Key: string;
  s3Uri: string;
  hashHex: string;
}> {
  const { hash32, hashHex } = await hashBytes(params.photoBytes);
  const requestedS3Key = buildS3KeyForPhoto({
    seekerMint: params.seekerMint,
    photoHashHex: hashHex,
    basePrefix: params.basePrefix,
  });
  const upload = await params.s3.upload({
    key: requestedS3Key,
    contentType: params.contentType || 'image/jpeg',
    bytes: params.photoBytes,
  });
  const s3Key = upload.key ?? requestedS3Key;

  return submitPhotoProofWithPresignedUpload({
    connection: params.connection,
    owner: params.owner,
    sendTransaction: async (tx) => params.sendTransaction(tx),
    bucket: params.bucket,
    s3Key,
    uploadUrl: upload.url,
    photoBytes: params.photoBytes,
    contentType: params.contentType || 'image/jpeg',
    hash32,
    hashHex,
    nonce: params.nonce,
    timestamp: params.timestamp,
    h3Cell: params.h3Cell,
    attestationSignature64: params.attestationSignature64,
  });
}

export async function submitPhotoProofWithPresignedUpload(params: {
  connection: Connection;
  owner: PublicKey;
  sendTransaction: (
    tx: Transaction | VersionedTransaction,
    minContextSlot: number
  ) => Promise<string>;
  bucket: string;
  s3Key: string;
  uploadUrl: string;
  photoBytes: Uint8Array;
  contentType?: string;
  hash32: Uint8Array;
  hashHex: string;
  nonce: number | bigint;
  timestamp: string | number;
  h3Cell: string;
  attestationSignature64: Uint8Array;
  onUploaded?: () => void | Promise<void>;
}): Promise<{
  signature: string;
  s3Key: string;
  s3Uri: string;
  hashHex: string;
}> {
  const s3Uri = buildS3Uri(params.bucket, params.s3Key);

  await putToPresignedUrl({
    url: params.uploadUrl,
    bytes: params.photoBytes,
    contentType: params.contentType || 'image/jpeg',
  });
  if (params.onUploaded) await params.onUploaded();

  const { signature } = await submitRecordPhotoProof({
    connection: params.connection,
    owner: params.owner,
    sendTransaction: params.sendTransaction,
    hash32: params.hash32,
    nonce: params.nonce,
    timestamp: params.timestamp,
    h3Cell: params.h3Cell,
    attestationSignature64: params.attestationSignature64,
  })

  return { signature, s3Key: params.s3Key, s3Uri, hashHex: params.hashHex };
}
