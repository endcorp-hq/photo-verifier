import {
  requestAttestedPresignedPut,
  PresignError,
  type PresignErrorCode,
  type PresignIntegrityPayload,
  type PresignIntegrityEnvelope,
  type AttestedPresignResponse,
} from '@photoverifier/sdk';

export type PresignResponse = AttestedPresignResponse;
export type { PresignErrorCode, PresignIntegrityPayload, PresignIntegrityEnvelope };
export { PresignError };

export async function requestPresignedPut(
  endpoint: string,
  params: {
    key: string;
    contentType: string;
    integrity: PresignIntegrityEnvelope;
  }
): Promise<PresignResponse> {
  return requestAttestedPresignedPut(endpoint, params);
}
