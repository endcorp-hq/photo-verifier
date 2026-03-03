import { PublicKey, TransactionSignature } from '@solana/web3.js'
import { useConnection } from '@/features/solana/providers/solana-provider'
import { useMutation } from '@tanstack/react-query'
import { useWalletUi } from '@/features/wallet-auth/use-wallet-ui'
import { createTransaction } from '@/features/account/hooks/create-transaction'
import { useGetBalanceInvalidate } from './use-get-balance'

export function useTransferSol({ address }: { address: PublicKey }) {
  const connection = useConnection()
  const { signAndSendTransaction } = useWalletUi()
  const invalidateBalance = useGetBalanceInvalidate({ address })

  return useMutation({
    mutationKey: ['transfer-sol', { endpoint: connection.rpcEndpoint, address }],
    mutationFn: async (input: { destination: PublicKey; amount: number }) => {
      let signature: TransactionSignature = ''
      try {
        const { transaction, latestBlockhash, minContextSlot } = await createTransaction({
          publicKey: address,
          destination: input.destination,
          amount: input.amount,
          connection,
        })

        // Send transaction and await for signature
        signature = await signAndSendTransaction(transaction, minContextSlot)

        // Confirm transaction and surface any failures to React Query
        await connection.confirmTransaction({ signature, ...latestBlockhash }, 'confirmed')
        return signature
      } catch (error: unknown) {
        const cause = error instanceof Error ? error.message : String(error)
        throw new Error(`Transaction failed${signature ? ` (${signature})` : ''}: ${cause}`)
      }
    },
    onSuccess: async (signature) => {
      console.log(signature)
      await invalidateBalance()
    },
    onError: (error) => {
      console.error(`Transaction failed! ${error}`)
    },
  })
}
