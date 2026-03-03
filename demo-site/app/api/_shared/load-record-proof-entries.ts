import { Connection, PublicKey } from '@solana/web3.js';
import {
  type ExplorerCluster,
  inferHeliusTxApiBase,
} from '@photoverifier/core/dist/network/cluster-policy.js';
import { decodeIxData, decodeRecordProof } from './record-proof';
export { inferExplorerCluster } from '@photoverifier/core/dist/network/cluster-policy.js';

export type RecordProofEntry = {
  hashHex: string;
  h3Cell: string;
  payer: string;
  signature: string;
  url: string;
  timestamp: string | null;
  nonce: string;
};

type HeliusAddressInstruction = {
  programId?: string;
  data?: string;
  accounts?: string[];
};

type HeliusAddressTransaction = {
  signature?: string;
  timestamp?: number;
  instructions?: HeliusAddressInstruction[];
};

type TransactionAccountKey = {
  toBase58: () => string;
};

type TransactionInstructionDto = {
  programIdIndex: number;
  accounts: number[];
  data: string | Uint8Array;
};

type TransactionMessageDto = {
  accountKeys: TransactionAccountKey[];
  instructions: TransactionInstructionDto[];
};

export type RecordProofEntriesCacheEntry = {
  ts: number;
  out: RecordProofEntry[];
};

type LoadRecordProofEntriesOptions = {
  rpcUrl: string;
  programId: string;
  explorerCluster: ExplorerCluster;
  limit: number;
  pageSize?: number;
  cacheTtlMs?: number;
  cacheKey?: string;
  cacheStore?: Map<string, RecordProofEntriesCacheEntry>;
  heliusApiKey?: string | null;
  heliusTxApiBase?: string | null;
};

export async function loadRecordProofEntries(
  options: LoadRecordProofEntriesOptions
): Promise<{ entries: RecordProofEntry[]; warning: string | null }> {
  const limit = Math.max(1, Math.floor(options.limit));
  const pageSize = Math.min(100, Math.max(1, Math.floor(options.pageSize ?? 50)));
  const cacheTtlMs = Math.max(0, Math.floor(options.cacheTtlMs ?? 0));
  const cacheStore = options.cacheStore;
  const cacheKey =
    options.cacheKey ??
    `${options.programId}|${options.rpcUrl}|${options.explorerCluster}|${limit}|${pageSize}`;
  const cached = cacheStore?.get(cacheKey) ?? null;

  if (cacheTtlMs > 0 && cached && Date.now() - cached.ts < cacheTtlMs) {
    return { entries: cached.out, warning: null };
  }

  const heliusApiKey = options.heliusApiKey ?? extractApiKeyFromUrl(options.rpcUrl);
  const heliusBase =
    options.heliusTxApiBase ??
    inferHeliusTxApiBase(options.rpcUrl, options.explorerCluster);

  let warning: string | null = null;
  try {
    let entries: RecordProofEntry[];
    if (heliusApiKey && heliusBase) {
      try {
        const helius = await loadRecordProofEntriesViaHelius({
          apiKey: heliusApiKey,
          baseUrl: heliusBase,
          programId: options.programId,
          cluster: options.explorerCluster,
          limit,
          pageSize,
        });
        entries = helius.entries;
        warning = helius.warning;
      } catch (error) {
        warning = `tx_lookup_helius_failed: ${toErrorMessage(error)}`;
        entries = await loadRecordProofEntriesViaRpc({
          rpcUrl: options.rpcUrl,
          programId: options.programId,
          cluster: options.explorerCluster,
          limit,
          pageSize,
        });
      }
    } else {
      entries = await loadRecordProofEntriesViaRpc({
        rpcUrl: options.rpcUrl,
        programId: options.programId,
        cluster: options.explorerCluster,
        limit,
        pageSize,
      });
    }

    cacheStore?.set(cacheKey, { ts: Date.now(), out: entries });
    return { entries, warning };
  } catch (error) {
    if (cached) {
      return {
        entries: cached.out,
        warning: `tx_lookup_unavailable: ${toErrorMessage(error)}; using stale cache`,
      };
    }
    throw error;
  }
}

