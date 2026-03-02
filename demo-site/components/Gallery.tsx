"use client";
import { useEffect, useMemo, useState } from "react";
import { blake3 } from "@noble/hashes/blake3";
import { bytesToHex } from "@noble/hashes/utils";

const verifiedCache = new Map<string, boolean>();

type PhotoItem = {
  key: string;
  url: string;
  seekerMint: string;
  hashHex: string;
  onChainVerified?: boolean;
  proofAccount?: string | null;
  proofAccountUrl?: string | null;
  leafIndex?: number | null;
  createdAt?: string | null;
  merkleRootHex?: string | null;
  nonce?: string | null;
  // Optional metadata from proof file if present
  timestamp?: string;
  h3Cell?: string | null;
  owner?: string | null;
  signature?: string | null;
  proofUrl?: string | null;
  tx?: string | null;
};

type ApiResponse = {
  items: PhotoItem[];
  proofs?: Array<{
    signature: string;
    hashHex: string;
    payer: string;
    timestamp: string | null;
    h3Cell: string;
    nonce: string;
    url: string;
  }>;
  summary?: {
    totalImages: number;
    onChainMatchedImages: number;
    unmatchedImages: number;
    totalProofAccounts: number;
    proofAccountsWithImage: number;
    orphanedProofAccounts: number;
  };
  programId?: string;
  bucket: string;
  prefix: string;
};

