import { NextResponse } from 'next/server';
import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import type { ListObjectsV2CommandOutput } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Connection, PublicKey } from '@solana/web3.js';
import { utils as anchorUtils } from '@coral-xyz/anchor';
import { createHash } from 'crypto';

const BUCKET = process.env.S3_BUCKET || 'photoverifier';
const REGION = process.env.S3_REGION || 'us-east-1';
const PREFIX = normalizePrefix(process.env.S3_PREFIX || 'photos/');
const CDN = process.env.S3_CDN_DOMAIN || null;
const RPC_URL = process.env.RPC_URL || 'https://api.devnet.solana.com';
const PROGRAM_ID = process.env.PROGRAM_ID || '3i6eNpCFvXhMg8LESAutXWKUtAey9mAbTziLLuUc78Hu';

const INCLUDE_PROOF_SIDECAR = process.env.INCLUDE_PROOF_SIDECAR === 'true';
const MAX_LIST_ITEMS = Number(process.env.MAX_LIST_ITEMS || 200);
const MAX_SIGNATURES = Number(process.env.MAX_SIGNATURES || 200);
const TX_PAGE_SIZE = Number(process.env.TX_PAGE_SIZE || 50);
const LIST_CACHE_TTL_MS = Number(process.env.LIST_CACHE_TTL_MS || 15000);
const TX_CACHE_TTL_MS = Number(process.env.TX_CACHE_TTL_MS || 5000);

const EXPLORER_CLUSTER = inferExplorerCluster(RPC_URL);
const HELIUS_API_KEY = process.env.HELIUS_API_KEY || extractApiKeyFromUrl(RPC_URL);
const HELIUS_TX_API_BASE =
  process.env.HELIUS_TX_API_BASE || inferHeliusTxApiBase(RPC_URL, EXPLORER_CLUSTER);
const RECORD_PROOF_DISC = createHash('sha256')
  .update('global:record_photo_proof')
  .digest()
  .subarray(0, 8);
const RECORD_PROOF_MIN_LEN = 8 + 32 + 8 + 8 + 8;