type HeliusLookupOptions = {
  apiKey: string;
  baseUrl: string;
  programId: string;
  cluster: ExplorerCluster;
  limit: number;
  pageSize: number;
};

async function loadRecordProofEntriesViaHelius(
  options: HeliusLookupOptions
): Promise<{ entries: RecordProofEntry[]; warning: string | null }> {
  const out: RecordProofEntry[] = [];
  let before: string | undefined = undefined;
  let warning: string | null = null;

  while (out.length < options.limit) {
    const requestLimit = Math.min(options.pageSize, options.limit - out.length, 100);
    const query = new URLSearchParams({
      'api-key': options.apiKey,
      limit: String(requestLimit),
    });
    if (before) query.set('before', before);
    const endpoint = `${options.baseUrl}/v0/addresses/${options.programId}/transactions?${query.toString()}`;

    const res = await fetch(endpoint, { cache: 'no-store' });
    if (res.status === 429) {
      const message = await res.text();
      if (out.length > 0) {
        warning = `tx_lookup_limited: ${message}`;
        break;
      }
      throw new Error(`429 Too Many Requests: ${message}`);
    }
    if (!res.ok) {
      throw new Error(`Helius tx API ${res.status}: ${await res.text()}`);
    }

    const page = (await res.json()) as HeliusAddressTransaction[];
    if (!Array.isArray(page) || page.length === 0) {
      break;
    }

    for (const tx of page) {
      const signature = tx.signature ?? '';
      if (!signature) continue;
      const timestamp =
        Number.isFinite(Number(tx.timestamp)) && Number(tx.timestamp) > 0
          ? new Date(Number(tx.timestamp) * 1000).toISOString()
          : null;

      for (const instruction of tx.instructions ?? []) {
        if (instruction.programId !== options.programId) continue;

        const decoded = decodeRecordProof(decodeIxData(instruction.data));
        if (!decoded) continue;

        out.push({
          hashHex: decoded.hashHex,
          h3Cell: decoded.h3Cell,
          nonce: decoded.nonce,
          timestamp,
          payer: instruction.accounts?.[3] ?? '',
          signature,
          url: buildExplorerTxUrl(signature, options.cluster),
        });

        if (out.length >= options.limit) break;
      }

      if (out.length >= options.limit) break;
    }

    const lastSignature = page[page.length - 1]?.signature;
    if (!lastSignature) break;
    before = lastSignature;
  }

  return { entries: out, warning };
}

type RpcLookupOptions = {
  rpcUrl: string;
  programId: string;
  cluster: ExplorerCluster;
  limit: number;
  pageSize: number;
};

async function loadRecordProofEntriesViaRpc(options: RpcLookupOptions): Promise<RecordProofEntry[]> {
  const programId = new PublicKey(options.programId);
  const connection = new Connection(options.rpcUrl, 'confirmed');
  const out: RecordProofEntry[] = [];
  let before: string | undefined = undefined;

  while (out.length < options.limit) {
    const requestLimit = Math.min(options.pageSize, options.limit - out.length);
    let signatures: Awaited<ReturnType<Connection['getSignaturesForAddress']>>;
    try {
      signatures = await connection.getSignaturesForAddress(programId, {
        limit: requestLimit,
        before,
      });
    } catch (error) {
      if (out.length > 0) break;
      throw error;
    }

    if (!Array.isArray(signatures) || signatures.length === 0) break;
    before = signatures[signatures.length - 1]?.signature;

    let transactions: Awaited<ReturnType<Connection['getTransactions']>>;
    try {
      transactions = await connection.getTransactions(
        signatures.map((signatureInfo) => signatureInfo.signature),
        { maxSupportedTransactionVersion: 0 }
      );
    } catch (error) {
      if (out.length > 0) break;
      throw error;
    }
    if (!transactions) break;

    for (let index = 0; index < transactions.length; index++) {
      const transaction = transactions[index];
      const signature = signatures[index]?.signature;
      if (!transaction || !transaction.transaction || !signature) continue;

      const message = parseTransactionMessage(transaction.transaction.message);
      if (!message) continue;

      const ix = message.instructions.find((instruction) => {
        const programKey = message.accountKeys[instruction.programIdIndex];
        return (
          programKey &&
          typeof programKey.toBase58 === 'function' &&
          programKey.toBase58() === programId.toBase58()
        );
      });
      if (!ix) continue;

      const rawData = typeof ix.data === 'string' ? decodeIxData(ix.data) : Buffer.from(ix.data);
      const decoded = decodeRecordProof(rawData);
      if (!decoded) continue;

      const payerIdx = ix.accounts[3] ?? ix.accounts[2] ?? 0;
      const payer = message.accountKeys[payerIdx]?.toBase58?.() ?? '';
      const timestamp = decoded.timestampSec
        ? new Date(decoded.timestampSec * 1000).toISOString()
        : null;

      out.push({
        hashHex: decoded.hashHex,
        h3Cell: decoded.h3Cell,
        nonce: decoded.nonce,
        timestamp,
        payer,
        signature,
        url: buildExplorerTxUrl(signature, options.cluster),
      });

      if (out.length >= options.limit) break;
    }
  }

  return out;
}

