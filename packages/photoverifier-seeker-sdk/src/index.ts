import { Base64 } from 'js-base64';
import { canonicalizeIntegrityPayload as canonicalizePayload } from '@endcorp/photoverifier-sdk';
import type { PresignIntegrityEnvelope, PresignIntegrityPayload } from '@endcorp/photoverifier-sdk';

// Re-export seeker-centric primitives from the base SDK.
export {
  blake3HexFromBytes,
  buildS3KeyForPhoto,
  buildS3Uri,
  getCurrentLocation,
  putToPresignedUrl,
  verifySeeker,
  latLngToH3Cell,
  locationToH3Cell,
  h3CellToU64,
  buildRecordPhotoProofTransaction,
  buildRecordPhotoProofInstruction,
  buildAttestationMessage,
  canonicalizeIntegrityPayload,
  requestAttestedPresignedPut,
  parseAttestedPresignResponse,
  decodeAttestationSignature64,
  PHOTO_PROOF_COMPRESSED_PROGRAM_ID,
  PHOTO_PROOF_FEE_AUTHORITY,
  PHOTO_PROOF_ATTESTATION_AUTHORITY,
  PresignError,
  type PresignErrorCode,
  type PresignIntegrityEnvelope,
  type PresignIntegrityPayload,
  type AttestedPresignResponse,
} from '@endcorp/photoverifier-sdk';

export type IntegrityEnvelopeSigner = (message: Uint8Array) => Promise<Uint8Array>;

export type BuildIntegrityPayloadParams = {
  hashHex: string;
  h3Cell: string;
  h3Resolution?: number;
  timestampSec: number;
  wallet: string;
  nonce: string;
  slot: number;
  blockhash: string;
};

export function createNonceU64(nowMs: number = Date.now(), randomBits: number = 20): bigint {
  const mask = Math.max(1, Math.min(24, randomBits));
  const random = Math.floor(Math.random() * (1 << mask));
  return (BigInt(nowMs) << BigInt(mask)) | BigInt(random);
}

export function nonceToString(nonce: bigint): string {
  return nonce.toString();
}

export function buildIntegrityPayload(params: BuildIntegrityPayloadParams): PresignIntegrityPayload {
  return {
    hashHex: params.hashHex,
    h3Cell: params.h3Cell,
    h3Resolution: params.h3Resolution,
    timestampSec: params.timestampSec,
    wallet: params.wallet,
    nonce: params.nonce,
    slot: params.slot,
    blockhash: params.blockhash,
  };
}

export async function createIntegrityEnvelope(
  payload: PresignIntegrityPayload,
  sign: IntegrityEnvelopeSigner
): Promise<PresignIntegrityEnvelope> {
  const canonical = canonicalizePayload(payload);
  const sigBytes = await sign(new TextEncoder().encode(canonical));
  return {
    version: 'v1',
    payload,
    signature: Base64.fromUint8Array(sigBytes),
  };
}
