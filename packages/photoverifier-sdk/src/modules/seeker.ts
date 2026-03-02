import type { Connection, PublicKey } from '@solana/web3.js';
import { Platform } from 'react-native';
import { Connection as Web3Connection, PublicKey as Web3PublicKey } from '@solana/web3.js';

// Default RPC URL - can be overridden via verifySeeker() param or environment
const DEFAULT_RPC_URL = 'https://api.mainnet-beta.solana.com';

export async function findSeekerMintForOwner(
  connection: Connection,
  owner: PublicKey,
  seekerMintsByCluster: string[],
): Promise<string | null> {
  try {
    if (!seekerMintsByCluster?.length) return null;
    const { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } = await import('@solana/spl-token');
    const [tokenAccounts, token2022Accounts] = await Promise.all([
      connection.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_PROGRAM_ID }),
      connection.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_2022_PROGRAM_ID }),
    ]);
    const all = [...tokenAccounts.value, ...token2022Accounts.value];
    for (const acc of all) {
      const parsed: any = acc.account.data;
      const mint: string | undefined = parsed?.parsed?.info?.mint;
      const amount: string | undefined = parsed?.parsed?.info?.tokenAmount?.amount;
      if (mint && amount !== '0' && seekerMintsByCluster.includes(mint)) return mint;
    }
  } catch {}
  return null;
}

export type SeekerDetectionResult = {
  isSeeker: boolean;
  seekerMint: string | null;
};

// High-level helper wrapping the Seeker Genesis Token verification (client-side half):
//  - Verifies wallet holds one of the configured Seeker Genesis Token mint addresses
//  - Returns the matching mint if found
export async function detectSeekerUser(
  connection: Connection,
  owner: PublicKey,
  seekerMintsByCluster: string[],
): Promise<SeekerDetectionResult> {
  const mint = await findSeekerMintForOwner(connection, owner, seekerMintsByCluster);
  return { isSeeker: !!mint, seekerMint: mint };
}

// Lightweight client-side device check using Platform constants. Spoofable; for UX only.
export function isSeekerDevice(): boolean {
  try {
    return (Platform as any)?.constants?.Model === 'Seeker';
  } catch {
    return false;
  }
}

// Constants for Seeker Genesis Token verification
const SGT_MINT_AUTHORITY = 'GT2zuHVaZQYZSyQMgJPLzvkmyztfyXg2NJunqFp4p3A4';
const SGT_METADATA_ADDRESS = 'GT22s89nU4iWFkNXj1Bw6uYhJJWDRPpShHt4Bk8f99Te';
const SGT_GROUP_MINT_ADDRESS = 'GT22s89nU4iWFkNXj1Bw6uYhJJWDRPpShHt4Bk8f99Te';

/**
 * Verify if a wallet holds a Seeker Genesis Token (SGT)
 * 
 * This verifies the wallet owns a genuine Seeker phone by checking for the 
 * official Seeker Genesis Token with correct mint authority, metadata, and group.
 * 
 * @param params.walletAddress - The wallet address to verify
 * @param params.rpcUrl - RPC URL (defaults to SOLANA_RPC_URL env or mainnet-beta)
 * @returns { isVerified: boolean, mint: string | null }
 */
export async function verifySeeker(params: {
  walletAddress: string;
  rpcUrl?: string;
}): Promise<{ isVerified: boolean; mint: string | null }> {
  const rpcUrl = params.rpcUrl ?? DEFAULT_RPC_URL;

  try {
    const connection = new Web3Connection(rpcUrl);
    const spl = await import('@solana/spl-token');
    const { unpackMint, getMetadataPointerState, getTokenGroupMemberState, TOKEN_2022_PROGRAM_ID } = spl as any;

    const mintStrings: string[] = [];
    const seenMints = new Set<string>();
    const collectMint = (acc: any) => {
      const mint = acc?.account?.data?.parsed?.info?.mint;
      const amount = acc?.account?.data?.parsed?.info?.tokenAmount?.amount;
      if (!mint || amount === '0') return;
      if (seenMints.has(mint)) return;
      seenMints.add(mint);
      mintStrings.push(mint);
    };

    // Preferred path for providers that support it (e.g. Helius).
    try {
      let paginationKey: any = null;
      let pageCount = 0;
      do {
        pageCount++;
        const requestPayload = {
          jsonrpc: '2.0',
          id: `page-${pageCount}`,
          method: 'getTokenAccountsByOwnerV2',
          params: [
            params.walletAddress,
            { programId: TOKEN_2022_PROGRAM_ID.toBase58() },
            { encoding: 'jsonParsed', limit: 1000, ...(paginationKey ? { paginationKey } : {}) },
          ],
        } as const;

        const resp = await fetch(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestPayload),
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        if ((data as any).error) throw new Error(`RPC: ${(data as any).error?.message}`);
        const value = (data as any)?.result?.value?.accounts ?? [];
        for (const account of value) collectMint(account);
        paginationKey = (data as any)?.result?.paginationKey ?? null;
      } while (paginationKey);
    } catch {
      // Fall through to standard Solana RPC method.
    }

    // Fallback path for standard RPC nodes.
    if (!mintStrings.length) {
      const owner = new Web3PublicKey(params.walletAddress);
      const parsed = await connection.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_2022_PROGRAM_ID });
      for (const account of parsed.value) collectMint(account);
    }

    if (!mintStrings.length) return { isVerified: false, mint: null };

    const mintPubkeys = mintStrings.map((mint) => new Web3PublicKey(mint));

    const BATCH_SIZE = 100;
    const mintAccountInfos: (import('@solana/web3.js').AccountInfo<Buffer> | null)[] = [];
    for (let i = 0; i < mintPubkeys.length; i += BATCH_SIZE) {
      const batch = mintPubkeys.slice(i, i + BATCH_SIZE);
      const infos = await connection.getMultipleAccountsInfo(batch);
      mintAccountInfos.push(...infos);
    }

    for (let i = 0; i < mintAccountInfos.length; i++) {
      const mintInfo = mintAccountInfos[i];
      if (!mintInfo) continue;
      const mintPubkey = mintPubkeys[i];
      try {
        const mint = unpackMint(mintPubkey, mintInfo, TOKEN_2022_PROGRAM_ID);
        const mintAuthority = mint.mintAuthority?.toBase58();
        const hasCorrectMintAuthority = mintAuthority === SGT_MINT_AUTHORITY;
        const metadataPointer = getMetadataPointerState(mint);
        const hasCorrectMetadata =
          metadataPointer &&
          metadataPointer.authority?.toBase58() === SGT_MINT_AUTHORITY &&
          metadataPointer.metadataAddress?.toBase58() === SGT_METADATA_ADDRESS;
        const tokenGroupMemberState = getTokenGroupMemberState(mint);
        const hasCorrectGroupMember =
          tokenGroupMemberState && tokenGroupMemberState.group?.toBase58() === SGT_GROUP_MINT_ADDRESS;
        if (hasCorrectMintAuthority && hasCorrectMetadata && hasCorrectGroupMember) {
          return { isVerified: true, mint: mint.address.toBase58() };
        }
      } catch {
        continue;
      }
    }

    return { isVerified: false, mint: null };
  } catch {
    return { isVerified: false, mint: null };
  }
}
