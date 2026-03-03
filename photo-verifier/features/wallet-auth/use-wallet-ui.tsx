import { transact } from '@solana-mobile/mobile-wallet-adapter-protocol-web3js'
import { SignInPayload } from '@solana-mobile/mobile-wallet-adapter-protocol'
import { Transaction, TransactionSignature, VersionedTransaction } from '@solana/web3.js'
import { useCallback, useMemo } from 'react'
import { Account, useAuthorization } from './use-authorization'
import {
  asWalletOperationError,
  isRetryableWalletAuthorizationFailure,
  type WalletOperation,
} from './wallet-operation-errors'

async function runWalletOperationWithRetry<T>(
  operation: WalletOperation,
  perform: () => Promise<T>
): Promise<T> {
  try {
    return await perform()
  } catch (error) {
    if (!isRetryableWalletAuthorizationFailure(error)) {
      throw asWalletOperationError(operation, error, false)
    }

    try {
      return await perform()
    } catch (retryError) {
      throw asWalletOperationError(operation, retryError, true)
    }
  }
}

export function useWalletUi() {
  const { selectedAccount, authorizeSessionWithSignIn, authorizeSession, deauthorizeSessions } = useAuthorization()

  const connect = useCallback(
    async (): Promise<Account> =>
      await transact((wallet) => runWalletOperationWithRetry('connect', () => authorizeSession(wallet))),
    [authorizeSession],
  )

  const signIn = useCallback(
    async (signInPayload: SignInPayload): Promise<Account> =>
      await transact((wallet) =>
        runWalletOperationWithRetry('sign_in', () =>
          authorizeSessionWithSignIn(wallet, signInPayload),
        ),
      ),
    [authorizeSessionWithSignIn],
  )

  const disconnect = useCallback(async (): Promise<void> => {
    await deauthorizeSessions()
  }, [deauthorizeSessions])

  const signAndSendTransaction = useCallback(
    async (transaction: Transaction | VersionedTransaction, minContextSlot: number): Promise<TransactionSignature> =>
      await transact((wallet) =>
        runWalletOperationWithRetry('sign_and_send_transaction', async () => {
          await authorizeSession(wallet)
          const signatures = await wallet.signAndSendTransactions({
            transactions: [transaction],
            minContextSlot,
          })
          const signature = signatures[0]
          if (!signature) {
            throw new Error('Wallet returned no transaction signature')
          }
          return signature
        }),
      ),
    [authorizeSession],
  )

  const signMessage = useCallback(
    async (message: Uint8Array): Promise<Uint8Array> =>
      await transact((wallet) =>
        runWalletOperationWithRetry('sign_message', async () => {
          const authResult = await authorizeSession(wallet)
          const signedMessages = await wallet.signMessages({
            addresses: [authResult.address],
            payloads: [message],
          })
          const signedMessage = signedMessages[0]
          if (!signedMessage) {
            throw new Error('Wallet returned no signed message')
          }
          return signedMessage
        }),
      ),
    [authorizeSession],
  )

  return useMemo(
    () => ({
      account: selectedAccount,
      connect,
      disconnect,
      signAndSendTransaction,
      signIn,
      signMessage,
    }),
    [connect, disconnect, selectedAccount, signAndSendTransaction, signIn, signMessage],
  )
}