function buildExplorerTxUrl(signature: string, cluster: ExplorerCluster): string {
  return `https://solscan.io/tx/${signature}${cluster === 'mainnet-beta' ? '' : `?cluster=${cluster}`}`;
}

function toErrorMessage(error: unknown): string {
  return String((error as { message?: string })?.message ?? error ?? 'unknown error');
}

function extractApiKeyFromUrl(url: string): string | null {
  try {
    return new URL(url).searchParams.get('api-key');
  } catch {
    return null;
  }
}

function parseTransactionMessage(input: unknown): TransactionMessageDto | null {
  if (!isRecord(input)) return null;

  const accountKeysRaw = Array.isArray(input.staticAccountKeys)
    ? input.staticAccountKeys
    : Array.isArray(input.accountKeys)
      ? input.accountKeys
      : null;
  if (!accountKeysRaw) return null;
  const accountKeys: TransactionAccountKey[] = [];
  for (const key of accountKeysRaw) {
    if (!isRecord(key) || typeof key.toBase58 !== 'function') return null;
    accountKeys.push({ toBase58: key.toBase58.bind(key) });
  }

  const instructionsRaw = Array.isArray(input.compiledInstructions)
    ? input.compiledInstructions
    : Array.isArray(input.instructions)
      ? input.instructions
      : null;
  if (!instructionsRaw) return null;
  const instructions: TransactionInstructionDto[] = [];
  for (const instruction of instructionsRaw) {
    const parsedInstruction = parseTransactionInstruction(instruction);
    if (!parsedInstruction) return null;
    instructions.push(parsedInstruction);
  }

  return { accountKeys, instructions };
}

function parseTransactionInstruction(input: unknown): TransactionInstructionDto | null {
  if (!isRecord(input)) return null;
  if (!Number.isInteger(input.programIdIndex) || Number(input.programIdIndex) < 0) return null;

  const data = parseInstructionData(input.data);
  if (!data) return null;

  const accounts = parseInstructionAccounts(input.accounts);
  if (!accounts) return null;

  return {
    programIdIndex: Number(input.programIdIndex),
    accounts,
    data,
  };
}

function parseInstructionData(input: unknown): string | Uint8Array | null {
  if (typeof input === 'string') return input;
  if (input instanceof Uint8Array) return input;
  if (Array.isArray(input) && input.every((value) => Number.isInteger(value) && value >= 0 && value <= 255)) {
    return Uint8Array.from(input);
  }
  return null;
}

function parseInstructionAccounts(input: unknown): number[] | null {
  if (input === undefined) return [];
  if (!Array.isArray(input)) return null;
  const accounts: number[] = [];
  for (const accountIndex of input) {
    if (!Number.isInteger(accountIndex) || Number(accountIndex) < 0) return null;
    accounts.push(Number(accountIndex));
  }
  return accounts;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
