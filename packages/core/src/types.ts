/**
 * Core type definitions for Citizen Science SDK
 */

export interface Blake3HashResult {
  hash32: Uint8Array;
  hashHex: string;
}

export interface GeoLocation {
  latitude: number;
  longitude: number;
  accuracy?: number;
}

export interface PhotoMetadata {
  hashHex: string;
  timestamp: string;
  location: GeoLocation | null;
  seekerMint?: string;
  owner: string;
}

export interface CaptureResult {
  tempUri: string;
  assetUri: string;
}

export interface S3Config {
  upload: (params: { key: string; contentType: string; bytes: Uint8Array }) => Promise<{ url: string; key: string }>;
}

export interface S3KeyParams {
  seekerMint: string;
  photoHashHex: string;
  extension?: string;
  basePrefix?: string;
}
