import {
  type AccountInfo,
  type Connection,
  type PublicKey,
  Connection as Web3Connection,
  PublicKey as Web3PublicKey,
} from '@solana/web3.js';

// Default RPC URL - can be overridden via verifySeeker() param.
const DEFAULT_RPC_URL = 'https://api.mainnet-beta.solana.com';

export type SeekerWalletVerificationRequest = {
  walletAddress: string;
  rpcUrl?: string;
};

export type SeekerOwnerVerificationRequest = {
  connection: Connection;
  owner: PublicKey;
  seekerMintsByCluster: string[];
};

export type SeekerVerificationResult =
  | {
      status: 'verified';
      isVerified: true;
      isSeeker: true;
      seekerMint: string;
      // Backward-compatible alias
      mint: string;
      reason?: undefined;
    }
  | {
      status: 'not_verified';
      isVerified: false;
      isSeeker: false;
      seekerMint: null;
      // Backward-compatible alias
      mint: null;
      reason?: string;
      cause?: string;
    }
  | {
      status: 'verification_unavailable';
      isVerified: false;
      isSeeker: false;
      seekerMint: null;
      mint: null;
      reason: string;
      cause?: string;
    };

export type SeekerDetectionResult = SeekerVerificationResult;

type ParsedTokenAccountData = {
  parsed?: {
    info?: {
      mint?: string;
      tokenAmount?: { amount?: string };
    };
  };
};

type ParsedTokenAccount = {
  account?: {
    data?: ParsedTokenAccountData;
  };
};

type TokenAccountsByOwnerV2Response = {
  error?: { message?: string };
  result?: {
    paginationKey?: string | null;
    value?: {
      accounts?: ParsedTokenAccount[];
    };
  };
};

type SplTokenModule = {
  TOKEN_2022_PROGRAM_ID: Web3PublicKey;
  unpackMint: (
    mint: Web3PublicKey,
    mintInfo: AccountInfo<Buffer>,
    programId: Web3PublicKey
  ) => {
    address: Web3PublicKey;
    mintAuthority?: Web3PublicKey | null;
  };
  getMetadataPointerState: (mint: unknown) => {
    authority?: Web3PublicKey | null;
    metadataAddress?: Web3PublicKey | null;
  } | null;
  getTokenGroupMemberState: (mint: unknown) => {
    group?: Web3PublicKey | null;
  } | null;
};

type SeekerLookupConnection = Pick<
  Connection,
  'getParsedTokenAccountsByOwner' | 'getMultipleAccountsInfo'
>;

type VerifySeekerRuntime = {
  createConnection: (rpcUrl: string) => SeekerLookupConnection;
  createPublicKey: (value: string) => PublicKey;
  loadSplToken: () => Promise<SplTokenModule>;
  fetchFn: typeof fetch;
};

// Constants for Seeker Genesis Token verification
const SGT_MINT_AUTHORITY = 'GT2zuHVaZQYZSyQMgJPLzvkmyztfyXg2NJunqFp4p3A4';
const SGT_METADATA_ADDRESS = 'GT22s89nU4iWFkNXj1Bw6uYhJJWDRPpShHt4Bk8f99Te';
const SGT_GROUP_MINT_ADDRESS = 'GT22s89nU4iWFkNXj1Bw6uYhJJWDRPpShHt4Bk8f99Te';

function extractMintAndAmount(parsed: ParsedTokenAccountData | undefined): {
  mint?: string;
  amount?: string;
} {
  return {
    mint: parsed?.parsed?.info?.mint,
    amount: parsed?.parsed?.info?.tokenAmount?.amount,
  };
}

function verifiedSeekerResult(seekerMint: string): SeekerVerificationResult {
  return {
    status: 'verified',
    isVerified: true,
    isSeeker: true,
    seekerMint,
    mint: seekerMint,
  };
}

function unverifiedSeekerResult(reason?: string): SeekerVerificationResult {
  return {
    status: 'not_verified',
    isVerified: false,
    isSeeker: false,
    seekerMint: null,
    mint: null,
    reason,
  };
}

function unavailableSeekerResult(reason: string, cause?: unknown): SeekerVerificationResult {
  return {
    status: 'verification_unavailable',
    isVerified: false,
    isSeeker: false,
    seekerMint: null,
    mint: null,
    reason,
    cause: cause ? normalizeCause(cause) : undefined,
  };
}

function normalizeCause(cause: unknown): string {
  return String((cause as { message?: string })?.message ?? cause ?? 'unknown error');
}

function normalizeOwnerRequest(
  requestOrConnection: SeekerOwnerVerificationRequest | Connection,
  owner?: PublicKey,
  seekerMintsByCluster?: string[]
): SeekerOwnerVerificationRequest {
  if ('connection' in requestOrConnection && 'owner' in requestOrConnection) {
    return requestOrConnection;
  }

  if (!owner) {
    throw new Error('owner is required when using positional seeker verification arguments');
  }

  return {
    connection: requestOrConnection,
    owner,
    seekerMintsByCluster: seekerMintsByCluster ?? [],
  };
}

