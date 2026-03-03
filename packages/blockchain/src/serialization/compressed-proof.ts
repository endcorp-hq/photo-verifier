import { blake3 } from '@noble/hashes/blake3';
import { PublicKey } from '@solana/web3.js';
import type { LeafSchema } from '../contracts/compressed-contracts.js';

export interface PhotoProof {
  nonce: number;
  hash: Uint8Array;
  timestamp: number;
  latitude: number;
  longitude: number;
  owner: PublicKey;
}

export function serializePhotoProof(proof: PhotoProof): Uint8Array {
  const buffer = new Uint8Array(92);
  const view = new DataView(buffer.buffer);
  let offset = 0;

  view.setUint32(offset, proof.nonce, true);
  offset += 4;

  buffer.set(proof.hash.slice(0, 32), offset);
  offset += 32;

  view.setBigInt64(offset, BigInt(proof.timestamp), true);
  offset += 8;

  view.setBigInt64(offset, BigInt(Math.round(proof.latitude * 1e6)), true);
  offset += 8;

  view.setBigInt64(offset, BigInt(Math.round(proof.longitude * 1e6)), true);
  offset += 8;

  buffer.set(proof.owner.toBytes(), offset);

  return buffer;
}

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

export function hashPhotoProof(proof: PhotoProof): Uint8Array {
  const serialized = serializePhotoProof(proof);
  return blake3(serialized);
}

export function createLeafSchema(proof: PhotoProof): LeafSchema {
  const dataHash = hashPhotoProof(proof);
  return {
    owner: proof.owner,
    delegate: proof.owner,
    nonce: proof.nonce,
    dataHash,
  };
}
