import { Base64 } from 'js-base64';

export type PresignIntegrityPayload = {
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

export type PresignIntegrityEnvelope = {
  version: 'v1';
  payload: PresignIntegrityPayload;
  signature: string;
};

export type AttestedPresignResponse = {
  uploadURL: string;
  key: string;
  attestationSignature: string;
  attestationSignature64: Uint8Array;
  attestationPublicKey?: string;
};

export type PresignErrorCode =
  | 'PRESIGN_HTTP_ERROR'
  | 'PRESIGN_INVALID_JSON'
  | 'PRESIGN_MISSING_UPLOAD_URL'
  | 'PRESIGN_MISSING_KEY'
  | 'PRESIGN_MISSING_ATTESTATION_SIGNATURE'
  | 'PRESIGN_INVALID_ATTESTATION_SIGNATURE';

export class PresignError extends Error {
  readonly code: PresignErrorCode;
  readonly status?: number;

  constructor(code: PresignErrorCode, message: string, status?: number) {
    super(message);
    this.code = code;
    this.status = status;
    this.name = 'PresignError';
  }
}

export async function requestAttestedPresignedPut(
  endpoint: string,
  params: {
    key: string;
    contentType: string;
    integrity: PresignIntegrityEnvelope;
  }
): Promise<AttestedPresignResponse> {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new PresignError(
      'PRESIGN_HTTP_ERROR',
      `Failed to request presigned URL (${res.status}): ${text || 'no response body'}`,
      res.status
    );
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new PresignError('PRESIGN_INVALID_JSON', 'Presign API returned invalid JSON');
  }

  return parseAttestedPresignResponse(json);
}

export function parseAttestedPresignResponse(json: unknown): AttestedPresignResponse {
  const root = unwrapDataObject(json);
  const keys = objectKeysForError(root);

  const uploadURL = firstString(root, [
    'uploadURL',
    'uploadUrl',
    'url',
    'presignedUrl',
    'presignedURL',
    'upload.url',
  ]);
  if (!uploadURL) {
    throw new PresignError(
      'PRESIGN_MISSING_UPLOAD_URL',
      `Presign API response missing upload URL. Found keys: ${keys}`
    );
  }

  const key = firstString(root, ['key', 'objectKey', 'upload.key']);
  if (!key) {
    throw new PresignError(
      'PRESIGN_MISSING_KEY',
      `Presign API response missing key. Found keys: ${keys}`
    );
  }

  const attestationSignature = firstString(root, [
    'attestationSignature',
    'attestation_signature',
    'attestation.signature',
    'proof.attestationSignature',
    'proof.attestation.signature',
  ]);
  if (!attestationSignature) {
    throw new PresignError(
      'PRESIGN_MISSING_ATTESTATION_SIGNATURE',
      `Presign API missing attestation signature. Found keys: ${keys}. Redeploy presign service with attestation support.`
    );
  }

  const attestationSignature64 = decodeAttestationSignature64(attestationSignature);
  const attestationPublicKey = firstString(root, [
    'attestationPublicKey',
    'attestation_public_key',
    'attestation.publicKey',
  ]);

  return { uploadURL, key, attestationSignature, attestationSignature64, attestationPublicKey };
}

export function decodeAttestationSignature64(value: string): Uint8Array {
  try {
    const normalized = normalizeBase64(value);
    const decoded = Base64.toUint8Array(normalized);
    if (decoded.length !== 64) {
      throw new PresignError(
        'PRESIGN_INVALID_ATTESTATION_SIGNATURE',
        `Attestation signature must decode to 64 bytes, got ${decoded.length}`
      );
    }
    return decoded;
  } catch (error) {
    if (error instanceof PresignError) throw error;
    throw new PresignError(
      'PRESIGN_INVALID_ATTESTATION_SIGNATURE',
      'Attestation signature is not valid base64'
    );
  }
}

function unwrapDataObject(input: unknown): unknown {
  if (!input || typeof input !== 'object') return input;
  const direct = input as Record<string, unknown>;
  const nestedData = direct.data;
  if (nestedData && typeof nestedData === 'object') return nestedData;
  return input;
}

function firstString(input: unknown, paths: string[]): string | undefined {
  for (const path of paths) {
    const candidate = readPath(input, path);
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  return undefined;
}

function readPath(input: unknown, path: string): unknown {
  if (!input || typeof input !== 'object') return undefined;
  const parts = path.split('.');
  let current: unknown = input;
  for (const part of parts) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function objectKeysForError(input: unknown): string {
  if (!input || typeof input !== 'object') return '<non-object>';
  const keys = Object.keys(input as Record<string, unknown>);
  return keys.length ? keys.join(', ') : '<none>';
}

function normalizeBase64(input: string): string {
  const stripped = input.trim().replace(/-/g, '+').replace(/_/g, '/');
  const remainder = stripped.length % 4;
  if (remainder === 0) return stripped;
  return stripped + '='.repeat(4 - remainder);
}
