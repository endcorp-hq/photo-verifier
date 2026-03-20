import type { RecordProofEntry } from './load-record-proof-entries';
import type { PhotoCatalogItem } from './photo-catalog';

type SidecarPayload = {
  wallet: string | null;
  timestampSec: number | null;
  timestamp: string | null;
  h3Cell: string | null;
  nonce: string | null;
};

type MatchedPhotoItem = {
  key: string;
  url: string;
  seekerMint: string;
  hashHex: string;
  timestamp: string | null;
  h3Cell: string | null;
  owner: string | null;
  signature: string | null;
  nonce: string | null;
  tx: string | null;
  onChainVerified: boolean;
  proofUrl: string | null;
};

type ProofMatchSummary = {
  totalImages: number;
  onChainMatchedImages: number;
  unmatchedImages: number;
  totalProofAccounts: number;
  proofAccountsWithImage: number;
  orphanedProofAccounts: number;
};

export function matchPhotosWithProofs(params: {
  photos: PhotoCatalogItem[];
  proofs: RecordProofEntry[];
}): { items: MatchedPhotoItem[]; summary: ProofMatchSummary } {
  const txByHash = new Map<string, RecordProofEntry[]>();
  for (const tx of params.proofs) {
    const key = tx.hashHex.toLowerCase();
    if (!txByHash.has(key)) txByHash.set(key, []);
    txByHash.get(key)!.push(tx);
  }

  const items = params.photos.map((photo) => {
    const payload = readSidecarPayload(photo.sidecar);
    const candidates = txByHash.get(photo.hashHex.toLowerCase()) ?? [];
    const match = pickBestEntry(candidates, payload.wallet);

    return {
      key: photo.key,
      url: photo.url,
      seekerMint: photo.seekerMint,
      hashHex: photo.hashHex,
      timestamp:
        match?.timestamp ??
        (Number.isFinite(payload.timestampSec)
          ? new Date(Number(payload.timestampSec) * 1000).toISOString()
          : payload.timestamp),
      h3Cell: match?.h3Cell ?? payload.h3Cell,
      owner: match?.payer ?? payload.wallet,
      signature: match?.signature ?? null,
      nonce: match?.nonce ?? payload.nonce,
      tx: match?.url ?? null,
      onChainVerified: Boolean(match),
      proofUrl: photo.proofUrl,
    };
  });

  const imageHashes = new Set(items.map((item) => String(item.hashHex || '').toLowerCase()));
  const matchedImages = items.filter((item) => item.onChainVerified).length;
  const txWithImage = params.proofs.filter((tx) => imageHashes.has(tx.hashHex.toLowerCase())).length;

  return {
    items,
    summary: {
      totalImages: items.length,
      onChainMatchedImages: matchedImages,
      unmatchedImages: items.length - matchedImages,
      totalProofAccounts: params.proofs.length,
      proofAccountsWithImage: txWithImage,
      orphanedProofAccounts: params.proofs.length - txWithImage,
    },
  };
}

function pickBestEntry(
  candidates: RecordProofEntry[],
  preferredOwner: string | null
): RecordProofEntry | null {
  if (!candidates.length) return null;
  if (!preferredOwner) return candidates[0];
  return candidates.find((entry) => entry.payer === preferredOwner) ?? candidates[0];
}

function readSidecarPayload(sidecar: unknown): SidecarPayload {
  const root = sidecar && typeof sidecar === 'object' ? (sidecar as Record<string, unknown>) : null;
  const payload =
    root && root.payload && typeof root.payload === 'object'
      ? (root.payload as Record<string, unknown>)
      : null;

  const walletValue = payload?.wallet ?? payload?.owner;
  const timestampSecValue = payload?.timestampSec;
  const timestampValue = payload?.timestamp;
  const h3CellValue = payload?.h3Cell;
  const nonceValue = payload?.nonce;

  return {
    wallet: typeof walletValue === 'string' ? walletValue : null,
    timestampSec: Number.isFinite(Number(timestampSecValue)) ? Number(timestampSecValue) : null,
    timestamp: typeof timestampValue === 'string' ? timestampValue : null,
    h3Cell: typeof h3CellValue === 'string' ? h3CellValue : null,
    nonce:
      typeof nonceValue === 'string'
        ? nonceValue
        : Number.isFinite(Number(nonceValue))
          ? String(nonceValue)
          : null,
  };
}
