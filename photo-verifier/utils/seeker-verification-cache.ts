import type { SeekerVerificationResult } from '@endcorp/photoverifier-sdk'

const DEFAULT_SEEKER_CACHE_TTL_MS = 5 * 60 * 1000;

type VerifySeekerCachedParams = {
  walletAddress: string;
  rpcUrl: string;
  force?: boolean;
};

type VerifySeekerFn = (params: {
  walletAddress: string;
  rpcUrl: string;
}) => Promise<SeekerVerificationResult>;

export function createSeekerVerificationCache(options: {
  verifySeekerFn: VerifySeekerFn;
  now?: () => number;
  ttlMs?: number;
}) {
  const now = options.now ?? (() => Date.now());
  const ttlMs = options.ttlMs ?? DEFAULT_SEEKER_CACHE_TTL_MS;
  const seekerCache = new Map<string, { expiresAt: number; value: SeekerVerificationResult }>();
  const inFlight = new Map<string, Promise<SeekerVerificationResult>>();
  let globalGeneration = 0;
  const keyGeneration = new Map<string, number>();

  function getCacheKey(walletAddress: string, rpcUrl: string): string {
    return `${walletAddress}:${rpcUrl}`;
  }

  function getGenerationToken(cacheKey: string): string {
    return `${globalGeneration}:${keyGeneration.get(cacheKey) ?? 0}`;
  }

  function bumpKeyGeneration(cacheKey: string): void {
    keyGeneration.set(cacheKey, (keyGeneration.get(cacheKey) ?? 0) + 1);
  }

  function isCacheableVerification(result: SeekerVerificationResult): boolean {
    switch (result.status) {
      case 'verified':
      case 'not_verified':
        return true
      case 'verification_unavailable':
        return false
    }
  }

  async function verifySeekerCached(params: VerifySeekerCachedParams): Promise<SeekerVerificationResult> {
    const cacheKey = getCacheKey(params.walletAddress, params.rpcUrl);
    const currentTime = now();

    if (!params.force) {
      const cached = seekerCache.get(cacheKey);
      if (cached && cached.expiresAt > currentTime) {
        return cached.value;
      }
    }

    const pending = inFlight.get(cacheKey);
    if (pending) return pending;

    const generationToken = getGenerationToken(cacheKey);
    const request = options
      .verifySeekerFn({
        walletAddress: params.walletAddress,
        rpcUrl: params.rpcUrl,
      })
      .then((result) => {
        if (isCacheableVerification(result) && getGenerationToken(cacheKey) === generationToken) {
          seekerCache.set(cacheKey, {
            expiresAt: now() + ttlMs,
            value: result,
          });
        }
        return result;
      })
      .finally(() => {
        inFlight.delete(cacheKey);
      });

    inFlight.set(cacheKey, request);
    return request;
  }

  function clearSeekerVerificationCache(walletAddress?: string): void {
    if (!walletAddress) {
      globalGeneration += 1;
      seekerCache.clear();
      inFlight.clear();
      return;
    }

    const prefix = `${walletAddress}:`;
    const keys = new Set<string>();
    for (const key of seekerCache.keys()) {
      if (key.startsWith(prefix)) keys.add(key);
    }
    for (const key of inFlight.keys()) {
      if (key.startsWith(prefix)) keys.add(key);
    }

    for (const key of keys) {
      bumpKeyGeneration(key);
      seekerCache.delete(key);
      inFlight.delete(key);
    }
  }

  return {
    verifySeekerCached,
    clearSeekerVerificationCache,
  };
}