export function findSeekerMintForOwner(
  request: SeekerOwnerVerificationRequest
): Promise<SeekerVerificationResult>;
export function findSeekerMintForOwner(
  connection: Connection,
  owner: PublicKey,
  seekerMintsByCluster: string[]
): Promise<SeekerVerificationResult>;
export async function findSeekerMintForOwner(
  requestOrConnection: SeekerOwnerVerificationRequest | Connection,
  owner?: PublicKey,
  seekerMintsByCluster?: string[]
): Promise<SeekerVerificationResult> {
  const request = normalizeOwnerRequest(requestOrConnection, owner, seekerMintsByCluster);

  try {
    if (!request.seekerMintsByCluster?.length) {
      return unverifiedSeekerResult('no_seeker_mints_configured');
    }

    const { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } = await import('@solana/spl-token');
    const [tokenAccounts, token2022Accounts] = await Promise.all([
      request.connection.getParsedTokenAccountsByOwner(request.owner, { programId: TOKEN_PROGRAM_ID }),
      request.connection.getParsedTokenAccountsByOwner(request.owner, { programId: TOKEN_2022_PROGRAM_ID }),
    ]);

    const all = [...tokenAccounts.value, ...token2022Accounts.value];
    for (const account of all) {
      const parsed = account.account.data as ParsedTokenAccountData;
      const { mint, amount } = extractMintAndAmount(parsed);
      if (mint && amount !== '0' && request.seekerMintsByCluster.includes(mint)) {
        return verifiedSeekerResult(mint);
      }
    }
  } catch (error) {
    // Fail closed for non-Seeker wallets or RPC errors.
    return unavailableSeekerResult('lookup_failed', error);
  }

  return unverifiedSeekerResult('no_matching_token');
}

export function detectSeekerUser(
  request: SeekerOwnerVerificationRequest
): Promise<SeekerDetectionResult>;
export function detectSeekerUser(
  connection: Connection,
  owner: PublicKey,
  seekerMintsByCluster: string[]
): Promise<SeekerDetectionResult>;
export function detectSeekerUser(
  requestOrConnection: SeekerOwnerVerificationRequest | Connection,
  owner?: PublicKey,
  seekerMintsByCluster?: string[]
): Promise<SeekerDetectionResult> {
  const request = normalizeOwnerRequest(requestOrConnection, owner, seekerMintsByCluster);
  return findSeekerMintForOwner(request);
}

/**
 * Verify if a wallet holds a Seeker Genesis Token (SGT).
 * Returns the unified SeekerVerificationResult contract.
 */
export async function verifySeeker(
  params: SeekerWalletVerificationRequest,
  runtime: VerifySeekerRuntime = {
    createConnection: (rpcUrl: string) => new Web3Connection(rpcUrl),
    createPublicKey: (value: string) => new Web3PublicKey(value),
    loadSplToken: async () => (await import('@solana/spl-token')) as unknown as SplTokenModule,
    fetchFn: fetch,
  }
): Promise<SeekerVerificationResult> {
  return verifySeekerInternal(params, runtime);
}

async function verifySeekerInternal(
  params: SeekerWalletVerificationRequest,
  runtime: VerifySeekerRuntime
): Promise<SeekerVerificationResult> {
  const rpcUrl = params.rpcUrl ?? DEFAULT_RPC_URL;

  try {
    const connection = runtime.createConnection(rpcUrl);
    const { unpackMint, getMetadataPointerState, getTokenGroupMemberState, TOKEN_2022_PROGRAM_ID } =
      await runtime.loadSplToken();

    const mintStrings: string[] = [];
    const seenMints = new Set<string>();
    const collectMint = (account: ParsedTokenAccount) => {
      const { mint, amount } = extractMintAndAmount(account?.account?.data);
      if (!mint || amount === '0') return;
      if (seenMints.has(mint)) return;
      seenMints.add(mint);
      mintStrings.push(mint);
    };

    // Preferred path for providers that support it (e.g. Helius).
    let preferredLookupCause: string | null = null;
    try {
      let paginationKey: string | null = null;
      let pageCount = 0;
      do {
        pageCount += 1;
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

        const response = await runtime.fetchFn(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestPayload),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = (await response.json()) as TokenAccountsByOwnerV2Response;
        if (data.error) throw new Error(`RPC: ${data.error?.message ?? 'unknown error'}`);

        const accounts = data?.result?.value?.accounts ?? [];
        for (const account of accounts) collectMint(account);
        paginationKey = data?.result?.paginationKey ?? null;
      } while (paginationKey);
    } catch (error) {
      preferredLookupCause = normalizeCause(error);
      // Fall through to standard Solana RPC method.
    }

    // Fallback path for standard RPC nodes.
    if (!mintStrings.length) {
      try {
        const owner = runtime.createPublicKey(params.walletAddress);
        const parsed = await connection.getParsedTokenAccountsByOwner(owner, {
          programId: TOKEN_2022_PROGRAM_ID,
        });
        for (const account of parsed.value) collectMint(account);
      } catch (error) {
        return unavailableSeekerResult(
          'token_lookup_failed',
          preferredLookupCause
            ? `${preferredLookupCause}; fallback=${normalizeCause(error)}`
            : error
        );
      }
    }

    if (!mintStrings.length) {
      return unverifiedSeekerResult('no_token_2022_balances');
    }

    const mintPubkeys = mintStrings.map((mint) => runtime.createPublicKey(mint));

    const BATCH_SIZE = 100;
    const mintAccountInfos: Array<AccountInfo<Buffer> | null> = [];
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
          !!metadataPointer &&
          metadataPointer.authority?.toBase58() === SGT_MINT_AUTHORITY &&
          metadataPointer.metadataAddress?.toBase58() === SGT_METADATA_ADDRESS;

        const tokenGroupMemberState = getTokenGroupMemberState(mint);
        const hasCorrectGroupMember =
          !!tokenGroupMemberState &&
          tokenGroupMemberState.group?.toBase58() === SGT_GROUP_MINT_ADDRESS;

        if (hasCorrectMintAuthority && hasCorrectMetadata && hasCorrectGroupMember) {
          return verifiedSeekerResult(mint.address.toBase58());
        }
      } catch {
        // Continue scanning other mint accounts.
      }
    }

    return unverifiedSeekerResult('no_matching_sgt');
  } catch (error) {
    return unavailableSeekerResult('verification_failed', error);
  }
}
