import { type SeekerVerificationResult, verifySeeker } from '@endcorp/photoverifier-sdk'
import { createSeekerVerificationCache } from './seeker-verification-cache'

const seekerCache = createSeekerVerificationCache({
  verifySeekerFn: verifySeeker,
})

export function unverifiedSeekerResult(reason = 'not_verified'): SeekerVerificationResult {
  return {
    status: 'not_verified',
    isVerified: false,
    isSeeker: false,
    seekerMint: null,
    mint: null,
    reason,
  }
}

export async function verifySeekerCached(params: {
  walletAddress: string
  rpcUrl: string
  force?: boolean
}): Promise<SeekerVerificationResult> {
  return seekerCache.verifySeekerCached(params)
}

export function clearSeekerVerificationCache(walletAddress?: string): void {
  seekerCache.clearSeekerVerificationCache(walletAddress)
}
