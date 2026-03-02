import AsyncStorage from '@react-native-async-storage/async-storage'
import { PublicKey, PublicKeyInitData } from '@solana/web3.js'
import {
  Account as AuthorizedAccount,
  AppIdentity,
  AuthorizationResult,
  AuthorizeAPI,
  AuthToken,
  Base64EncodedAddress,
  DeauthorizeAPI,
  SignInPayload,
} from '@solana-mobile/mobile-wallet-adapter-protocol'
import { toUint8Array } from 'js-base64'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'
import { useCluster } from '@/components/cluster/cluster-provider'
import { WalletIcon } from '@wallet-standard/core'
import { ellipsify } from '@/utils/ellipsify'
import { AppConfig } from '@/constants/app-config'

const identity: AppIdentity = { name: AppConfig.name, uri: AppConfig.uri }
const AUTHORIZATION_STORAGE_KEY_PREFIX = 'authorization-cache'
const LEGACY_AUTHORIZATION_STORAGE_KEY = 'authorization-cache'

export type Account = Readonly<{
  address: Base64EncodedAddress
  displayAddress?: string
  icon?: WalletIcon
  label?: string
  publicKey: PublicKey
}>

type WalletAuthorization = Readonly<{
  accounts: Account[]
  authToken: AuthToken
  selectedAccount: Account
}>

function getStorageKeyForChain(chainId: string): string {
  return `${AUTHORIZATION_STORAGE_KEY_PREFIX}:${chainId}`
}

function getQueryKeyForChain(chainId: string): readonly [string, string] {
  return ['wallet-authorization', chainId]
}

function getAccountFromAuthorizedAccount(account: AuthorizedAccount): Account {
  const publicKey = getPublicKeyFromAddress(account.address)
  return {
    address: account.address,
    // TODO: Fix?
    displayAddress: (account as unknown as { display_address: string }).display_address,
    icon: account.icon,
    label: account.label ?? ellipsify(publicKey.toString(), 8),
    publicKey,
  }
}

function getAuthorizationFromAuthorizationResult(
  authorizationResult: AuthorizationResult,
  previouslySelectedAccount?: Account,
): WalletAuthorization {
  let selectedAccount: Account
  if (
    previouslySelectedAccount == null ||
    !authorizationResult.accounts.some(({ address }) => address === previouslySelectedAccount.address)
  ) {
    const firstAccount = authorizationResult.accounts[0]
    selectedAccount = getAccountFromAuthorizedAccount(firstAccount)
  } else {
    selectedAccount = previouslySelectedAccount
  }
  return {
    accounts: authorizationResult.accounts.map(getAccountFromAuthorizedAccount),
    authToken: authorizationResult.auth_token,
    selectedAccount,
  }
}

function getPublicKeyFromAddress(address: Base64EncodedAddress): PublicKey {
  const publicKeyByteArray = toUint8Array(address)
  return new PublicKey(publicKeyByteArray)
}

function cacheReviver(key: string, value: any) {
  if (key === 'publicKey') {
    return new PublicKey(value as PublicKeyInitData)
  } else {
    return value
  }
}

async function parseAuthorization(value: string | null): Promise<WalletAuthorization | null> {
  if (!value) return null
  try {
    return JSON.parse(value, cacheReviver)
  } catch {
    return null
  }
}

function usePersistAuthorization(storageKey: string, queryKey: readonly [string, string]) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (auth: WalletAuthorization | null): Promise<void> => {
      if (auth == null) {
        await AsyncStorage.removeItem(storageKey)
      } else {
        await AsyncStorage.setItem(storageKey, JSON.stringify(auth))
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey })
    },
  })
}

function useFetchAuthorization(storageKey: string, queryKey: readonly [string, string]) {
  return useQuery({
    queryKey,
    queryFn: async (): Promise<WalletAuthorization | null> => {
      const cacheFetchResult = await AsyncStorage.getItem(storageKey)
      const parsed = await parseAuthorization(cacheFetchResult)
      if (parsed) return parsed

      // One-time migration from the legacy single-key cache.
      const legacy = await AsyncStorage.getItem(LEGACY_AUTHORIZATION_STORAGE_KEY)
      const legacyParsed = await parseAuthorization(legacy)
      if (legacyParsed) {
        await AsyncStorage.setItem(storageKey, JSON.stringify(legacyParsed))
        await AsyncStorage.removeItem(LEGACY_AUTHORIZATION_STORAGE_KEY)
      }
      return legacyParsed
    },
  })
}

