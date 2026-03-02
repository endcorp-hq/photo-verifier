import {
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  Connection,
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
import { buildS3KeyForPhoto, buildS3Uri, putToPresignedUrl, S3Config } from './storage';

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
  return Math.trunc(parsed / 1000);
}

function locationToFixedE6(location: string): { latitudeE6: number; longitudeE6: number } {
  const [latRaw, lonRaw] = String(location).split(',');
  const lat = Number(latRaw);
  const lon = Number(lonRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new Error(`Invalid location string: ${location}`);
  }
  return {
    latitudeE6: Math.round(lat * 1_000_000),
    longitudeE6: Math.round(lon * 1_000_000),
  };
}

export function deriveTreeConfigPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from('tree_config')], PHOTO_PROOF_COMPRESSED_PROGRAM_ID);
}

export function deriveTreeAuthorityPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from('tree_authority')], PHOTO_PROOF_COMPRESSED_PROGRAM_ID);
}

function encodeInitializeTreeArgs(): Uint8Array {
  return instructionDiscriminator('initialize_tree');
}

type RecordArgs = {
  hash32: Uint8Array;
  nonce: number | bigint;
  timestampSec: number | bigint;
  latitudeE6: number;
  longitudeE6: number;
  attestationSignature64: Uint8Array;
};

function encodeRecordPhotoProofArgs(args: RecordArgs): Uint8Array {
  if (args.hash32.length !== 32) throw new Error('hash32 must be 32 bytes');
  if (args.attestationSignature64.length !== 64) {
    throw new Error('attestationSignature64 must be 64 bytes');
  }
  const totalLen = 8 + 32 + 8 + 8 + 8 + 8 + 64;
  const out = new Uint8Array(totalLen);
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
  let o = 0;
  out.set(instructionDiscriminator('record_photo_proof'), o);
  o += 8;
  out.set(args.hash32, o);
  o += 32;
  o = putU64LE(view, o, BigInt(args.nonce));
  o = putI64LE(view, o, BigInt(args.timestampSec));
  o = putI64LE(view, o, BigInt(args.latitudeE6));
  o = putI64LE(view, o, BigInt(args.longitudeE6));
  out.set(args.attestationSignature64, o);
  return out;
}

export function buildAttestationMessage(params: {
  owner: PublicKey;
  hash32: Uint8Array;
  nonce: number | bigint;
  timestampSec: number | bigint;
  latitudeE6: number;
  longitudeE6: number;
}): Uint8Array {
  if (params.hash32.length !== 32) throw new Error('hash32 must be 32 bytes');

  const out = new Uint8Array(ATTESTATION_PREFIX.length + 32 + 32 + 8 + 8 + 8 + 8);
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
  o = putI64LE(view, o, BigInt(params.latitudeE6));
  putI64LE(view, o, BigInt(params.longitudeE6));
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
  const [treeConfigPda] = deriveTreeConfigPda();
  const [treeAuthorityPda] = deriveTreeAuthorityPda();
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
  latitudeE6: number;
  longitudeE6: number;
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
  const treeConfigPda = params.treeConfigPda ?? deriveTreeConfigPda()[0];
  if (!params.merkleTree) {
    throw new Error('merkleTree is required');
  }
  const treeAuthorityPda = params.treeAuthorityPda ?? deriveTreeAuthorityPda()[0];
  const feeRecipient = params.feeRecipient ?? PHOTO_PROOF_FEE_AUTHORITY;
  const data = encodeRecordPhotoProofArgs({
    hash32: params.hash32,
    nonce: params.nonce,
    timestampSec: params.timestampSec,
    latitudeE6: params.latitudeE6,
    longitudeE6: params.longitudeE6,
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
  latitudeE6: number;
  longitudeE6: number;
  attestationSignature64: Uint8Array;
  feeRecipient?: PublicKey;
}): Promise<{
  transaction: VersionedTransaction;
  treeConfigPda: PublicKey;
  merkleTree: PublicKey;
  additionalSigners: Keypair[];
}> {
  const [treeConfigPda] = deriveTreeConfigPda();
  const [treeAuthorityPda] = deriveTreeAuthorityPda();
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
    latitudeE6: params.latitudeE6,
    longitudeE6: params.longitudeE6,
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
    latitudeE6: params.latitudeE6,
    longitudeE6: params.longitudeE6,
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

export async function sendTransactionWithKeypair(
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

export async function hashBytes(bytes: Uint8Array): Promise<{ hash32: Uint8Array; hashHex: string }> {
  const digest = blake3(bytes);
  return { hash32: digest, hashHex: bytesToHex(digest) };
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
  locationString: string;
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
  const s3Key = buildS3KeyForPhoto({
    seekerMint: params.seekerMint,
    photoHashHex: hashHex,
    basePrefix: params.basePrefix,
  });
  const s3Uri = buildS3Uri(params.bucket, s3Key);

  await putToPresignedUrl({
    url: (
      await params.s3.upload({
        key: s3Key,
        contentType: params.contentType || 'image/jpeg',
        bytes: params.photoBytes,
      })
    ).url,
    bytes: params.photoBytes,
    contentType: params.contentType || 'image/jpeg',
  });

  const { latitudeE6, longitudeE6 } = locationToFixedE6(params.locationString);
  const { transaction } = await buildRecordPhotoProofTransaction({
    connection: params.connection,
    owner: params.owner,
    hash32,
    nonce: params.nonce,
    timestampSec: unixSeconds(params.timestamp),
    latitudeE6,
    longitudeE6,
    attestationSignature64: params.attestationSignature64,
  });

  const signature = await params.sendTransaction(transaction);
  await confirmTransaction(params.connection, signature);

  return { signature, s3Key, s3Uri, hashHex };
}
