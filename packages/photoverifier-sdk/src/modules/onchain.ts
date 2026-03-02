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
} from '@solana/web3.js';
import { sha256 } from '@noble/hashes/sha256';
import { blake3 } from '@noble/hashes/blake3';
import { bytesToHex } from '@noble/hashes/utils';
import { buildS3KeyForPhoto, buildS3Uri, putToPresignedUrl, S3Config } from './storage';

export const PHOTO_PROOF_COMPRESSED_PROGRAM_ID = new PublicKey(
  '8bQahCyQ6pLf5bFgj21kSd19mu1KZ2RfS7wALf35QyXz'
);

// Backward alias kept for callers that still import the old symbol name.
export const PHOTO_VERIFIER_PROGRAM_ID = PHOTO_PROOF_COMPRESSED_PROGRAM_ID;

function instructionDiscriminator(name: string): Uint8Array {
  return sha256(new TextEncoder().encode(`global:${name}`)).slice(0, 8);
}

function putU32LE(view: DataView, offset: number, value: number): number {
  view.setUint32(offset, value >>> 0, true);
  return offset + 4;
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

export function deriveTreeConfigPda(authority: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('tree_config'), authority.toBuffer()],
    PHOTO_PROOF_COMPRESSED_PROGRAM_ID
  );
}

export function derivePhotoProofPda(owner: PublicKey, hash32: Uint8Array): [PublicKey, number] {
  if (hash32.length !== 32) throw new Error('hash32 must be 32 bytes');
  return PublicKey.findProgramAddressSync(
    [Buffer.from('photo'), owner.toBuffer(), Buffer.from(hash32)],
    PHOTO_PROOF_COMPRESSED_PROGRAM_ID
  );
}

// Backward alias name.
export const derivePhotoDataPda = derivePhotoProofPda;

function encodeInitializeTreeArgs(maxCapacity: number | bigint): Uint8Array {
  const out = new Uint8Array(8 + 8);
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
  out.set(instructionDiscriminator('initialize_tree'), 0);
  putU64LE(view, 8, BigInt(maxCapacity));
  return out;
}

type RecordArgs = {
  hash32: Uint8Array;
  nonce: number | bigint;
  timestampSec: number | bigint;
  latitudeE6: number;
  longitudeE6: number;
  merkleRoot?: Uint8Array;
  leafIndex?: number;
};

function encodeRecordPhotoProofArgs(args: RecordArgs): Uint8Array {
  if (args.hash32.length !== 32) throw new Error('hash32 must be 32 bytes');
  const merkleRoot = args.merkleRoot ?? new Uint8Array(32);
  if (merkleRoot.length !== 32) throw new Error('merkleRoot must be 32 bytes');
  const leafIndex = args.leafIndex ?? 0;

  const totalLen = 8 + 32 + 8 + 8 + 8 + 8 + 32 + 4;
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
  out.set(merkleRoot, o);
  o += 32;
  putU32LE(view, o, leafIndex);
  return out;
}

export function buildInitializeTreeInstruction(params: {
  authority: PublicKey;
  maxCapacity?: number | bigint;
}): { instruction: TransactionInstruction; treeConfigPda: PublicKey } {
  const maxCapacity = params.maxCapacity ?? 100_000;
  const [treeConfigPda] = deriveTreeConfigPda(params.authority);
  const keys = [
    { pubkey: treeConfigPda, isSigner: false, isWritable: true },
    { pubkey: params.authority, isSigner: true, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];
  return {
    instruction: new TransactionInstruction({
      programId: PHOTO_PROOF_COMPRESSED_PROGRAM_ID,
      keys,
      data: Buffer.from(encodeInitializeTreeArgs(maxCapacity)),
    }),
    treeConfigPda,
  };
}

export function buildRecordPhotoProofInstruction(params: {
  owner: PublicKey;
  hash32: Uint8Array;
  nonce: number | bigint;
  timestampSec: number | bigint;
  latitudeE6: number;
  longitudeE6: number;
  merkleRoot?: Uint8Array;
  leafIndex?: number;
  treeConfigPda?: PublicKey;
}): { instruction: TransactionInstruction; photoProofPda: PublicKey; treeConfigPda: PublicKey } {
  const [photoProofPda] = derivePhotoProofPda(params.owner, params.hash32);
  const treeConfigPda = params.treeConfigPda ?? deriveTreeConfigPda(params.owner)[0];
  const data = encodeRecordPhotoProofArgs({
    hash32: params.hash32,
    nonce: params.nonce,
    timestampSec: params.timestampSec,
    latitudeE6: params.latitudeE6,
    longitudeE6: params.longitudeE6,
    merkleRoot: params.merkleRoot,
    leafIndex: params.leafIndex,
  });
  const keys = [
    { pubkey: photoProofPda, isSigner: false, isWritable: true },
    { pubkey: treeConfigPda, isSigner: false, isWritable: true },
    { pubkey: params.owner, isSigner: true, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];
  return {
    instruction: new TransactionInstruction({
      programId: PHOTO_PROOF_COMPRESSED_PROGRAM_ID,
      keys,
      data: Buffer.from(data),
    }),
    photoProofPda,
    treeConfigPda,
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
  merkleRoot?: Uint8Array;
  leafIndex?: number;
  treeMaxCapacity?: number | bigint;
}): Promise<{ transaction: VersionedTransaction; photoProofPda: PublicKey; treeConfigPda: PublicKey }> {
  const [treeConfigPda] = deriveTreeConfigPda(params.owner);
  const maybeTree = await params.connection.getAccountInfo(treeConfigPda);
  const setupInstructions: TransactionInstruction[] = [];
  if (!maybeTree) {
    setupInstructions.push(
      buildInitializeTreeInstruction({
        authority: params.owner,
        maxCapacity: params.treeMaxCapacity ?? 100_000,
      }).instruction
    );
  }

  const { instruction, photoProofPda } = buildRecordPhotoProofInstruction({
    owner: params.owner,
    hash32: params.hash32,
    nonce: params.nonce,
    timestampSec: params.timestampSec,
    latitudeE6: params.latitudeE6,
    longitudeE6: params.longitudeE6,
    merkleRoot: params.merkleRoot,
    leafIndex: params.leafIndex,
    treeConfigPda,
  });

  const { blockhash } = await params.connection.getLatestBlockhash();
  const message = new TransactionMessage({
    payerKey: params.owner,
    recentBlockhash: blockhash,
    instructions: [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 220_000 }),
      ...setupInstructions,
      instruction,
    ],
  }).compileToV0Message();

  return {
    transaction: new VersionedTransaction(message),
    photoProofPda,
    treeConfigPda,
  };
}