function useInvalidateAuthorizations(queryKey: readonly [string, string]) {
  const client = useQueryClient()
  return () => client.invalidateQueries({ queryKey })
}

export function useAuthorization() {
  const { selectedCluster } = useCluster()
  const storageKey = useMemo(() => getStorageKeyForChain(selectedCluster.id), [selectedCluster.id])
  const queryKey = useMemo(() => getQueryKeyForChain(selectedCluster.id), [selectedCluster.id])

  const fetchQuery = useFetchAuthorization(storageKey, queryKey)
  const invalidateAuthorizations = useInvalidateAuthorizations(queryKey)
  const persistMutation = usePersistAuthorization(storageKey, queryKey)

  const handleAuthorizationResult = useCallback(
    async (authorizationResult: AuthorizationResult): Promise<WalletAuthorization> => {
      const nextAuthorization = getAuthorizationFromAuthorizationResult(
        authorizationResult,
        fetchQuery.data?.selectedAccount,
      )
      await persistMutation.mutateAsync(nextAuthorization)
      return nextAuthorization
    },
    [fetchQuery.data?.selectedAccount, persistMutation],
  )

  const authorizeSession = useCallback(
    async (wallet: AuthorizeAPI) => {
      const cachedAuthToken = fetchQuery.data?.authToken

      try {
        const authorizationResult = await wallet.authorize({
          identity,
          chain: selectedCluster.id as any,
          auth_token: cachedAuthToken,
        })
        return (await handleAuthorizationResult(authorizationResult)).selectedAccount
      } catch (error) {
        if (!cachedAuthToken) throw error

        // Retry once without stale token.
        await persistMutation.mutateAsync(null)
        const authorizationResult = await wallet.authorize({
          identity,
          chain: selectedCluster.id as any,
        })
        return (await handleAuthorizationResult(authorizationResult)).selectedAccount
      }
    },
    [fetchQuery.data?.authToken, handleAuthorizationResult, persistMutation, selectedCluster.id],
  )

  const authorizeSessionWithSignIn = useCallback(
    async (wallet: AuthorizeAPI, signInPayload: SignInPayload) => {
      const cachedAuthToken = fetchQuery.data?.authToken

      try {
        const authorizationResult = await wallet.authorize({
          identity,
          chain: selectedCluster.id as any,
          auth_token: cachedAuthToken,
          sign_in_payload: signInPayload,
        })
        return (await handleAuthorizationResult(authorizationResult)).selectedAccount
      } catch (error) {
        if (!cachedAuthToken) throw error

        await persistMutation.mutateAsync(null)
        const authorizationResult = await wallet.authorize({
          identity,
          chain: selectedCluster.id as any,
          sign_in_payload: signInPayload,
        })
        return (await handleAuthorizationResult(authorizationResult)).selectedAccount
      }
    },
    [fetchQuery.data?.authToken, handleAuthorizationResult, persistMutation, selectedCluster.id],
  )

  const deauthorizeSession = useCallback(
    async (wallet: DeauthorizeAPI) => {
      if (fetchQuery.data?.authToken == null) {
        return
      }
      await wallet.deauthorize({ auth_token: fetchQuery.data.authToken })
      await persistMutation.mutateAsync(null)
    },
    [fetchQuery.data?.authToken, persistMutation],
  )

  const deauthorizeSessions = useCallback(async () => {
    await invalidateAuthorizations()

    const keys = await AsyncStorage.getAllKeys()
    const authKeys = keys.filter(
      key => key === LEGACY_AUTHORIZATION_STORAGE_KEY || key.startsWith(`${AUTHORIZATION_STORAGE_KEY_PREFIX}:`),
    )
    if (authKeys.length > 0) {
      await AsyncStorage.multiRemove(authKeys)
    }

    await persistMutation.mutateAsync(null)
  }, [invalidateAuthorizations, persistMutation])

  return useMemo(
    () => ({
      accounts: fetchQuery.data?.accounts ?? null,
      authorizeSession,
      authorizeSessionWithSignIn,
      deauthorizeSession,
      deauthorizeSessions,
      isLoading: fetchQuery.isLoading,
      selectedAccount: fetchQuery.data?.selectedAccount ?? null,
    }),
    [
      authorizeSession,
      authorizeSessionWithSignIn,
      deauthorizeSession,
      deauthorizeSessions,
      fetchQuery.data?.accounts,
      fetchQuery.data?.selectedAccount,
      fetchQuery.isLoading,
    ],
  )
}
