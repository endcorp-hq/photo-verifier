import { useEffect } from 'react'
import { router } from 'expo-router'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuth } from '@/components/auth/auth-provider'
import { useWalletUi } from '@/components/solana/use-wallet-ui'

function ellipsify(value: string, start = 6, end = 6): string {
  if (value.length <= start + end + 3) return value
  return `${value.slice(0, start)}...${value.slice(-end)}`
}

export default function SignIn() {
  const {
    isAuthenticated,
    isSeekerVerified,
    seekerMint,
    seekerVerificationError,
    isVerifyingSeeker,
    signIn,
    refreshSeekerVerification,
  } = useAuth()
  const { account, disconnect } = useWalletUi()

  useEffect(() => {
    if (isAuthenticated && isSeekerVerified) {
      router.replace('/(tabs)/camera')
    }
  }, [isAuthenticated, isSeekerVerified])

  const walletLabel = account?.publicKey ? ellipsify(account.publicKey.toBase58()) : null

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#07101c', '#0d2237', '#123f50']} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.headerBlock}>
          <Image source={require('../assets/images/logo.png')} style={styles.logo} contentFit="contain" />
          <Text style={styles.title}>Photo Verifier</Text>
          <Text style={styles.subtitle}>Wallet + Seeker verification required</Text>
        </View>

        <View style={styles.panel}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Wallet</Text>
            <Text style={styles.rowValue}>{walletLabel ?? 'Not connected'}</Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.rowLabel}>Seeker NFT</Text>
            {isVerifyingSeeker ? (
              <View style={styles.rowInline}>
                <ActivityIndicator size="small" color="#66f5c5" />
                <Text style={styles.rowValue}>Verifying...</Text>
              </View>
            ) : (
              <Text style={styles.rowValue}>{isSeekerVerified ? 'Verified' : 'Not verified'}</Text>
            )}
          </View>

          {!!seekerMint && (
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Mint</Text>
              <Text style={styles.rowValue}>{ellipsify(seekerMint, 8, 8)}</Text>
            </View>
          )}

          {!!seekerVerificationError && (
            <Text style={styles.errorText}>Verification error: {seekerVerificationError}</Text>
          )}
        </View>

        <View style={styles.actions}>
          {!isAuthenticated ? (
            <Pressable style={styles.primaryButton} onPress={() => signIn()}>
              <Text style={styles.primaryButtonText}>Connect Wallet</Text>
            </Pressable>
          ) : isSeekerVerified ? (
            <Pressable style={styles.primaryButton} onPress={() => router.replace('/(tabs)/camera')}>
              <Text style={styles.primaryButtonText}>Continue</Text>
            </Pressable>
          ) : (
            <>
              <Pressable style={styles.primaryButton} onPress={() => refreshSeekerVerification()}>
                <Text style={styles.primaryButtonText}>Retry Verification</Text>
              </Pressable>
              <Pressable style={styles.secondaryButton} onPress={() => disconnect()}>
                <Text style={styles.secondaryButtonText}>Disconnect Wallet</Text>
              </Pressable>
            </>
          )}
        </View>
      </SafeAreaView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 20,
  },
  headerBlock: {
    alignItems: 'center',
    gap: 8,
    marginTop: 24,
  },
  logo: {
    width: 120,
    height: 120,
    borderRadius: 28,
  },
  title: {
    color: '#eff5ff',
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  subtitle: {
    color: '#bed0e7',
    fontSize: 14,
  },
  panel: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(196, 214, 240, 0.34)',
    backgroundColor: 'rgba(7, 18, 33, 0.58)',
    padding: 14,
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  rowInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowLabel: {
    color: '#afc2de',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: '700',
  },
  rowValue: {
    color: '#eef5ff',
    fontSize: 13,
    fontWeight: '600',
  },
  errorText: {
    color: '#ffc8d3',
    fontSize: 12,
    marginTop: 4,
  },
  actions: {
    gap: 10,
    marginBottom: 12,
  },
  primaryButton: {
    height: 50,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#66f5c5',
  },
  primaryButtonText: {
    color: '#061219',
    fontWeight: '800',
    fontSize: 16,
  },
  secondaryButton: {
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(239, 245, 255, 0.44)',
    backgroundColor: 'rgba(8, 20, 35, 0.56)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: '#eff5ff',
    fontWeight: '700',
    fontSize: 14,
  },
})
