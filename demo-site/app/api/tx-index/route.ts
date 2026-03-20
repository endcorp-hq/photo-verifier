import { NextResponse } from 'next/server';
import { degraded, warningToDegraded } from '../_shared/api-error';
import { loadTxIndexEntries, readTxIndexBaseConfig } from '../_shared/tx-index-service';
import { withApiPolicy } from '../_shared/with-api-policy';

// Returns decoded record_photo_proof entries.
export const GET = withApiPolicy({ scopes: ['proofs:read'] }, async () => {
  try {
    const config = readTxIndexRuntimeConfig();
    const txLookup = await loadTxIndexEntries({
      rpcUrl: config.base.rpcUrl,
      programId: config.base.programId,
      limit: config.limit,
      pageSize: Math.min(config.limit, 100),
      cacheTtlMs: config.cacheTtlMs,
      cacheKey: 'tx-index-route',
      heliusApiKey: config.base.heliusApiKey,
      heliusTxApiBase: config.base.heliusTxApiBase,
    });

    return NextResponse.json({
      entries: txLookup.entries.map((entry) => ({
        ...entry,
        timestamp: entry.timestamp ?? undefined,
      })),
      warning: txLookup.warning,
      degraded: warningToDegraded(txLookup.warning),
    });
  } catch (error: unknown) {
    const message = String((error as { message?: string })?.message ?? error ?? 'unknown error');
    return NextResponse.json({
      entries: [],
      warning: `tx_lookup_unavailable: ${message}`,
      degraded: degraded({
        code: 'tx_lookup_unavailable',
        message,
      }),
    });
  }
});

function readTxIndexRuntimeConfig(env: NodeJS.ProcessEnv = process.env): {
  base: ReturnType<typeof readTxIndexBaseConfig>;
  limit: number;
  cacheTtlMs: number;
} {
  return {
    base: readTxIndexBaseConfig(env),
    limit: toPositiveInt(env.LIMIT, 100),
    cacheTtlMs: toPositiveInt(env.TX_INDEX_CACHE_TTL_MS, 5000),
  };
}

function toPositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw ?? fallback);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}
