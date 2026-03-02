export type UploadIntegrityPayload = {
  hashHex: string;
  location: string;
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
    timestampSec: payload.timestampSec,
    wallet: payload.wallet,
    nonce: payload.nonce,
    slot: payload.slot,
    blockhash: payload.blockhash,
  });
}
