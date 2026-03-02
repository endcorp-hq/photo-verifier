import { NextResponse } from 'next/server';
import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import type { ListObjectsV2CommandOutput } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Connection, PublicKey } from '@solana/web3.js';
import idl from '../../../lib/idl/photo_verifier.json';

// Expected env vars on Vercel
// S3_BUCKET, S3_REGION, S3_PREFIX (e.g., 'photos/'), OPTIONAL: S3_CDN_DOMAIN, PROGRAM_ID, RPC_URL

const BUCKET = process.env.S3_BUCKET || 'photoverifier';
const REGION = process.env.S3_REGION || 'us-east-1';
const PREFIX = normalizePrefix(process.env.S3_PREFIX || 'photos/');
const CDN = process.env.S3_CDN_DOMAIN || null;
const RPC_URL = process.env.RPC_URL || 'https://api.devnet.solana.com';
const INCLUDE_PROOF_SIDECAR = process.env.INCLUDE_PROOF_SIDECAR === 'true';
const MAX_LIST_ITEMS = Number(process.env.MAX_LIST_ITEMS || 200);
const LIST_CACHE_TTL_MS = Number(process.env.LIST_CACHE_TTL_MS || 15000);
const PROOF_CACHE_TTL_MS = Number(process.env.TX_CACHE_TTL_MS || 5000);
const PHOTO_PROOF_COMPRESSED_PROGRAM_ID =
  process.env.PROGRAM_ID || (idl as any).metadata.address || '8bQahCyQ6pLf5bFgj21kSd19mu1KZ2RfS7wALf35QyXz';
const PHOTO_METADATA_DISCRIMINATOR = Buffer.from([109, 215, 179, 76, 191, 160, 52, 39]);
const EXPLORER_CLUSTER = inferExplorerCluster(RPC_URL);

type PhotoMetadataProof = {
  proofAccount: string;
  owner: string;
  hashHex: string;
  nonce: string;
  timestamp: string | null;
  timestampSec: number;
  location: string;
  latitudeE6: number;
  longitudeE6: number;
  merkleRootHex: string;
  leafIndex: number;
  bump: number;
  createdAt: string | null;
  createdAtSec: number;
};

let __proofEntriesCache: { ts: number; out: PhotoMetadataProof[] } | null = null;
let __listResponseCache: { ts: number; out: any } | null = null;

const s3 = new S3Client({ region: REGION });
// Force dynamic execution and disable caching so we always fetch fresh data on refresh
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export async function GET(request: Request) {
  try {
    console.log('list: GET start');
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

    let proofs: PhotoMetadataProof[] = [];
    try {
      proofs = await loadProofAccounts();
    } catch (e: any) {
      console.error('loadProofAccounts error', e);
      proofs = [];
    }
    console.log('list: loaded proof accounts', proofs.length);

    const proofsByHash = new Map<string, PhotoMetadataProof[]>();
    for (const proof of proofs) {
      const key = proof.hashHex.toLowerCase();
      if (!proofsByHash.has(key)) proofsByHash.set(key, []);
      proofsByHash.get(key)!.push(proof);
    }

    // List objects under PREFIX. Keys look like: photos/<SEEKER>/<HASH>.jpg
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

    // Build responses and optionally include proof JSON sidecars when explicitly enabled
    const items = await Promise.all(
      listed.map(async (key) => {
        const { seekerMint, hashHex } = parsePhotoKey(key, PREFIX);
        const url = await buildPublicUrlOrPresigned(BUCKET, key, CDN);
        let proof: any = null;
        let proofUrl: string | null = null;
        if (includeProofSidecar) {
          const proofKey = key.replace(/\.[^.]+$/g, '.json');
          try {
            const getUrl = await getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: proofKey }), {
              expiresIn: 60,
            });
            const res = await fetch(getUrl);
            if (res.ok) {
              proof = await res.json().catch(() => null);
              proofUrl = getUrl;
            }
          } catch {}
        }

        const payloadWallet = proof?.payload?.wallet ?? proof?.payload?.owner ?? null;
        const candidates = proofsByHash.get(hashHex.toLowerCase()) ?? [];
        const match = pickBestProof(candidates, payloadWallet);
        const signature = proof?.signature ?? null;
        const tx =
          signature && typeof signature === 'string'
            ? `https://solscan.io/tx/${signature}${EXPLORER_CLUSTER === 'mainnet-beta' ? '' : `?cluster=${EXPLORER_CLUSTER}`}`
            : null;

        return {
          key,
          url,
          seekerMint,
          hashHex,
          timestamp:
            match?.timestamp ??
            (Number.isFinite(Number(proof?.payload?.timestampSec))
              ? new Date(Number(proof.payload.timestampSec) * 1000).toISOString()
              : proof?.payload?.timestamp ?? null),
          location: match?.location ?? proof?.payload?.location ?? null,
          owner: match?.owner ?? payloadWallet,
          signature,
          nonce: match?.nonce ?? proof?.payload?.nonce ?? null,
          merkleRootHex: match?.merkleRootHex ?? null,
          leafIndex: match?.leafIndex ?? null,
          createdAt: match?.createdAt ?? null,
          proofAccount: match?.proofAccount ?? null,
          proofAccountUrl: match
            ? `https://solscan.io/account/${match.proofAccount}${EXPLORER_CLUSTER === 'mainnet-beta' ? '' : `?cluster=${EXPLORER_CLUSTER}`}`
            : null,
          onChainVerified: Boolean(match),
          proofUrl,
          tx,
        };
      })
    );

    const imageHashes = new Set(items.map((item) => String(item.hashHex || '').toLowerCase()));
    const matchedImages = items.filter((item) => item.onChainVerified).length;
    const proofsWithImage = proofs.filter((proof) => imageHashes.has(proof.hashHex.toLowerCase())).length;

    const responseBody = {
      items,
      proofs,
      summary: {
        totalImages: items.length,
        onChainMatchedImages: matchedImages,
        unmatchedImages: items.length - matchedImages,
        totalProofAccounts: proofs.length,
        proofAccountsWithImage: proofsWithImage,
        orphanedProofAccounts: proofs.length - proofsWithImage,
      },
      bucket: BUCKET,
      prefix: PREFIX,
      programId: PHOTO_PROOF_COMPRESSED_PROGRAM_ID,
    };

    if (!includeProofSidecar) {
      __listResponseCache = { ts: Date.now(), out: responseBody };
    }

    return NextResponse.json(responseBody);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unknown error' }, { status: 500 });
  }
}