// Backward compatibility wrappers for old callsites.
export function buildCreatePhotoDataInstruction(params: {
  payer: PublicKey;
  hash32: Uint8Array;
  s3Uri: string;
  location: string;
  timestamp: string;
}): { instruction: TransactionInstruction; photoDataPda: PublicKey } {
  const { latitudeE6, longitudeE6 } = locationToFixedE6(params.location);
  const nonce = BigInt(Math.max(1, Date.now()));
  const timestampSec = unixSeconds(params.timestamp);
  const { instruction, photoProofPda } = buildRecordPhotoProofInstruction({
    owner: params.payer,
    hash32: params.hash32,
    nonce,
    timestampSec,
    latitudeE6,
    longitudeE6,
  });
  return { instruction, photoDataPda: photoProofPda };
}

export async function buildCreatePhotoDataTransaction(params: {
  connection: Connection;
  payer: PublicKey;
  hash32: Uint8Array;
  s3Uri: string;
  location: string;
  timestamp: string;
}): Promise<{ transaction: VersionedTransaction; photoDataPda: PublicKey }> {
  const { latitudeE6, longitudeE6 } = locationToFixedE6(params.location);
  const nonce = BigInt(Math.max(1, Date.now()));
  const timestampSec = unixSeconds(params.timestamp);
  const { transaction, photoProofPda } = await buildRecordPhotoProofTransaction({
    connection: params.connection,
    owner: params.payer,
    hash32: params.hash32,
    nonce,
    timestampSec,
    latitudeE6,
    longitudeE6,
  });
  return { transaction, photoDataPda: photoProofPda };
}

export async function sendTransactionWithKeypair(connection: Connection, tx: Transaction, signer: Keypair): Promise<string> {
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
}): Promise<{
  signature: string;
  photoProofPda: PublicKey;
  s3Key: string;
  s3Uri: string;
  hashHex: string;
}> {
  const { hash32, hashHex } = await hashBytes(params.photoBytes);
  const s3Key = buildS3KeyForPhoto({ seekerMint: params.seekerMint, photoHashHex: hashHex, basePrefix: params.basePrefix });
  const s3Uri = buildS3Uri(params.bucket, s3Key);

  await putToPresignedUrl({
    url: (await params.s3.upload({
      key: s3Key,
      contentType: params.contentType || 'image/jpeg',
      bytes: params.photoBytes,
    })).url,
    bytes: params.photoBytes,
    contentType: params.contentType || 'image/jpeg',
  });

  const { latitudeE6, longitudeE6 } = locationToFixedE6(params.locationString);
  const { transaction, photoProofPda } = await buildRecordPhotoProofTransaction({
    connection: params.connection,
    owner: params.owner,
    hash32,
    nonce: params.nonce,
    timestampSec: unixSeconds(params.timestamp),
    latitudeE6,
    longitudeE6,
  });

  const signature = await params.sendTransaction(transaction);
  await confirmTransaction(params.connection, signature);

  return { signature, photoProofPda, s3Key, s3Uri, hashHex };
}
