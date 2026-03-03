import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';
import type { ListObjectsV2CommandOutput } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { S3StorageRuntimeConfig } from '@photoverifier/core/dist/types.js';
import { getRuntimeCacheMap } from './runtime-cache';

type StorageConfig = S3StorageRuntimeConfig;

type StorageRuntimeOverrides = {
  config?: StorageConfig;
  client?: S3Client;
  fetchImpl?: typeof fetch;
};

export function getStorageConfig(env: NodeJS.ProcessEnv = process.env): StorageConfig {
  return {
    bucket: env.S3_BUCKET || 'photoverifier',
    region: env.S3_REGION || 'us-east-1',
    prefix: normalizePrefix(env.S3_PREFIX || 'photos/'),
    cdnDomain: env.S3_CDN_DOMAIN || null,
  };
}

export async function listPhotoKeys(params: {
  maxItems: number;
  prefix?: string;
}, overrides: StorageRuntimeOverrides = {}): Promise<string[]> {
  const runtime = resolveStorageRuntime(overrides);
  const { bucket, prefix: configuredPrefix } = runtime.config;

  const keys: string[] = [];
  const targetPrefix = params.prefix ?? configuredPrefix;
  let continuationToken: string | undefined = undefined;

  do {
    const output: ListObjectsV2CommandOutput = await runtime.client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: targetPrefix,
        ContinuationToken: continuationToken,
      })
    );

    for (const object of output.Contents ?? []) {
      if (object.Key && !object.Key.endsWith('/') && isPhotoKey(object.Key)) {
        keys.push(object.Key);
        if (keys.length >= params.maxItems) break;
      }
    }

    if (keys.length >= params.maxItems) break;
    continuationToken = output.IsTruncated ? output.NextContinuationToken : undefined;
  } while (continuationToken);

  return keys;
}

export async function getObjectViewUrl(
  key: string,
  cdnDomain?: string | null,
  overrides: StorageRuntimeOverrides = {}
): Promise<string> {
  const runtime = resolveStorageRuntime(overrides);
  const bucket = runtime.config.bucket;
  const targetCdnDomain = cdnDomain ?? runtime.config.cdnDomain;

  if (targetCdnDomain) {
    const path = key.startsWith('/') ? key : `/${key}`;
    return `https://${targetCdnDomain}${path}`;
  }
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  return getSignedUrl(runtime.client, command, { expiresIn: 60 });
}

export async function loadOptionalSidecarJson(
  photoKey: string,
  overrides: StorageRuntimeOverrides = {}
): Promise<{
  sidecar: unknown | null;
  proofUrl: string | null;
}> {
  const runtime = resolveStorageRuntime(overrides);
  const bucket = runtime.config.bucket;
  const sidecarKey = toSidecarKey(photoKey);
  if (!sidecarKey) {
    return { sidecar: null, proofUrl: null };
  }

  try {
    const sidecarSignedUrl = await getSignedUrl(
      runtime.client,
      new GetObjectCommand({ Bucket: bucket, Key: sidecarKey }),
      { expiresIn: 60 }
    );
    const response = await runtime.fetchImpl(sidecarSignedUrl);
    if (!response.ok) {
      return { sidecar: null, proofUrl: null };
    }
    const sidecar = await response.json().catch(() => null);
    return { sidecar, proofUrl: sidecarSignedUrl };
  } catch {
    return { sidecar: null, proofUrl: null };
  }
}

export async function deletePhotoObject(
  params: {
    key: string;
    deleteSidecar?: boolean;
  },
  overrides: StorageRuntimeOverrides = {}
): Promise<{ sidecarDeleted: boolean }> {
  const runtime = resolveStorageRuntime(overrides);
  const bucket = runtime.config.bucket;

  await runtime.client.send(new DeleteObjectCommand({ Bucket: bucket, Key: params.key }));

  let sidecarDeleted = false;
  const shouldDeleteSidecar = params.deleteSidecar !== false;
  if (shouldDeleteSidecar) {
    const sidecarKey = toSidecarKey(params.key);
    if (sidecarKey) {
      await runtime.client.send(new DeleteObjectCommand({ Bucket: bucket, Key: sidecarKey }));
      sidecarDeleted = true;
    }
  }

  return { sidecarDeleted };
}

function resolveStorageRuntime(overrides: StorageRuntimeOverrides): {
  client: S3Client;
  config: StorageConfig;
  fetchImpl: typeof fetch;
} {
  const config = overrides.config ?? getStorageConfig();
  return {
    config,
    client: overrides.client ?? getStorageClient(config.region),
    fetchImpl: overrides.fetchImpl ?? fetch,
  };
}

function getStorageClient(region: string): S3Client {
  const clientsByRegion = getRuntimeCacheMap<S3Client>('storage-s3-clients-by-region');
  const cached = clientsByRegion.get(region);
  if (cached) return cached;

  const created = new S3Client({ region });
  clientsByRegion.set(region, created);
  return created;
}

function toSidecarKey(photoKey: string): string | null {
  const sidecarKey = photoKey.replace(/\.[^.]+$/g, '.json');
  return sidecarKey !== photoKey ? sidecarKey : null;
}

function normalizePrefix(prefix: string): string {
  const trimmed = prefix.replace(/^\/+|\/+$/g, '');
  return trimmed ? `${trimmed}/` : '';
}

function isPhotoKey(key: string): boolean {
  return /\.(jpg|jpeg|png|webp)$/i.test(key);
}