async function loadProofAccounts(): Promise<PhotoMetadataProof[]> {
  if (__proofEntriesCache && Date.now() - __proofEntriesCache.ts < PROOF_CACHE_TTL_MS) {
    return __proofEntriesCache.out;
  }
  const programId = new PublicKey(PHOTO_PROOF_COMPRESSED_PROGRAM_ID);
  const connection = new Connection(RPC_URL, 'confirmed');
  const accounts = await connection.getProgramAccounts(programId, { commitment: 'confirmed' });
  const out: PhotoMetadataProof[] = [];
  for (const account of accounts) {
    const decoded = decodePhotoMetadata(account.account.data);
    if (!decoded) continue;
    out.push({
      proofAccount: account.pubkey.toBase58(),
      ...decoded,
    });
  }
  out.sort((a, b) => b.createdAtSec - a.createdAtSec);
  __proofEntriesCache = { ts: Date.now(), out };
  return out;
}

function decodePhotoMetadata(data: Buffer): Omit<PhotoMetadataProof, 'proofAccount'> | null {
  if (data.length < 149) return null;
  if (!data.subarray(0, 8).equals(PHOTO_METADATA_DISCRIMINATOR)) return null;
  let o = 8;
  const owner = new PublicKey(data.subarray(o, o + 32)).toBase58();
  o += 32;
  const hashHex = Buffer.from(data.subarray(o, o + 32)).toString('hex');
  o += 32;
  const nonce = data.readBigUInt64LE(o).toString();
  o += 8;
  const timestampSec = Number(data.readBigInt64LE(o));
  o += 8;
  const latitudeE6 = Number(data.readBigInt64LE(o));
  o += 8;
  const longitudeE6 = Number(data.readBigInt64LE(o));
  o += 8;
  const merkleRootHex = Buffer.from(data.subarray(o, o + 32)).toString('hex');
  o += 32;
  const leafIndex = data.readUInt32LE(o);
  o += 4;
  const bump = data.readUInt8(o);
  o += 1;
  const createdAtSec = Number(data.readBigInt64LE(o));

  return {
    owner,
    hashHex,
    nonce,
    timestamp: toIsoTimestamp(timestampSec),
    timestampSec,
    location: `${latitudeE6 / 1_000_000},${longitudeE6 / 1_000_000}`,
    latitudeE6,
    longitudeE6,
    merkleRootHex,
    leafIndex,
    bump,
    createdAt: toIsoTimestamp(createdAtSec),
    createdAtSec,
  };
}

function pickBestProof(candidates: PhotoMetadataProof[], preferredOwner: string | null): PhotoMetadataProof | null {
  if (!candidates.length) return null;
  if (!preferredOwner) return candidates[0];
  return candidates.find((proof) => proof.owner === preferredOwner) ?? candidates[0];
}

function toIsoTimestamp(seconds: number): string | null {
  if (!Number.isFinite(seconds)) return null;
  return new Date(seconds * 1000).toISOString();
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

async function buildPublicUrlOrPresigned(bucket: string, key: string, cdnDomain: string | null): Promise<string> {
  if (cdnDomain) {
    const path = key.startsWith('/') ? key : '/' + key;
    return `https://${cdnDomain}${path}`;
  }
  // Fallback: presign short expiry URL
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  return getSignedUrl(s3, command, { expiresIn: 60 });
}

function inferExplorerCluster(rpcUrl: string): 'mainnet-beta' | 'devnet' | 'testnet' {
  const lower = rpcUrl.toLowerCase();
  if (lower.includes('testnet')) return 'testnet';
  if (lower.includes('mainnet')) return 'mainnet-beta';
  return 'devnet';
}
