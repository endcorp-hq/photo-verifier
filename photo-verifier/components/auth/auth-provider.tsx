import { createContext, type PropsWithChildren, use, useMemo } from 'react'
import { useMobileWallet } from '@/components/solana/use-mobile-wallet'
import { Account, useAuthorization } from '@/components/solana/use-authorization'
import { useMutation, useQuery } from '@tanstack/react-query'
import { AppConfig } from '@/constants/app-config'
import { clearSeekerVerificationCache, verifySeekerCached } from '@/utils/seeker-verification'

export interface AuthState {
  isAuthenticated: boolean
  isSeekerVerified: boolean
  seekerMint: string | null
  seekerVerificationError: string | null
  isVerifyingSeeker: boolean
  isLoading: boolean
  signIn: () => Promise<Account>
  signOut: () => Promise<void>
  refreshSeekerVerification: () => Promise<{ isVerified: boolean; mint: string | null }>
}

const Context = createContext<AuthState>({} as AuthState)

export function useAuth() {
  const value = use(Context)
  if (!value) {
    throw new Error('useAuth must be wrapped in a <AuthProvider />')
  }

  return value
}

function useSignInMutation() {
  const { connect } = useMobileWallet()

  return useMutation({
    mutationFn: async () => await connect(),
  })
}

export function AuthProvider({ children }: PropsWithChildren) {
  const { disconnect } = useMobileWallet()
  const { accounts, isLoading, selectedAccount } = useAuthorization()
  const signInMutation = useSignInMutation()
  const walletAddress = selectedAccount?.publicKey?.toBase58() ?? null

  const seekerVerification = useQuery({
    queryKey: ['seeker-verification', walletAddress, AppConfig.seeker.verificationRpcUrl],
    enabled: !!walletAddress,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
    queryFn: async () => {
      if (!walletAddress) return { isVerified: false, mint: null }
      return await verifySeekerCached({
        walletAddress,
        rpcUrl: AppConfig.seeker.verificationRpcUrl,
      })
    },
  })

  const isSeekerVerified = seekerVerification.data?.isVerified === true
  const seekerMint = seekerVerification.data?.mint ?? null
  const seekerVerificationError = seekerVerification.error
    ? seekerVerification.error instanceof Error
      ? seekerVerification.error.message
      : String(seekerVerification.error)
    : null
  const isVerifyingSeeker = !!selectedAccount?.publicKey && seekerVerification.isLoading

  const value: AuthState = useMemo(
    () => ({
      signIn: async () => await signInMutation.mutateAsync(),
      signOut: async () => {
        if (walletAddress) clearSeekerVerificationCache(walletAddress)
        await disconnect()
      },
      isAuthenticated: (accounts?.length ?? 0) > 0,
      isSeekerVerified,
      seekerMint,
      seekerVerificationError,
      isVerifyingSeeker,
      isLoading: signInMutation.isPending || isLoading || isVerifyingSeeker,
      refreshSeekerVerification: async () => {
        if (!walletAddress) return { isVerified: false, mint: null }
        clearSeekerVerificationCache(walletAddress)
        const refreshed = await seekerVerification.refetch()
        return refreshed.data ?? { isVerified: false, mint: null }
      },
    }),
    [
      accounts,
      disconnect,
      isLoading,
      isSeekerVerified,
      isVerifyingSeeker,
      seekerMint,
      seekerVerification,
      seekerVerificationError,
      signInMutation,
      walletAddress,
    ],
  )

  return <Context value={value}>{children}</Context>
}
