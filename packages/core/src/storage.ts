import type {
  PresignedPutRequest,
  S3Config,
  S3KeyParams,
  S3PhotoKeyParseParams,
  S3UploadResult,
  S3UriParts,
} from './types.js';

/**
 * Thin abstraction: caller provides an uploader (pre-signed URL or SDK) via S3Config
 * Core storage functionality - free and open source
 */
export async function uploadBytes(
  cfg: S3Config,
  key: string,
  contentType: string,
  bytes: Uint8Array,
): Promise<S3UploadResult> {
  return cfg.upload({ key, contentType, bytes });
}

/**
 * Build a stable S3 key for a photo, organized by Seeker NFT mint address
 * Key format: {prefix}/{seekerMint}/{hashHex}.{extension}
 */
export function buildS3KeyForPhoto(params: S3KeyParams): string {
  const { seekerMint, photoHashHex } = params;
  const extension = params.extension ?? 'jpg';
  const basePrefix = (params.basePrefix ?? 'photos/').replace(/^\/+|\/+$|^\s+|\s+$/g, '');
  const prefix = basePrefix.length ? `${basePrefix}/` : '';
  return `${prefix}${seekerMint}/${photoHashHex}.${extension}`;
}

export type ParsedS3PhotoKey = {
  seekerMint: string;
  photoHashHex: string;
  extension: string | null;
};

/**
 * Parse a photo S3 key created by buildS3KeyForPhoto.
 */
export function parseS3PhotoKey(
  key: string,
  params: S3PhotoKeyParseParams = {}
): ParsedS3PhotoKey | null {
  const normalizedKey = key.replace(/^\/+/, '');
  const basePrefix = (params.basePrefix ?? 'photos/').replace(/^\/+|\/+$|^\s+|\s+$/g, '');
  const prefix = basePrefix.length ? `${basePrefix}/` : '';
  if (prefix && !normalizedKey.startsWith(prefix)) return null;

  const withoutPrefix = prefix ? normalizedKey.slice(prefix.length) : normalizedKey;
  const firstSlash = withoutPrefix.indexOf('/');
  if (firstSlash <= 0) return null;

  const seekerMint = withoutPrefix.slice(0, firstSlash).trim();
  const filename = withoutPrefix.slice(firstSlash + 1).trim();
  if (!seekerMint || !filename) return null;

  const extIndex = filename.lastIndexOf('.');
  const photoHashHex = (extIndex >= 0 ? filename.slice(0, extIndex) : filename).trim();
  const extension = extIndex >= 0 ? filename.slice(extIndex + 1).trim() : null;
  if (!photoHashHex) return null;

  return {
    seekerMint,
    photoHashHex: photoHashHex.toLowerCase(),
    extension: extension && extension.length ? extension.toLowerCase() : null,
  };
}

/**
 * Construct an s3:// URI from bucket and key
 */
export function buildS3Uri(bucket: string, key: string): string {
  const normalizedKey = key.replace(/^\/+/, '');
  return `s3://${bucket}/${normalizedKey}`;
}

/**
 * Parse S3 URI to get bucket and key
 */
export function parseS3Uri(uri: string): S3UriParts | null {
  const match = uri.match(/^s3:\/\/([^/]+)\/(.+)$/);
  if (!match) return null;
  return { bucket: match[1], key: match[2] };
}

/**
 * Perform a PUT upload to a presigned URL
 */
export async function putToPresignedUrl(params: PresignedPutRequest): Promise<void> {
  const res = await fetch(params.url, {
    method: 'PUT',
    headers: { 'Content-Type': params.contentType },
    body: params.bytes as BodyInit,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`S3 upload failed (${res.status}): ${text}`);
  }
}
