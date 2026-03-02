export type UploadIntegrityPayload = {
  hashHex: string;
  location: string;
  latitudeE6: number;
  longitudeE6: number;
  timestampSec: number;
  wallet: string;
  nonce: string;
  slot: number;
  blockhash: string;
};

export function canonicalizeIntegrityPayload(payload: UploadIntegrityPayload): string {
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
