import { createContext, type PropsWithChildren, use, useMemo } from 'react'
import { useAuthSessionState } from './use-auth-session-state'
import { useAuthWalletActions } from './use-auth-wallet-actions'
import { useSeekerVerificationState } from './use-seeker-verification-state'
import type { AuthState } from './auth-types'

const Context = createContext<AuthState | undefined>(undefined)

export function useAuth() {
  const value = use(Context)
  if (!value) {
    throw new Error('useAuth must be wrapped in a <AuthProvider />')
  }

  return value
}

export function AuthProvider({ children }: PropsWithChildren) {
  const sessionState = useAuthSessionState()
  const walletActions = useAuthWalletActions(sessionState.walletAddress)
  const seekerState = useSeekerVerificationState(sessionState.walletAddress)

  const value: AuthState = useMemo(
    () => ({
      signIn: walletActions.signIn,
      signOut: walletActions.signOut,
      isAuthenticated: sessionState.isAuthenticated,
      isSeekerVerified: seekerState.isSeekerVerified,
      seekerMint: seekerState.seekerMint,
      seekerVerificationError: seekerState.seekerVerificationError,
      isVerifyingSeeker: seekerState.isVerifyingSeeker,
      isLoading:
        walletActions.isSignInPending ||
        sessionState.isAuthorizationLoading ||
        seekerState.isVerifyingSeeker,
      refreshSeekerVerification: seekerState.refreshSeekerVerification,
    }),
    [
      seekerState.isSeekerVerified,
      seekerState.seekerMint,
      seekerState.seekerVerificationError,
      seekerState.isVerifyingSeeker,
      seekerState.refreshSeekerVerification,
      sessionState.isAuthenticated,
      sessionState.isAuthorizationLoading,
      walletActions.isSignInPending,
      walletActions.signIn,
      walletActions.signOut,
    ],
  )

  return <Context value={value}>{children}</Context>
}
