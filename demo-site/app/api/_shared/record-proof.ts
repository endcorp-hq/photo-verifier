import { utils as anchorUtils } from '@coral-xyz/anchor';
import { createHash } from 'crypto';
import {
  RECORD_PHOTO_PROOF_DISCRIMINATOR_SEED,
  RECORD_PHOTO_PROOF_MIN_LEN,
} from '@photoverifier/core/dist/contracts/chain-contracts.js';

const RECORD_PROOF_DISC = createHash('sha256')
  .update(RECORD_PHOTO_PROOF_DISCRIMINATOR_SEED)
  .digest()
  .subarray(0, 8);

type DecodedRecordProof = {
  hashHex: string;
  nonce: string;
  h3Cell: string;
  timestampSec: number;
};

export function decodeIxData(data: string | undefined): Buffer | null {
  if (!data) return null;
  try {
    return Buffer.from(anchorUtils.bytes.bs58.decode(data));
  } catch {
    // Ignore bs58 decode failures; fallback to base64 decode below.
  }
  try {
    const raw = Buffer.from(data, 'base64');
    if (raw.length > 0) return raw;
  } catch {
    // Ignore invalid base64 payloads and treat as undecodable.
  }
  return null;
}

export function decodeRecordProof(raw: Buffer | null): DecodedRecordProof | null {
  if (!raw || raw.length < RECORD_PHOTO_PROOF_MIN_LEN) return null;
  if (!raw.subarray(0, 8).equals(RECORD_PROOF_DISC)) return null;

  let offset = 8;
  const hash = raw.subarray(offset, offset + 32);
  offset += 32;
  const nonce = raw.readBigUInt64LE(offset).toString();
  offset += 8;
  const timestampSec = Number(raw.readBigInt64LE(offset));
  offset += 8;
  const h3Cell = raw.readBigUInt64LE(offset).toString(16);

  return {
    hashHex: Buffer.from(hash).toString('hex'),
    nonce,
    h3Cell,
    timestampSec: Number.isFinite(timestampSec) ? timestampSec : 0,
  };
}
