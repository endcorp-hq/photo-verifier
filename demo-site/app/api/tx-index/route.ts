import { NextResponse } from 'next/server';
import { Connection, PublicKey } from '@solana/web3.js';
import { utils as anchorUtils } from '@coral-xyz/anchor';
import crypto from 'crypto';

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

const RECORD_PROOF_DISC = crypto
  .createHash('sha256')
  .update('global:record_photo_proof')
  .digest()
  .subarray(0, 8);
const RECORD_PROOF_MIN_LEN = 8 + 32 + 8 + 8 + 8;

// Returns decoded record_photo_proof entries.
export async function GET() {
  try {
    const rpcUrl = process.env.RPC_URL || 'https://api.devnet.solana.com';
    const programIdStr =
      process.env.PROGRAM_ID || '3i6eNpCFvXhMg8LESAutXWKUtAey9mAbTziLLuUc78Hu';
    const limit = Number(process.env.LIMIT || 100);
    const cluster = inferCluster(rpcUrl);

    const heliusApiKey = process.env.HELIUS_API_KEY || extractApiKeyFromUrl(rpcUrl);
    const heliusBase = process.env.HELIUS_TX_API_BASE || inferHeliusTxApiBase(rpcUrl, cluster);

    const entries: Array<{
      hashHex: string;
      h3Cell: string;
      payer: string;
      signature: string;
      url: string;
      timestamp?: string;
      nonce?: string;
    }> = [];
    let warning: string | null = null;

    if (heliusApiKey && heliusBase) {
      const pageLimit = Math.min(limit, 100);
      let before: string | undefined = undefined;
      while (entries.length < limit) {
        const query = new URLSearchParams({
          'api-key': heliusApiKey,
          limit: String(Math.min(pageLimit, limit - entries.length)),
        });
        if (before) query.set('before', before);
        const endpoint = `${heliusBase}/v0/addresses/${programIdStr}/transactions?${query.toString()}`;
        const res = await fetch(endpoint, { cache: 'no-store' });
        if (res.status === 429) {
          warning = `tx_lookup_limited: ${await res.text()}`;
          break;
        }
        if (!res.ok) {
          warning = `tx_lookup_error_${res.status}: ${await res.text()}`;
          break;
        }

        const page = (await res.json()) as HeliusAddressTransaction[];
        if (!Array.isArray(page) || !page.length) break;

        for (const tx of page) {
          const signature = tx.signature || '';
          if (!signature) continue;
          const timestamp =
            Number.isFinite(Number(tx.timestamp)) && Number(tx.timestamp) > 0
              ? new Date(Number(tx.timestamp) * 1000).toISOString()
              : undefined;

          for (const ix of tx.instructions ?? []) {
            if (ix.programId !== programIdStr) continue;
            const decoded = decodeRecordProof(decodeIxData(ix.data));
            if (!decoded) continue;
            const url = `https://solscan.io/tx/${signature}${cluster === 'mainnet-beta' ? '' : `?cluster=${cluster}`}`;
            entries.push({
              hashHex: decoded.hashHex,
              h3Cell: decoded.h3Cell,
              payer: ix.accounts?.[3] ?? '',
              signature,
              url,
              timestamp,
              nonce: decoded.nonce,
            });
            if (entries.length >= limit) break;
          }
          if (entries.length >= limit) break;
        }

        const lastSig = page[page.length - 1]?.signature;
        if (!lastSig) break;
        before = lastSig;
      }
    } else {
      // Fallback for non-Helius setups.
      const connection = new Connection(rpcUrl, 'confirmed');
      const programId = new PublicKey(programIdStr);
      const sigs = await connection.getSignaturesForAddress(programId, { limit });
      const txs = await connection.getTransactions(
        sigs.map((s) => s.signature),
        { maxSupportedTransactionVersion: 0 }
      );

      for (let i = 0; i < txs.length; i++) {
        const tx = txs[i];
        const sig = sigs[i]?.signature;
        if (!tx || !tx.transaction || !sig) continue;
        const message: any = tx.transaction.message as any;
        const keys = message.staticAccountKeys || message.accountKeys || [];
        const instrs = message.compiledInstructions || message.instructions || [];
        const ix = instrs.find((ci: any) => {
          const progKey = keys[ci.programIdIndex];
          return progKey && progKey.toBase58 && progKey.toBase58() === programId.toBase58();
        });
        if (!ix) continue;

        const raw = Buffer.from(
          typeof ix.data === 'string' ? ix.data : Buffer.from(ix.data).toString('base64'),
          'base64'
        );
        const decoded = decodeRecordProof(raw);
        if (!decoded) continue;

        const payerIdx = (ix.accounts?.[3] ?? ix.accounts?.[2] ?? 0) as number;
        const payer = keys[payerIdx]?.toBase58?.() || '';
        const timestamp = decoded.timestampSec
          ? new Date(decoded.timestampSec * 1000).toISOString()
          : undefined;
        const url = `https://solscan.io/tx/${sig}${cluster === 'mainnet-beta' ? '' : `?cluster=${cluster}`}`;

        entries.push({
          hashHex: decoded.hashHex,
          h3Cell: decoded.h3Cell,
          payer,
          signature: sig,
          url,
          timestamp,
          nonce: decoded.nonce,
        });
      }
    }

    return NextResponse.json({ entries, warning });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unknown error' }, { status: 500 });
  }
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

function inferCluster(rpcUrl: string): 'mainnet-beta' | 'devnet' | 'testnet' {
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
