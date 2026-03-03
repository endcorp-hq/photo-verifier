import { useMemo } from 'react'
import { useAuthorization } from '@/features/wallet-auth/use-authorization'

export function useAuthSessionState() {
  const { accounts, isLoading, selectedAccount } = useAuthorization()

  return useMemo(
    () => ({
      accounts,
      isAuthorizationLoading: isLoading,
      selectedAccount,
      walletAddress: selectedAccount?.publicKey?.toBase58() ?? null,
      isAuthenticated: (accounts?.length ?? 0) > 0,
    }),
    [accounts, isLoading, selectedAccount],
  )
}
