/**
 * Canonical storage logic lives in @photoverifier/core.
 * Keep this compatibility adapter for non-Expo runtime parity tests.
 */
export {
  uploadBytes,
  buildS3KeyForPhoto,
  parseS3PhotoKey,
  buildS3Uri,
  parseS3Uri,
  putToPresignedUrl,
} from '@photoverifier/core/dist/storage.js';

export type {
  S3Config,
  S3KeyParams,
  S3UploadRequest,
  S3UploadResult,
  PresignedPutRequest,
  S3UriParts,
  S3PhotoKeyParseParams,
} from '@photoverifier/core/dist/types.js';
