import { degraded, warningToDegraded, type ApiDegraded } from '../api-error';
import { readFreshCache, type TimedCache, writeTimedCache } from '../cache-policy';
import { type RecordProofEntry } from '../load-record-proof-entries';
import { matchPhotosWithProofs } from '../proof-matcher';
import { getRuntimeCacheMap } from '../runtime-cache';
import { loadS3PhotoCatalog } from '../s3-listing-service';
import { getStorageConfig } from '../storage-adapter';
import { loadTxIndexEntries, readTxIndexBaseConfig } from '../tx-index-service';

type ListResponseBody = {
  items: ReturnType<typeof matchPhotosWithProofs>['items'];
  proofs: RecordProofEntry[];
  summary: ReturnType<typeof matchPhotosWithProofs>['summary'];
  bucket: string;
  prefix: string;
  programId: string;
  txLookupWarning: string | null;
  degraded: ApiDegraded | null;
};

type ListRouteRuntimeConfig = {
  bucket: string;
  prefix: string;
  cdnDomain: string | null;
  txIndexBase: ReturnType<typeof readTxIndexBaseConfig>;
  includeProofSidecarByDefault: boolean;
  maxListItems: number;
  maxSignatures: number;
  txPageSize: number;
  listCacheTtlMs: number;
  txCacheTtlMs: number;
};

type ListRequestContext = {
  requestUrl: URL;
  env?: NodeJS.ProcessEnv;
};

type ProofLookupResult = {
  entries: RecordProofEntry[];
  degraded: ApiDegraded | null;
};

const LIST_ROUTE_CACHE_NAMESPACE = 'list-route-response';

export async function buildPhotoCatalogResponse({
  requestUrl,
  env = process.env,
}: ListRequestContext): Promise<ListResponseBody> {
  const config = readListRouteRuntimeConfig(env);
  const requestOptions = readListRequestOptions(requestUrl, config.includeProofSidecarByDefault);
  const listResponseCache = getRuntimeCacheMap<TimedCache<ListResponseBody>>(LIST_ROUTE_CACHE_NAMESPACE);

  if (!requestOptions.refresh && !requestOptions.includeProofSidecar) {
    const cached = readFreshCache(listResponseCache.get('default') ?? null, config.listCacheTtlMs);
    if (cached) return cached;
  }

  const txLookup = await resolveProofLookup(config);
  const photoCatalog = await loadS3PhotoCatalog({
    maxItems: config.maxListItems,
    prefix: config.prefix,
    includeProofSidecar: requestOptions.includeProofSidecar,
    cdnDomain: config.cdnDomain,
  });

  const matched = matchPhotosWithProofs({
    photos: photoCatalog,
    proofs: txLookup.entries,
  });

  const responseBody: ListResponseBody = {
    items: matched.items,
    proofs: txLookup.entries,
    summary: matched.summary,
    bucket: config.bucket,
    prefix: config.prefix,
    programId: config.txIndexBase.programId,
    txLookupWarning: txLookup.degraded
      ? `${txLookup.degraded.code}: ${txLookup.degraded.message}`
      : null,
    degraded: txLookup.degraded,
  };

  if (!requestOptions.includeProofSidecar) {
    listResponseCache.set('default', writeTimedCache(responseBody));
  }

  return responseBody;
}

function readListRequestOptions(
  requestUrl: URL,
  includeProofSidecarByDefault: boolean
): { includeProofSidecar: boolean; refresh: boolean } {
  return {
    includeProofSidecar:
      includeProofSidecarByDefault || requestUrl.searchParams.get('includeProofSidecar') === '1',
    refresh: requestUrl.searchParams.get('refresh') === '1',
  };
}

async function resolveProofLookup(config: ListRouteRuntimeConfig): Promise<ProofLookupResult> {
  try {
    const txLookup = await loadTxIndexEntries({
      rpcUrl: config.txIndexBase.rpcUrl,
      programId: config.txIndexBase.programId,
      limit: config.maxSignatures,
      pageSize: config.txPageSize,
      cacheTtlMs: config.txCacheTtlMs,
      cacheKey: 'list-route',
      heliusApiKey: config.txIndexBase.heliusApiKey,
      heliusTxApiBase: config.txIndexBase.heliusTxApiBase,
    });
    return {
      entries: txLookup.entries,
      degraded: warningToDegraded(txLookup.warning),
    };
  } catch (error: unknown) {
    const message = String((error as { message?: string })?.message ?? error ?? 'unknown error');
    console.warn('list: tx lookup degraded', message);
    return {
      entries: [],
      degraded: degraded({
        code: 'tx_lookup_unavailable',
        message,
      }),
    };
  }
}

function readListRouteRuntimeConfig(env: NodeJS.ProcessEnv = process.env): ListRouteRuntimeConfig {
  const storage = getStorageConfig(env);
  return {
    bucket: storage.bucket,
    prefix: storage.prefix,
    cdnDomain: storage.cdnDomain,
    txIndexBase: readTxIndexBaseConfig(env),
    includeProofSidecarByDefault: env.INCLUDE_PROOF_SIDECAR === 'true',
    maxListItems: toPositiveInt(env.MAX_LIST_ITEMS, 200),
    maxSignatures: toPositiveInt(env.MAX_SIGNATURES, 200),
    txPageSize: toPositiveInt(env.TX_PAGE_SIZE, 50),
    listCacheTtlMs: toPositiveInt(env.LIST_CACHE_TTL_MS, 15000),
    txCacheTtlMs: toPositiveInt(env.TX_CACHE_TTL_MS, 5000),
  };
}

function toPositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw ?? fallback);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}
