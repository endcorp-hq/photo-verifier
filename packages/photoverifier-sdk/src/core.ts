/**
 * Core-only SDK entrypoint.
 * Avoids mobile camera/location and blockchain runtime dependencies.
 */
export {
  blake3HexFromBase64,
  blake3HexFromBytes,
  blake3Hash,
} from '@photoverifier/core/dist/hash.js';

export {
  uploadBytes,
  buildS3KeyForPhoto,
  parseS3PhotoKey,
  buildS3Uri,
  parseS3Uri,
  putToPresignedUrl,
  type ParsedS3PhotoKey,
} from '@photoverifier/core/dist/storage.js';

export type {
  Blake3HashResult,
  S3Config,
  S3KeyParams,
  S3UploadRequest,
  S3UploadResult,
  PresignedPutRequest,
  S3UriParts,
  S3PhotoKeyParseParams,
  S3StorageRuntimeConfig,
} from '@photoverifier/core/dist/types.js';

export * from '@photoverifier/core/dist/network/cluster-policy.js';
export * from '@photoverifier/core/dist/contracts/chain-contracts.js';
export * from '@photoverifier/core/dist/contracts/api-contracts.js';