type TxEntry = {
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

const s3 = new S3Client({ region: REGION });

let __txEntriesCache: { ts: number; out: TxEntry[] } | null = null;
let __listResponseCache: { ts: number; out: any } | null = null;

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export async function GET(request: Request) {
  try {
    const requestUrl = new URL(request.url);
    const includeProofSidecar =
      INCLUDE_PROOF_SIDECAR || requestUrl.searchParams.get('includeProofSidecar') === '1';
    const bypassCache = requestUrl.searchParams.get('refresh') === '1';

    if (
      !bypassCache &&
      !includeProofSidecar &&
      __listResponseCache &&
      Date.now() - __listResponseCache.ts < LIST_CACHE_TTL_MS
    ) {
      return NextResponse.json(__listResponseCache.out);
    }

    let txEntries: TxEntry[] = [];
    let txLookupWarning: string | null = null;
    try {
      txEntries = await loadTxEntries();
    } catch (e: any) {
      txLookupWarning = `tx_lookup_unavailable: ${String(e?.message || e || 'unknown error')}`;
      txEntries = __txEntriesCache?.out ?? [];
      console.warn('list: tx lookup degraded', txLookupWarning);
    }
    const txByHash = new Map<string, TxEntry[]>();
    for (const tx of txEntries) {
      const key = tx.hashHex.toLowerCase();
      if (!txByHash.has(key)) txByHash.set(key, []);
      txByHash.get(key)!.push(tx);
    }

    const listed: string[] = [];
    let token: string | undefined = undefined;
    do {
      const out: ListObjectsV2CommandOutput = await s3.send(
        new ListObjectsV2Command({ Bucket: BUCKET, Prefix: PREFIX, ContinuationToken: token })
      );
      for (const obj of out.Contents ?? []) {
        if (obj.Key && !obj.Key.endsWith('/') && isPhotoKey(obj.Key)) {
          listed.push(obj.Key);
          if (listed.length >= MAX_LIST_ITEMS) break;
        }
      }
      if (listed.length >= MAX_LIST_ITEMS) break;
      token = out.IsTruncated ? out.NextContinuationToken : undefined;
    } while (token);

    const items = await Promise.all(
      listed.map(async (key) => {
        const { seekerMint, hashHex } = parsePhotoKey(key, PREFIX);
        const url = await buildPublicUrlOrPresigned(BUCKET, key, CDN);

        let sidecar: any = null;
        let proofUrl: string | null = null;
        if (includeProofSidecar) {
          const sidecarKey = key.replace(/\.[^.]+$/g, '.json');
          try {
            const sidecarSignedUrl = await getSignedUrl(
              s3,
              new GetObjectCommand({ Bucket: BUCKET, Key: sidecarKey }),
              { expiresIn: 60 }
            );
            const res = await fetch(sidecarSignedUrl);
            if (res.ok) {
              sidecar = await res.json().catch(() => null);
              proofUrl = sidecarSignedUrl;
            }
          } catch {
            // Sidecar is optional; continue without it.
          }
        }

        const payloadWallet = sidecar?.payload?.wallet ?? sidecar?.payload?.owner ?? null;
        const candidates = txByHash.get(hashHex.toLowerCase()) ?? [];
        const match = pickBestEntry(candidates, payloadWallet);

        return {
          key,
          url,
          seekerMint,
          hashHex,
          timestamp:
            match?.timestamp ??
            (Number.isFinite(Number(sidecar?.payload?.timestampSec))
              ? new Date(Number(sidecar.payload.timestampSec) * 1000).toISOString()
              : sidecar?.payload?.timestamp ?? null),
          h3Cell: match?.h3Cell ?? sidecar?.payload?.h3Cell ?? null,
          owner: match?.payer ?? payloadWallet,
          signature: match?.signature ?? null,
          nonce: match?.nonce ?? sidecar?.payload?.nonce ?? null,
          tx: match?.url ?? null,
          onChainVerified: Boolean(match),
          proofUrl,
        };
      })
    );

    const imageHashes = new Set(items.map((item) => String(item.hashHex || '').toLowerCase()));
    const matchedImages = items.filter((item) => item.onChainVerified).length;
    const txWithImage = txEntries.filter((tx) => imageHashes.has(tx.hashHex.toLowerCase())).length;

    const responseBody = {
      items,
      proofs: txEntries,
      summary: {
        totalImages: items.length,
        onChainMatchedImages: matchedImages,
        unmatchedImages: items.length - matchedImages,
        totalProofAccounts: txEntries.length,
        proofAccountsWithImage: txWithImage,
        orphanedProofAccounts: txEntries.length - txWithImage,
      },
      bucket: BUCKET,
      prefix: PREFIX,
      programId: PROGRAM_ID,
      txLookupWarning,
    };

    if (!includeProofSidecar) {
      __listResponseCache = { ts: Date.now(), out: responseBody };
    }

    return NextResponse.json(responseBody);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unknown error' }, { status: 500 });
  }
}

async function loadTxEntries(): Promise<TxEntry[]> {
  if (__txEntriesCache && Date.now() - __txEntriesCache.ts < TX_CACHE_TTL_MS) {
    return __txEntriesCache.out;
  }

  let out: TxEntry[] = [];
  if (HELIUS_API_KEY && HELIUS_TX_API_BASE) {
    try {
      out = await loadTxEntriesViaHelius();
    } catch (e: any) {
      console.warn('list: helius tx index failed; falling back to RPC scan', e?.message || e);
      out = await loadTxEntriesViaRpc();
    }
  } else {
    out = await loadTxEntriesViaRpc();
  }

  __txEntriesCache = { ts: Date.now(), out };
  return out;
}

async function loadTxEntriesViaHelius(): Promise<TxEntry[]> {
  if (!HELIUS_API_KEY || !HELIUS_TX_API_BASE) {
    throw new Error('Helius API key/base unavailable');
  }

  const out: TxEntry[] = [];
  let before: string | undefined = undefined;

  while (out.length < MAX_SIGNATURES) {
    const limit = Math.min(TX_PAGE_SIZE, MAX_SIGNATURES - out.length, 100);
    const query = new URLSearchParams({
      'api-key': HELIUS_API_KEY,
      limit: String(limit),
    });
    if (before) query.set('before', before);
    const endpoint = `${HELIUS_TX_API_BASE}/v0/addresses/${PROGRAM_ID}/transactions?${query.toString()}`;

    const res = await fetch(endpoint, { cache: 'no-store' });
    if (res.status === 429) {
      if (out.length > 0) break;
      throw new Error(`429 Too Many Requests: ${await res.text()}`);
    }
    if (!res.ok) {
      throw new Error(`Helius tx API ${res.status}: ${await res.text()}`);
    }

    const page = (await res.json()) as HeliusAddressTransaction[];
    if (!Array.isArray(page) || !page.length) break;

    for (const tx of page) {
      const signature = tx.signature || '';
      if (!signature) continue;
      const timestamp =
        Number.isFinite(Number(tx.timestamp)) && Number(tx.timestamp) > 0
          ? new Date(Number(tx.timestamp) * 1000).toISOString()
          : null;
      for (const ix of tx.instructions ?? []) {
        if (ix.programId !== PROGRAM_ID) continue;
        const raw = decodeIxData(ix.data);
        const decoded = decodeRecordProof(raw);
        if (!decoded) continue;
        const payer = ix.accounts?.[3] ?? '';
        const url = `https://solscan.io/tx/${signature}${
          EXPLORER_CLUSTER === 'mainnet-beta' ? '' : `?cluster=${EXPLORER_CLUSTER}`
        }`;
        out.push({
          hashHex: decoded.hashHex,
          h3Cell: decoded.h3Cell,
          nonce: decoded.nonce,
          timestamp,
          payer,
          signature,
          url,
        });
      }
    }

    const lastSig = page[page.length - 1]?.signature;
    if (!lastSig) break;
    before = lastSig;
  }

  return out;
}

async function loadTxEntriesViaRpc(): Promise<TxEntry[]> {
  const programId = new PublicKey(PROGRAM_ID);
  const connection = new Connection(RPC_URL, 'confirmed');
  const out: TxEntry[] = [];

  let before: string | undefined = undefined;
  while (out.length < MAX_SIGNATURES) {
    const need = Math.min(TX_PAGE_SIZE, MAX_SIGNATURES - out.length);
    let sigInfos: Awaited<ReturnType<Connection['getSignaturesForAddress']>> | null = null;
    try {
      sigInfos = await connection.getSignaturesForAddress(programId, { limit: need, before });
    } catch (e) {
      if (out.length > 0) break;
      throw e;
    }
    if (!sigInfos) break;
    if (!sigInfos.length) break;
    before = sigInfos[sigInfos.length - 1]?.signature;

    let txs: Awaited<ReturnType<Connection['getTransactions']>> | null = null;
    try {
      txs = await connection.getTransactions(
        sigInfos.map((s) => s.signature),
        { maxSupportedTransactionVersion: 0 }
      );
    } catch (e) {
      if (out.length > 0) break;
      throw e;
    }
    if (!txs) break;

    for (let i = 0; i < txs.length; i++) {
      const tx = txs[i];
      const signature = sigInfos[i]?.signature;
      if (!tx || !tx.transaction || !signature) continue;

      const message: any = tx.transaction.message as any;
      const keys = message.staticAccountKeys || message.accountKeys || [];
      const instrs = message.compiledInstructions || message.instructions || [];
      const ix = instrs.find((ci: any) => {
        const progKey = keys[ci.programIdIndex];
        return progKey && progKey.toBase58 && progKey.toBase58() === programId.toBase58();
      });
      if (!ix) continue;

      const dataB64: string =
        typeof ix.data === 'string' ? ix.data : Buffer.from(ix.data).toString('base64');
      const raw = Buffer.from(dataB64, 'base64');
      const decoded = decodeRecordProof(raw);
      if (!decoded) continue;
      const timestamp = decoded.timestampSec
        ? new Date(decoded.timestampSec * 1000).toISOString()
        : null;
      const payerIdx = (ix.accounts?.[3] ?? ix.accounts?.[2] ?? 0) as number;
      const payer = keys[payerIdx]?.toBase58?.() || '';
      const url = `https://solscan.io/tx/${signature}${
        EXPLORER_CLUSTER === 'mainnet-beta' ? '' : `?cluster=${EXPLORER_CLUSTER}`
      }`;
      out.push({
        hashHex: decoded.hashHex,
        h3Cell: decoded.h3Cell,
        nonce: decoded.nonce,
        payer,
        signature,
        url,
        timestamp,
      });
    }
  }

  return out;
}

function decodeIxData(data: string | undefined): Buffer | null {
  if (!data) return null;
  try {
    return Buffer.from(anchorUtils.bytes.bs58.decode(data));
  } catch {
    // Ignore bs58 decode failures; fallback to base64 decode below.
  }
  try {
    const raw = Buffer.from(data, 'base64');
    if (raw.length > 0) return raw;
  } catch {
    // Ignore invalid base64 payloads and treat as undecodable.
  }
  return null;
}

function decodeRecordProof(
  raw: Buffer | null
): { hashHex: string; nonce: string; h3Cell: string; timestampSec: number } | null {
  if (!raw || raw.length < RECORD_PROOF_MIN_LEN) return null;
  if (!raw.subarray(0, 8).equals(RECORD_PROOF_DISC)) return null;

  let o = 8;
  const hash = raw.subarray(o, o + 32);
  o += 32;
  const nonce = raw.readBigUInt64LE(o).toString();
  o += 8;
  const timestampSec = Number(raw.readBigInt64LE(o));
  o += 8;
  const h3Cell = raw.readBigUInt64LE(o).toString(16);

  return {
    hashHex: Buffer.from(hash).toString('hex'),
    nonce,
    h3Cell,
    timestampSec: Number.isFinite(timestampSec) ? timestampSec : 0,
  };
}

function pickBestEntry(candidates: TxEntry[], preferredOwner: string | null): TxEntry | null {
  if (!candidates.length) return null;
  if (!preferredOwner) return candidates[0];
  return candidates.find((entry) => entry.payer === preferredOwner) ?? candidates[0];
}

function normalizePrefix(p: string): string {
  const trimmed = p.replace(/^\/+|\/+$/g, '');
  return trimmed ? trimmed + '/' : '';
}

function isPhotoKey(key: string): boolean {
  return /\.(jpg|jpeg|png|webp)$/i.test(key);
}

function parsePhotoKey(key: string, basePrefix: string): { seekerMint: string; hashHex: string } {
  const rest = key.replace(new RegExp('^' + escapeRegExp(basePrefix)), '');
  const parts = rest.split('/');
  const seekerMint = parts[0] || 'unknown';
  const file = parts.slice(1).join('/') || '';
  const hashHex = file.split('.')[0] || 'unknown';
  return { seekerMint, hashHex };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function buildPublicUrlOrPresigned(
  bucket: string,
  key: string,
  cdnDomain: string | null
): Promise<string> {
  if (cdnDomain) {
    const path = key.startsWith('/') ? key : '/' + key;
    return `https://${cdnDomain}${path}`;
  }
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  return getSignedUrl(s3, command, { expiresIn: 60 });
}

function inferExplorerCluster(rpcUrl: string): 'mainnet-beta' | 'devnet' | 'testnet' {
  const lower = rpcUrl.toLowerCase();
  if (lower.includes('testnet')) return 'testnet';
  if (lower.includes('mainnet')) return 'mainnet-beta';
  return 'devnet';
}

function extractApiKeyFromUrl(url: string): string | null {
  try {
    return new URL(url).searchParams.get('api-key');
  } catch {
    return null;
  }
}

function inferHeliusTxApiBase(
  rpcUrl: string,
  cluster: 'mainnet-beta' | 'devnet' | 'testnet'
): string | null {
  const lower = rpcUrl.toLowerCase();
  const looksLikeHelius = lower.includes('helius');
  if (!looksLikeHelius && !process.env.HELIUS_API_KEY) return null;
  if (cluster === 'devnet') return 'https://api-devnet.helius.xyz';
  return 'https://api.helius.xyz';
}
