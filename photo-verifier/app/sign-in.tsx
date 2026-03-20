import { useEffect, useState } from 'react'
import { router } from 'expo-router'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuth } from '@/components/auth/auth-provider'

export default function SignIn() {
  const {
    isAuthenticated,
    isSeekerVerified,
    isVerifyingSeeker,
    signIn,
    signOut,
    refreshSeekerVerification,
  } = useAuth()
  const [signInError, setSignInError] = useState<string | null>(null)

  useEffect(() => {
    if (isAuthenticated && isSeekerVerified) {
      router.replace('/(tabs)/camera')
    }
  }, [isAuthenticated, isSeekerVerified])

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#07101c', '#0d2237', '#123f50']} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerBlock}>
          <Image source={require('../assets/images/logo.png')} style={styles.logo} contentFit="contain" />
          <Text style={styles.title}>Photo Verifier</Text>
          <Text style={styles.subtitle}>Wallet + Seeker Genesis Token required for verification</Text>
          {isVerifyingSeeker ? <ActivityIndicator size="small" color="#66f5c5" /> : null}
        </View>

        <View style={styles.actions}>
          {!isAuthenticated ? (
            <Pressable
              style={styles.primaryButton}
              onPress={async () => {
                try {
                  setSignInError(null)
                  await signIn()
                } catch (error: any) {
                  setSignInError(error?.message ?? 'Failed to connect wallet. Please try again.')
                }
              }}
            >
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
              <Pressable style={styles.secondaryButton} onPress={() => signOut()}>
                <Text style={styles.secondaryButtonText}>Disconnect Wallet</Text>
              </Pressable>
            </>
          )}
          {signInError ? <Text style={styles.errorText}>{signInError}</Text> : null}
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
    paddingHorizontal: 18,
    paddingVertical: 20,
  },
  centerBlock: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
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
    textAlign: 'center',
    maxWidth: 280,
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
  errorText: {
    color: '#ffd0d0',
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
})
