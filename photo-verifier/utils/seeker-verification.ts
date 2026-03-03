import { verifySeeker } from '@endcorp/photoverifier-sdk'

type SeekerVerificationResult = {
  isVerified: boolean
  mint: string | null
}

const CACHE_TTL_MS = 5 * 60 * 1000

const seekerCache = new Map<string, { expiresAt: number; value: SeekerVerificationResult }>()
const inFlight = new Map<string, Promise<SeekerVerificationResult>>()

function getCacheKey(walletAddress: string, rpcUrl: string): string {
  return `${walletAddress}:${rpcUrl}`
}

export async function verifySeekerCached(params: {
  walletAddress: string
  rpcUrl: string
  force?: boolean
}): Promise<SeekerVerificationResult> {
  const cacheKey = getCacheKey(params.walletAddress, params.rpcUrl)
  const now = Date.now()

  if (!params.force) {
    const cached = seekerCache.get(cacheKey)
    if (cached && cached.expiresAt > now) {
      return cached.value
    }
  }

  const pending = inFlight.get(cacheKey)
  if (pending) return pending

  const request = verifySeeker({
    walletAddress: params.walletAddress,
    rpcUrl: params.rpcUrl,
  })
    .then(result => {
      seekerCache.set(cacheKey, {
        expiresAt: Date.now() + CACHE_TTL_MS,
        value: result,
      })
      return result
    })
    .finally(() => {
      inFlight.delete(cacheKey)
    })

  inFlight.set(cacheKey, request)
  return request
}

export function clearSeekerVerificationCache(walletAddress?: string): void {
  if (!walletAddress) {
    seekerCache.clear()
    inFlight.clear()
    return
  }

  const prefix = `${walletAddress}:`
  for (const key of [...seekerCache.keys()]) {
    if (key.startsWith(prefix)) seekerCache.delete(key)
  }
  for (const key of [...inFlight.keys()]) {
    if (key.startsWith(prefix)) inFlight.delete(key)
  }
}