export default function Gallery() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [verified, setVerified] = useState<Record<string, boolean>>({});
  const [hashChecksStarted, setHashChecksStarted] = useState(false);
  const [hashChecking, setHashChecking] = useState(false);
  const [deletingKeys, setDeletingKeys] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/list");
        if (!res.ok) throw new Error(`Failed to load (${res.status})`);
        const json = (await res.json()) as ApiResponse;
        if (!cancelled) setData(json);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!hashChecksStarted || !data?.items?.length) return;
      setHashChecking(true);
      // Seed from cache to avoid re-hashing on remounts
      const seed: Record<string, boolean> = {};
      for (const it of data.items) {
        if (verifiedCache.has(it.key)) seed[it.key] = verifiedCache.get(it.key)!;
      }
      if (Object.keys(seed).length) setVerified((m) => ({ ...seed, ...m }));

      const pending = data.items.filter((item) => item.hashHex && !verifiedCache.has(item.key));
      const concurrency = 4;
      let next = 0;
      async function worker() {
        while (next < pending.length) {
          const item = pending[next++];
          try {
            const res = await fetch(item.url, { method: "GET" });
            if (!res.ok) throw new Error("image fetch failed");
            const buf = await res.arrayBuffer();
            const digest = blake3(new Uint8Array(buf));
            const hex = bytesToHex(digest);
            if (cancelled) return;
            const ok = hex === item.hashHex.toLowerCase();
            verifiedCache.set(item.key, ok);
            setVerified((m) => ({ ...m, [item.key]: ok }));
          } catch {
            if (cancelled) return;
            verifiedCache.set(item.key, false);
            setVerified((m) => ({ ...m, [item.key]: false }));
          }
        }
      }
      await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, pending.length)) }, () => worker()));
      if (!cancelled) setHashChecking(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [data, hashChecksStarted]);

  const groups = useMemo(() => {
    const map = new Map<string, PhotoItem[]>();
    for (const it of data?.items ?? []) {
      const key = it.seekerMint || "unknown";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(it);
    }
    return [...map.entries()].map(([seekerMint, items]) => ({ seekerMint, items }));
  }, [data]);

  const hashCheckProgress = useMemo(() => {
    const total = (data?.items ?? []).filter((item) => Boolean(item.hashHex)).length;
    const checked = (data?.items ?? []).filter((item) => item.hashHex && (verified[item.key] !== undefined || verifiedCache.has(item.key))).length;
    return { total, checked };
  }, [data, verified]);

  async function handleDelete(item: PhotoItem) {
    const ok = window.confirm(`Delete image ${item.key} from S3? This will not remove on-chain proof accounts.`);
    if (!ok) return;

    setDeletingKeys((m) => ({ ...m, [item.key]: true }));
    try {
      const res = await fetch("/api/photo", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: item.key, deleteSidecar: true }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Delete failed (${res.status})`);
      }

      setData((prev) => {
        if (!prev) return prev;
        const nextItems = prev.items.filter((it) => it.key !== item.key);
        return {
          ...prev,
          items: nextItems,
          summary: prev.summary
            ? {
                ...prev.summary,
                totalImages: Math.max(0, prev.summary.totalImages - 1),
                onChainMatchedImages: Math.max(
                  0,
                  prev.summary.onChainMatchedImages - (item.onChainVerified ? 1 : 0)
                ),
                unmatchedImages: Math.max(
                  0,
                  prev.summary.unmatchedImages - (item.onChainVerified ? 0 : 1)
                ),
              }
            : prev.summary,
        };
      });
      setVerified((m) => {
        const next = { ...m };
        delete next[item.key];
        return next;
      });
      verifiedCache.delete(item.key);
    } catch (e: any) {
      window.alert(e?.message || "Delete failed");
    } finally {
      setDeletingKeys((m) => ({ ...m, [item.key]: false }));
    }
  }

  if (loading) return <div className="status">Loading…</div>;
  if (error) return <div className="status">Error: {error}</div>;
  if (!groups.length) return <div className="status">No photos found.</div>;

  return (
    <div>
      <section className="summary">
        <h2 className="group-title">Verification Summary</h2>
        <div className="summary-grid">
          <div><strong>Images</strong>: {data?.summary?.totalImages ?? data?.items.length ?? 0}</div>
          <div><strong>On-chain matched</strong>: {data?.summary?.onChainMatchedImages ?? 0}</div>
          <div><strong>Unmatched images</strong>: {data?.summary?.unmatchedImages ?? 0}</div>
          <div><strong>Proof txs</strong>: {data?.summary?.totalProofAccounts ?? data?.proofs?.length ?? 0}</div>
          <div><strong>Proof txs with image</strong>: {data?.summary?.proofAccountsWithImage ?? 0}</div>
          <div><strong>Orphaned proof txs</strong>: {data?.summary?.orphanedProofAccounts ?? 0}</div>
          <div>
            <strong>Image hash checks</strong>: {hashChecksStarted ? `${hashCheckProgress.checked}/${hashCheckProgress.total}` : "not started"}
          </div>
        </div>
        <div className="summary-meta">
          <span><strong>Program</strong>: {formatHash(data?.programId ?? '')}</span>
        </div>
      </section>
      {groups.map((g) => (
        <section key={g.seekerMint} className="group">
          <h2 className="group-title">
            Seeker: {g.seekerMint}
            {g.seekerMint && g.seekerMint !== "unknown" ? (
              <> · <a href={`https://solscan.io/token/${g.seekerMint}`} target="_blank" rel="noreferrer noopener">View on Solscan</a></>
            ) : null}
          </h2>
          <div className="cards" role="list">
            {g.items.map((item) => (
              <article className="card" role="listitem" key={item.key}>
                  <div className="image-wrap">
                  <img className="photo" src={item.url} alt="Seeker photo" loading="lazy" decoding="async" />
                </div>
                <div className="meta">
                  <div><strong>Hash</strong>: <span className="hash">{formatHash(item.hashHex)}</span></div>
                  <div className="row">
                    <strong>On-chain</strong>:
                    {item.onChainVerified ? (
                      <span className="verified-badge">✓ Proof account found</span>
                    ) : (
                      <span className="unverified-badge">No proof account match</span>
                    )}
                  </div>
                  {!hashChecksStarted ? (
                    <div className="row"><strong>Image Hash</strong>: <span className="pending-badge">Not run</span></div>
                  ) : verified[item.key] === true ? (
                    <div className="row verified"><strong>Image Hash</strong>: <span className="verified-badge">✓ Content matches hash</span></div>
                  ) : verified[item.key] === false ? (
                    <div className="row"><strong>Image Hash</strong>: <span className="unverified-badge">Mismatch</span></div>
                  ) : (
                    <div className="row"><strong>Image Hash</strong>: <span className="pending-badge">Checking…</span></div>
                  )}
                  <div className="row"><strong>H3 Cell</strong>: <span className="location">{formatH3Cell(item.h3Cell)}</span></div>
                  <div className="row"><strong>Timestamp</strong>: <span className="timestamp">{item.timestamp || "—"}</span></div>
                  <div className="row"><strong>Owner</strong>: <span className="owner">{formatOwner(item.owner)}</span></div>
                  {item.signature ? (
                    <div className="row"><strong>Tx Sig</strong>: <span className="signature">{item.signature.slice(0, 16) + "…"}</span></div>
                  ) : null}
                  <div className="row"><strong>Nonce</strong>: <span className="nonce">{item.nonce ?? "—"}</span></div>
                  <div className="row"><strong>Leaf Index</strong>: <span className="leaf-index">{item.leafIndex ?? "—"}</span></div>
                  <div className="row"><strong>Created At</strong>: <span className="created-at">{item.createdAt ?? "—"}</span></div>
                  <div className="row"><strong>S3</strong>: <a className="s3-link" href={item.url} target="_blank" rel="noreferrer noopener">Open</a></div>
                  <div className="row">
                    <strong>Delete</strong>:
                    <button
                      type="button"
                      className="delete-button"
                      onClick={() => handleDelete(item)}
                      disabled={Boolean(deletingKeys[item.key])}
                    >
                      {deletingKeys[item.key] ? "Deleting..." : "Delete image"}
                    </button>
                  </div>
                  {item.proofAccountUrl && (
                    <div className="row account"><strong>On-chain Account</strong>: <a className="proof-link" href={item.proofAccountUrl} target="_blank" rel="noreferrer noopener">{formatHash(item.proofAccount)}</a></div>
                  )}
                  {item.proofUrl && (
                    <div className="row proof"><strong>Proof</strong>: <a className="proof-link" href={item.proofUrl} target="_blank" rel="noreferrer noopener">JSON</a></div>
                  )}
                  {item.tx && (
                    <div className="row tx"><strong>Transaction</strong>: <a className="tx-link" href={item.tx} target="_blank" rel="noreferrer noopener">View</a></div>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
      {!!data?.proofs?.length && (
        <section className="group">
          <h2 className="group-title">On-chain Proof Transactions</h2>
          <div className="proof-list">
            {data.proofs.slice(0, 50).map((proof) => (
              <div className="proof-item" key={proof.signature}>
                <div><strong>Tx</strong>: <a href={proof.url} target="_blank" rel="noreferrer noopener">{formatHash(proof.signature)}</a></div>
                <div><strong>Hash</strong>: {formatHash(proof.hashHex)}</div>
                <div><strong>Owner</strong>: {formatHash(proof.payer)}</div>
                <div><strong>Timestamp</strong>: {proof.timestamp ?? "—"}</div>
                <div><strong>H3 Cell</strong>: {formatH3Cell(proof.h3Cell)}</div>
                <div><strong>Nonce</strong>: {proof.nonce}</div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function formatH3Cell(cell?: string | null) {
  if (!cell) return "—";
  return String(cell).toLowerCase();
}

function formatHash(hash?: string | null) {
  if (!hash) return "—";
  const s = String(hash);
  if (s.length <= 12) return s;
  const head = s.slice(0, 5);
  const tail = s.slice(-5);
  return `${head}...${tail}`;
}

function formatOwner(owner?: string | null) {
  if (!owner) return "—";
  return formatHash(owner);
}
