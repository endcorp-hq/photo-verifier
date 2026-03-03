import { useWalletUi } from '@/features/wallet-auth/use-wallet-ui'
import { BaseButton } from '@/components/solana/ui/base-button'
import React from 'react'

export function WalletUiButtonDisconnect({ label = 'Disconnect' }: { label?: string }) {
  const { disconnect } = useWalletUi()

  return <BaseButton label={label} onPress={() => disconnect()} />
}
