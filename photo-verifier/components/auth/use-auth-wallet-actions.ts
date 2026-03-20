import { useCallback } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useWalletUi } from '@/features/wallet-auth/use-wallet-ui'
import { clearSeekerVerificationCache } from '@/utils/seeker-verification'

export function useAuthWalletActions(walletAddress: string | null) {
  const { connect, disconnect } = useWalletUi()
  const signInMutation = useMutation({
    mutationFn: connect,
  })

  const signOut = useCallback(async () => {
    if (walletAddress) clearSeekerVerificationCache(walletAddress)
    await disconnect()
  }, [disconnect, walletAddress])

  return {
    signIn: signInMutation.mutateAsync,
    signOut,
    isSignInPending: signInMutation.isPending,
  }
}
