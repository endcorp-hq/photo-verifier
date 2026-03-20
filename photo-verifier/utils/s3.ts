import {
  requestAttestedPresignedPut,
  PresignError,
  type PresignIntegrityEnvelope,
  type AttestedPresignResponse,
} from '@endcorp/photoverifier-sdk';

type PresignResponse = AttestedPresignResponse;
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
