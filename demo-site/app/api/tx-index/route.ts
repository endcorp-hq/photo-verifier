import { NextResponse } from 'next/server';
import { Connection, PublicKey } from '@solana/web3.js';
import crypto from 'crypto';
import idl from '../../../lib/idl/photo_verifier.json';

// Returns decoded record_photo_proof entries.
export async function GET() {
  try {
    const rpcUrl = process.env.RPC_URL || 'https://api.devnet.solana.com';
    const programIdStr = process.env.PROGRAM_ID || (idl as any).metadata.address || '8bQahCyQ6pLf5bFgj21kSd19mu1KZ2RfS7wALf35QyXz';
    const limit = Number(process.env.LIMIT || 100);

    const connection = new Connection(rpcUrl, 'confirmed');
    const programId = new PublicKey(programIdStr);
    const recordProofDisc = crypto.createHash('sha256').update('global:record_photo_proof').digest().subarray(0, 8);

    const sigs = await connection.getSignaturesForAddress(programId, { limit });
    const out: Array<{
      hashHex: string;
      location: string;
      payer: string;
      signature: string;
      url: string;
      timestamp?: string;
      nonce?: string;
    }> = [];

    const batchSize = 10;
    for (let i = 0; i < sigs.length; i += batchSize) {
      const chunk = sigs.slice(i, i + batchSize);
      const txs = await connection.getTransactions(
        chunk.map((s) => s.signature),
        { maxSupportedTransactionVersion: 0 }
      );

      for (let j = 0; j < txs.length; j++) {
        const tx = txs[j];
        const sig = chunk[j].signature;
        if (!tx || !tx.transaction) continue;
        const message: any = tx.transaction.message as any;
        const keys = message.staticAccountKeys || message.accountKeys || [];
        const instrs = message.compiledInstructions || message.instructions || [];
        const ix = instrs.find((ci: any) => {
          const progKey = keys[ci.programIdIndex];
          return progKey && progKey.toBase58 && progKey.toBase58() === programId.toBase58();
        });
        if (!ix) continue;

        const dataB64: string = typeof ix.data === 'string' ? ix.data : Buffer.from(ix.data).toString('base64');
        const raw = Buffer.from(dataB64, 'base64');
        if (raw.length < 8 || !raw.subarray(0, 8).equals(recordProofDisc)) continue;

        let o = 8;
        const hash = raw.subarray(o, o + 32); o += 32;
        const nonce = raw.readBigUInt64LE(o).toString(); o += 8;
        const timestampSec = Number(raw.readBigInt64LE(o)); o += 8;
        const latitudeE6 = Number(raw.readBigInt64LE(o)); o += 8;
        const longitudeE6 = Number(raw.readBigInt64LE(o)); o += 8;
        o += 32; // merkle_root
        o += 4; // leaf_index

        const hashHex = Buffer.from(hash).toString('hex');
        const location = `${latitudeE6 / 1_000_000},${longitudeE6 / 1_000_000}`;
        const timestamp = Number.isFinite(timestampSec) ? new Date(timestampSec * 1000).toISOString() : undefined;
        const payerIdx = (ix.accounts?.[2] ?? 0) as number;
        const payer = keys[payerIdx]?.toBase58?.() || '';
        const url = `https://solscan.io/tx/${sig}?cluster=devnet`;

        out.push({ hashHex, location, payer, signature: sig, url, timestamp, nonce });
      }
    }

    return NextResponse.json({ entries: out });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unknown error' }, { status: 500 });
  }
}
