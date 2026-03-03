/**
 * Compressed Accounts Module for Citizen Science SDK
 * 
 * This module provides cost-effective on-chain storage using Solana's
 * Concurrent Merkle Trees (via @solana/spl-account-compression).
 * 
 * Cost comparison:
 * - Traditional PDA: ~$1 per photo
 * - Compressed: ~$0.001 per photo (1000x reduction)
 * 
 * LICENSE: This module requires a valid license key
 */

import { type Connection, PublicKey } from '@solana/web3.js';
import {
  getConcurrentMerkleTreeAccountSize
} from '@solana/spl-account-compression';
import { blake3 } from '@noble/hashes/blake3';

// Program constants
export const PHOTO_PROOF_PROGRAM_ID = new PublicKey('3i6eNpCFvXhMg8LESAutXWKUtAey9mAbTziLLuUc78Hu');
export const BUBBLEGUM_PROGRAM_ID = new PublicKey('DTNhearU7zbKfR4XSzWUGY4TFUgb6s86GY6T1aWPALEP');

/**
 * Configuration for a Merkle tree
 */
export interface TreeConfig {
  maxDepth: number;
  maxBufferSize: number;
  canopyDepth: number;
}

/**
 * Default tree configurations based on expected photo volume
 */
export const TREE_CONFIGS: Record<string, TreeConfig> = {
  // 1,000 photos - small deployment
  small: {
    maxDepth: 10,
    maxBufferSize: 8,
    canopyDepth: 8,
  },
  // 16,384 photos - typical deployment
  medium: {
    maxDepth: 14,
    maxBufferSize: 64,
    canopyDepth: 8,
  },
  // 1,048,576 photos - large deployment
  large: {
    maxDepth: 20,
    maxBufferSize: 1024,
    canopyDepth: 12,
  },
};

/**
 * Photo proof data stored in a Merkle tree leaf
 */
export interface PhotoProof {
  nonce: number;
  hash: Uint8Array;
  timestamp: number; // Unix timestamp (seconds)
  latitude: number; // Fixed-point (multiply by 1e6 for precision)
  longitude: number; // Fixed-point (multiply by 1e6 for precision)
  owner: PublicKey;
}

/**
 * Serialize PhotoProof to bytes for Merkle tree leaf
 * Total size: 4 + 32 + 8 + 8 + 8 + 32 = 92 bytes
 */
export function serializePhotoProof(proof: PhotoProof): Uint8Array {
  const buffer = new Uint8Array(92);
  const view = new DataView(buffer.buffer);
  let offset = 0;

  // nonce: u32
  view.setUint32(offset, proof.nonce, true);
  offset += 4;

  // hash: [u8; 32]
  buffer.set(proof.hash.slice(0, 32), offset);
  offset += 32;

  // timestamp: i64
  view.setBigInt64(offset, BigInt(proof.timestamp), true);
  offset += 8;

  // latitude: i64 (fixed point, 6 decimal places)
  view.setBigInt64(offset, BigInt(Math.round(proof.latitude * 1e6)), true);
  offset += 8;

  // longitude: i64 (fixed point, 6 decimal places)
  view.setBigInt64(offset, BigInt(Math.round(proof.longitude * 1e6)), true);
  offset += 8;

  // owner: Pubkey (32 bytes)
  buffer.set(proof.owner.toBytes(), offset);

  return buffer;
}

/**
 * Deserialize bytes back to PhotoProof
 */
export function deserializePhotoProof(data: Uint8Array): PhotoProof | null {
  if (data.length < 92) return null;

  const view = new DataView(data.buffer, data.byteOffset);
  let offset = 0;

  const nonce = view.getUint32(offset, true);
  offset += 4;

  const hash = data.slice(offset, offset + 32);
  offset += 32;

  const timestamp = Number(view.getBigInt64(offset, true));
  offset += 8;

  const latitude = Number(view.getBigInt64(offset, true)) / 1e6;
  offset += 8;

  const longitude = Number(view.getBigInt64(offset, true)) / 1e6;
  offset += 8;

  const owner = new PublicKey(data.slice(offset, offset + 32));

  return { nonce, hash, timestamp, latitude, longitude, owner };
}

/**
 * Create a leaf hash from PhotoProof data
 */
export function hashPhotoProof(proof: PhotoProof): Uint8Array {
  const serialized = serializePhotoProof(proof);
  return blake3(serialized);
}

/**
 * Calculate the cost of creating a Merkle tree
 */
export async function calculateTreeCost(
  connection: Connection,
  config: TreeConfig
): Promise<number> {
  const treeSize = getConcurrentMerkleTreeAccountSize(
    config.maxDepth,
    config.maxBufferSize,
    config.canopyDepth
  );
  const lamports = await connection.getMinimumBalanceForRentExemption(treeSize);
  return lamports;
}

/**
 * Derive the tree config PDA
 */
export function deriveTreeConfigPda(tree: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('tree_config'), tree.toBuffer()],
    BUBBLEGUM_PROGRAM_ID
  )[0];
}

/**
 * Derive the authority PDA for the tree
 */
export function deriveAuthorityPda(authority: PublicKey, tree: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('authority'), authority.toBuffer(), tree.toBuffer()],
    BUBBLEGUM_PROGRAM_ID
  )[0];
}

/**
 * Get the number of photos that can fit in a tree
 */
export function getTreeCapacity(config: TreeConfig): number {
  return Math.pow(2, config.maxDepth);
}

/**
 * Estimate cost per photo for a given tree config
 */
export async function estimateCostPerPhoto(
  connection: Connection,
  config: TreeConfig,
  expectedPhotos: number
): Promise<number> {
  const treeCost = await calculateTreeCost(connection, config);
  const lamportsPerPhoto = treeCost / Math.min(expectedPhotos, getTreeCapacity(config));
  return lamportsPerPhoto;
}

/**
 * Leaf schema for compression (compatible with Bubblegum)
 * This is the format stored in the Merkle tree
 */
export interface LeafSchema {
  owner: PublicKey;
  delegate: PublicKey;
  nonce: number;
  dataHash: Uint8Array;
}

/**
 * Create a leaf schema from photo proof
 */
export function createLeafSchema(proof: PhotoProof): LeafSchema {
  const dataHash = hashPhotoProof(proof);
  return {
    owner: proof.owner,
    delegate: proof.owner,
    nonce: proof.nonce,
    dataHash,
  };
}
