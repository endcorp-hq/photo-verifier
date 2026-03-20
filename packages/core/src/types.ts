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

export interface S3UploadRequest {
  key: string;
  contentType: string;
  bytes: Uint8Array;
}

export interface S3UploadResult {
  url: string;
  key: string;
}

export interface PresignedPutRequest {
  url: string;
  bytes: Uint8Array;
  contentType: string;
}

export interface S3UriParts {
  bucket: string;
  key: string;
}

export interface S3PhotoKeyParseParams {
  basePrefix?: string;
}

export interface S3Config {
  upload: (params: S3UploadRequest) => Promise<S3UploadResult>;
}

export interface S3StorageRuntimeConfig {
  bucket: string;
  region: string;
  prefix: string;
  cdnDomain: string | null;
}

export interface S3KeyParams {
  seekerMint: string;
  photoHashHex: string;
  extension?: string;
  basePrefix?: string;
}
