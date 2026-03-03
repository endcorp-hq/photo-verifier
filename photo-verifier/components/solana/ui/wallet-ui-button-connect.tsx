import { useWalletUi } from '@/features/wallet-auth/use-wallet-ui'
import { BaseButton } from '@/components/solana/ui/base-button'
import React from 'react'

export function WalletUiButtonConnect({ label = 'Connect' }: { label?: string }) {
  const { connect } = useWalletUi()

  return <BaseButton label={label} onPress={() => connect()} />
}
