import { WalletUiDropdown } from '@/components/solana/ui/wallet-ui-dropdown'
import { Stack } from 'expo-router'

export default function GalleryLayout() {
  return (
    <Stack screenOptions={{ headerTitle: 'Gallery', headerRight: () => <WalletUiDropdown /> }}>
      <Stack.Screen name="index" />
    </Stack>
  )
}
