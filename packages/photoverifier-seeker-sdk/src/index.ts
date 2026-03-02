import { Base64 } from 'js-base64';
import type { PresignIntegrityEnvelope, PresignIntegrityPayload } from '@photoverifier/sdk';

// Re-export seeker-centric primitives from the base SDK.
export {
  blake3HexFromBytes,
  buildS3KeyForPhoto,
  buildS3Uri,
  getCurrentLocation,
  putToPresignedUrl,
  verifySeeker,
  buildRecordPhotoProofTransaction,
  buildRecordPhotoProofInstruction,
  buildAttestationMessage,
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
} from '@photoverifier/sdk';

export type IntegrityEnvelopeSigner = (message: Uint8Array) => Promise<Uint8Array>;

export type BuildIntegrityPayloadParams = {
  hashHex: string;
  latitudeE6: number;
  longitudeE6: number;
  timestampSec: number;
  wallet: string;
  nonce: string;
  slot: number;
  blockhash: string;
  location?: string;
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
  const location = params.location ?? `${params.latitudeE6 / 1_000_000},${params.longitudeE6 / 1_000_000}`;
  return {
    hashHex: params.hashHex,
    location,
    latitudeE6: params.latitudeE6,
    longitudeE6: params.longitudeE6,
    timestampSec: params.timestampSec,
    wallet: params.wallet,
    nonce: params.nonce,
    slot: params.slot,
    blockhash: params.blockhash,
  };
}

export function canonicalizeIntegrityPayload(payload: PresignIntegrityPayload): string {
  return JSON.stringify({
    hashHex: payload.hashHex,
    location: payload.location,
    latitudeE6: payload.latitudeE6,
    longitudeE6: payload.longitudeE6,
    timestampSec: payload.timestampSec,
    wallet: payload.wallet,
    nonce: payload.nonce,
    slot: payload.slot,
    blockhash: payload.blockhash,
  });
}

export async function createIntegrityEnvelope(
  payload: PresignIntegrityPayload,
  sign: IntegrityEnvelopeSigner
): Promise<PresignIntegrityEnvelope> {
  const canonical = canonicalizeIntegrityPayload(payload);
  const sigBytes = await sign(new TextEncoder().encode(canonical));
  return {
    version: 'v1',
    payload,
    signature: Base64.fromUint8Array(sigBytes),
  };
}
