import { createContext, type PropsWithChildren, use, useMemo } from 'react'
import { useMobileWallet } from '@/components/solana/use-mobile-wallet'
import { Account, useAuthorization } from '@/components/solana/use-authorization'
import { useMutation, useQuery } from '@tanstack/react-query'
import { AppConfig } from '@/constants/app-config'
import { verifySeeker } from '@photoverifier/sdk'

export interface AuthState {
  isAuthenticated: boolean
  isSeekerVerified: boolean
  seekerMint: string | null
  seekerVerificationError: string | null
  isVerifyingSeeker: boolean
  isLoading: boolean
  signIn: () => Promise<Account>
  signOut: () => Promise<void>
  refreshSeekerVerification: () => Promise<void>
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

  const seekerVerification = useQuery({
    queryKey: ['seeker-verification', selectedAccount?.publicKey.toBase58(), AppConfig.seeker.verificationRpcUrl],
    enabled: !!selectedAccount?.publicKey,
    staleTime: 60_000,
    retry: 1,
    queryFn: async () => {
      if (!selectedAccount?.publicKey) return { isVerified: false, mint: null }
      return await verifySeeker({
        walletAddress: selectedAccount.publicKey.toBase58(),
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
      signOut: async () => await disconnect(),
      isAuthenticated: (accounts?.length ?? 0) > 0,
      isSeekerVerified,
      seekerMint,
      seekerVerificationError,
      isVerifyingSeeker,
      isLoading: signInMutation.isPending || isLoading || isVerifyingSeeker,
      refreshSeekerVerification: async () => {
        await seekerVerification.refetch()
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
    ],
  )

  return <Context value={value}>{children}</Context>
}
