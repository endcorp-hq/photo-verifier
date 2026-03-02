export type PresignResponse = {
  uploadURL: string;
  key: string;
};

export type PresignIntegrityPayload = {
  hashHex: string;
  location: string;
  timestampSec: number;
  wallet: string;
  nonce: string;
  slot: number;
  blockhash: string;
};

export type PresignIntegrityEnvelope = {
  version: 'v1';
  payload: PresignIntegrityPayload;
  signature: string; // base64 detached Ed25519 signature over canonical payload JSON
};

export async function requestPresignedPut(endpoint: string, params: {
  key: string;
  contentType: string;
  integrity: PresignIntegrityEnvelope;
}): Promise<PresignResponse> {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to request presigned URL (${res.status}): ${text}`);
  }
  return res.json();
}
