import type { S3Config, S3KeyParams } from './types';

/**
 * Thin abstraction: caller provides an uploader (pre-signed URL or SDK) via S3Config
 * Core storage functionality - free and open source
 */
export async function uploadBytes(
  cfg: S3Config,
  key: string,
  contentType: string,
  bytes: Uint8Array,
): Promise<{ url: string; key: string }> {
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
export function parseS3Uri(uri: string): { bucket: string; key: string } | null {
  const match = uri.match(/^s3:\/\/([^/]+)\/(.+)$/);
  if (!match) return null;
  return { bucket: match[1], key: match[2] };
}

/**
 * Perform a PUT upload to a presigned URL
 */
export async function putToPresignedUrl(params: {
  url: string;
  bytes: Uint8Array;
  contentType: string;
}): Promise<void> {
  const res = await fetch(params.url, {
    method: 'PUT',
    headers: { 'Content-Type': params.contentType },
    body: params.bytes as any,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`S3 upload failed (${res.status}): ${text}`);
  }
}
