import type { SeekerVerificationResult } from '@endcorp/photoverifier-sdk'
import type { Account } from '@/features/wallet-auth/use-authorization'

export interface AuthState {
  isAuthenticated: boolean
  isSeekerVerified: boolean
  seekerMint: string | null
  seekerVerificationError: string | null
  isVerifyingSeeker: boolean
  isLoading: boolean
  signIn: () => Promise<Account>
  signOut: () => Promise<void>
  refreshSeekerVerification: () => Promise<SeekerVerificationResult>
}
