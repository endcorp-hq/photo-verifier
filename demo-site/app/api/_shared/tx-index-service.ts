import {
  inferExplorerCluster,
  loadRecordProofEntries,
  type RecordProofEntriesCacheEntry,
} from './load-record-proof-entries';
import { getRuntimeCacheMap } from './runtime-cache';

type TxIndexLoadParams = {
  rpcUrl: string;
  programId: string;
  limit: number;
  pageSize: number;
  cacheTtlMs: number;
  cacheKey: string;
  heliusApiKey?: string | null;
  heliusTxApiBase?: string | null;
};

export async function loadTxIndexEntries(
  params: TxIndexLoadParams
): Promise<Awaited<ReturnType<typeof loadRecordProofEntries>>> {
  const cacheStore = getRuntimeCacheMap<RecordProofEntriesCacheEntry>('record-proof-entries');
  return loadRecordProofEntries({
    rpcUrl: params.rpcUrl,
    programId: params.programId,
    explorerCluster: inferExplorerCluster(params.rpcUrl),
    limit: params.limit,
    pageSize: params.pageSize,
    cacheTtlMs: params.cacheTtlMs,
    cacheKey: params.cacheKey,
    cacheStore,
    heliusApiKey: params.heliusApiKey,
    heliusTxApiBase: params.heliusTxApiBase,
  });
}

export function readTxIndexBaseConfig(env: NodeJS.ProcessEnv = process.env): {
  rpcUrl: string;
  programId: string;
  heliusApiKey: string | null;
  heliusTxApiBase: string | null;
} {
  return {
    rpcUrl: env.RPC_URL || 'https://api.devnet.solana.com',
    programId: env.PROGRAM_ID || '3i6eNpCFvXhMg8LESAutXWKUtAey9mAbTziLLuUc78Hu',
    heliusApiKey: env.HELIUS_API_KEY || null,
    heliusTxApiBase: env.HELIUS_TX_API_BASE || null,
  };
}
