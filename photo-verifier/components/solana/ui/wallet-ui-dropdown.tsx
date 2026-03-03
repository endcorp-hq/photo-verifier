import React from 'react'
import { StyleSheet, TouchableOpacity } from 'react-native'
import { useWalletUi } from '@/features/wallet-auth/use-wallet-ui'
import { ellipsify } from '@/utils/ellipsify'
import { UiIconSymbol } from '@/components/ui/ui-icon-symbol'
import { AppText } from '@/components/app-text'
import { useWalletUiTheme } from '@/components/solana/ui/use-wallet-ui-theme'
import { WalletUiButtonConnect } from './wallet-ui-button-connect'

export function WalletUiDropdown() {
  const { account, disconnect } = useWalletUi()
  const { backgroundColor, borderColor, textColor } = useWalletUiTheme()

  if (!account) {
    return <WalletUiButtonConnect />
  }

  return (
    <TouchableOpacity
      style={[styles.trigger, { backgroundColor, borderColor }]}
      onPress={() => {
        void disconnect()
      }}
      accessibilityRole="button"
      accessibilityLabel="Disconnect wallet"
    >
      <UiIconSymbol name="wallet.pass.fill" color={textColor} />
      <AppText>{ellipsify(account.publicKey.toString())}</AppText>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  trigger: {
    alignItems: 'center',
    borderRadius: 50,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
})
