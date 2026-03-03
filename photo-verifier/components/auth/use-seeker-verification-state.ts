import { useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { SeekerVerificationResult } from '@endcorp/photoverifier-sdk'
import { AppConfig } from '@/constants/app-config'
import { clearSeekerVerificationCache, unverifiedSeekerResult, verifySeekerCached } from '@/utils/seeker-verification'

export function useSeekerVerificationState(walletAddress: string | null) {
  const seekerVerification = useQuery({
    queryKey: ['seeker-verification', walletAddress, AppConfig.seeker.verificationRpcUrl],
    enabled: !!walletAddress,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
    queryFn: async () => {
      if (!walletAddress) return unverifiedSeekerResult('wallet_missing')
      return verifySeekerCached({
        walletAddress,
        rpcUrl: AppConfig.seeker.verificationRpcUrl,
      })
    },
  })

  const isSeekerVerified = seekerVerification.data?.isVerified === true
  const seekerMint = seekerVerification.data?.seekerMint ?? null
  const seekerVerificationError =
    seekerVerification.data?.status === 'verification_unavailable'
      ? seekerVerification.data.reason
      : seekerVerification.error
        ? seekerVerification.error instanceof Error
          ? seekerVerification.error.message
          : String(seekerVerification.error)
        : null
  const isVerifyingSeeker = !!walletAddress && seekerVerification.isLoading

  const refreshSeekerVerification = useCallback(async (): Promise<SeekerVerificationResult> => {
    if (!walletAddress) return unverifiedSeekerResult('wallet_missing')
    clearSeekerVerificationCache(walletAddress)
    const refreshed = await seekerVerification.refetch()
    return refreshed.data ?? unverifiedSeekerResult('refresh_failed')
  }, [seekerVerification, walletAddress])

  return useMemo(
    () => ({
      isSeekerVerified,
      seekerMint,
      seekerVerificationError,
      isVerifyingSeeker,
      refreshSeekerVerification,
    }),
    [isSeekerVerified, isVerifyingSeeker, refreshSeekerVerification, seekerMint, seekerVerificationError],
  )
}
