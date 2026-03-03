import { Base64 } from 'js-base64';
import type { PresignIntegrityEnvelope, PresignIntegrityPayload } from '@endcorp/photoverifier-sdk';

const { canonicalizeIntegrityPayload: canonicalizePayload } = require(
  '@endcorp/photoverifier-sdk/dist/modules/presign.js'
) as {
  canonicalizeIntegrityPayload: (payload: PresignIntegrityPayload) => string;
};

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
