import { AppText } from '@/components/app-text'
import { Image } from 'expo-image'
import Constants from 'expo-constants'
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native'

import { AppPage } from '@/components/app-page'

export default function TabSettingsScreen() {
  const endcorpUrl = 'https://endcorp.co'
  const appVersion = (Constants as any)?.expoConfig?.version ?? 'unknown'
  const appName = (Constants as any)?.expoConfig?.name ?? 'Photo Verifier'
  const bucketName = (Constants as any)?.expoConfig?.extra?.s3?.bucket ?? 'photoverifier'
  const presignEndpoint = (Constants as any)?.expoConfig?.extra?.s3?.presignEndpoint ?? 'not-configured'
  const packageId =
    (Constants as any)?.expoConfig?.ios?.bundleIdentifier ||
    (Constants as any)?.expoConfig?.android?.package ||
    'unknown'

  const handleOpenEndcorp = async () => {
    try {
      await Linking.openURL(endcorpUrl)
    } catch {
      // no-op
    }
  }

  return (
    <AppPage>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="automatic"
      >
        <View style={styles.logoWrap}>
          <Image source={require('../../../assets/images/logo.png')} style={styles.logo} contentFit="contain" />
          <AppText type="title" style={styles.title}>
            {appName}
          </AppText>
        </View>

        <View style={styles.card}>
          <AppText type="defaultSemiBold">About</AppText>
          <AppText type="default" style={styles.copy}>
            - Photo capture and BLAKE3 hashing happen on-device before upload.
          </AppText>
          <AppText type="default" style={styles.copy}>
            - The connected wallet signs a canonical integrity payload (hash, H3 cell, timestamp/slot, wallet, nonce).
          </AppText>
          <AppText type="default" style={styles.copy}>
            - Presign API validates this signature and returns an attestation signature used in the on-chain proof.
          </AppText>
          <AppText type="default" style={styles.copy}>
            - Images upload over HTTPS to S3 bucket `{bucketName}` via presigned URL.
          </AppText>
          <AppText type="default" style={styles.copy}>
            - Proof metadata and attestation are written on Solana. Raw image bytes are not stored on-chain.
          </AppText>
          <AppText type="default" style={styles.copy}>
            - This device keeps a local gallery cache (metadata + optional local image copy) for fast viewing.
          </AppText>
          <AppText type="default" style={styles.metaRow}>
            Upload endpoint: {presignEndpoint}
          </AppText>
        </View>

        <View style={styles.card}>
          <AppText type="defaultSemiBold">Endcorp</AppText>
          <Pressable style={styles.endcorpRow} onPress={handleOpenEndcorp}>
            <Image
              source={require('../../../assets/images/endcorp-logomark.png')}
              style={styles.endcorpLogo}
              contentFit="contain"
            />
            <View style={styles.endcorpCopyWrap}>
              <AppText type="defaultSemiBold" style={styles.endcorpTitle}>
                endcorp.co
              </AppText>
              <AppText type="default" style={styles.copy}>
                Visit Endcorp for company and ecosystem updates.
              </AppText>
            </View>
          </Pressable>
        </View>

        <View style={styles.card}>
          <AppText type="defaultSemiBold">Build Info</AppText>
          <AppText type="default" style={styles.metaRow}>
            Version: {appVersion}
          </AppText>
          <AppText type="default" style={styles.metaRow}>
            Identifier: {packageId}
          </AppText>
        </View>
      </ScrollView>
    </AppPage>
  )
}

const styles = StyleSheet.create({
  content: {
    gap: 12,
    paddingBottom: 28,
  },
  logoWrap: {
    alignItems: 'center',
    marginBottom: 4,
    gap: 8,
  },
  logo: {
    width: 96,
    height: 96,
    borderRadius: 24,
  },
  title: {
    fontSize: 30,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    opacity: 0.72,
    textAlign: 'center',
  },
  card: {
    borderWidth: 1,
    borderColor: 'rgba(145, 170, 200, 0.32)',
    borderRadius: 14,
    padding: 14,
    gap: 4,
    backgroundColor: 'rgba(10, 20, 35, 0.18)',
  },
  copy: {
    opacity: 0.82,
  },
  metaRow: {
    opacity: 0.8,
  },
  endcorpRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
    paddingVertical: 4,
  },
  endcorpLogo: {
    borderRadius: 8,
    height: 40,
    width: 40,
  },
  endcorpCopyWrap: {
    flex: 1,
    gap: 2,
  },
  endcorpTitle: {
    lineHeight: 20,
  },
})
