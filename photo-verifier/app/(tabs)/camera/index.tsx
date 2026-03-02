import { CameraType, CameraView, useCameraPermissions } from 'expo-camera'
import * as FileSystem from 'expo-file-system'
import { LinearGradient } from 'expo-linear-gradient'
import * as Location from 'expo-location'
import { Image } from 'expo-image'
import { Base64 } from 'js-base64'
import { Buffer } from 'buffer'
import { useRef, useState } from 'react'
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import Snackbar from 'react-native-snackbar'
import { useCluster } from '@/components/cluster/cluster-provider'
import { useConnection } from '@/components/solana/solana-provider'
import { useWalletUi } from '@/components/solana/use-wallet-ui'
import { AppConfig } from '@/constants/app-config'
import {
  blake3HexFromBytes,
  buildRecordPhotoProofTransaction,
  buildS3KeyForPhoto,
  buildS3Uri,
  getCurrentLocation,
  putToPresignedUrl,
  verifySeeker,
} from '@photoverifier/sdk'
import { canonicalizeIntegrityPayload } from '@/utils/integrity'
import { saveUploadHistoryRecord } from '@/utils/upload-history'
import { PresignError, requestPresignedPut } from '@/utils/s3'

type LocationValue = { latitude: number; longitude: number; accuracy?: number }

async function copyPreviewToAppStorage(previewUri: string, hashHex: string): Promise<string | null> {
  const baseDir = FileSystem.documentDirectory
  if (!baseDir) return null
  const uploadsDir = `${baseDir}uploads`
  await FileSystem.makeDirectoryAsync(uploadsDir, { intermediates: true })
  const localUri = `${uploadsDir}/${Date.now()}-${hashHex.slice(0, 10)}.jpg`
  await FileSystem.copyAsync({ from: previewUri, to: localUri })
  return localUri
}

export default function TabCameraScreen() {
  const [facing, setFacing] = useState<CameraType>('back')
  const [permission, requestPermission] = useCameraPermissions()
  const [isReady, setIsReady] = useState(false)
  const [isTaking, setIsTaking] = useState(false)
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [previewUri, setPreviewUri] = useState<string | null>(null)
  const [photoHashHex, setPhotoHashHex] = useState<string | null>(null)
  const [timestampIso, setTimestampIso] = useState<string | null>(null)
  const [captureTimestampSec, setCaptureTimestampSec] = useState<number | null>(null)
  const [captureSlot, setCaptureSlot] = useState<number | null>(null)
  const [captureBlockhash, setCaptureBlockhash] = useState<string | null>(null)
  const [locationLoading, setLocationLoading] = useState<boolean>(false)
  const [locationValue, setLocationValue] = useState<LocationValue | null>(null)
  const [seekerLoading, setSeekerLoading] = useState<boolean>(false)
  const [seekerMintValue, setSeekerMintValue] = useState<string | null>(null)
  const photoBytesRef = useRef<Uint8Array | null>(null)
  const cameraRef = useRef<any>(null)

  const { account, signAndSendTransaction, signMessage } = useWalletUi()
  const connection = useConnection()
  const { selectedCluster } = useCluster()

  if (!permission) return <View style={styles.container} />

  if (!permission.granted) {
    return (
      <View style={[styles.container, styles.permissionContainer]}>
        <Text style={styles.permissionTitle}>Camera Permission Required</Text>
        <Text style={styles.permissionText}>
          This app needs camera and location access to generate verifiable photo proofs.
        </Text>
        <Pressable onPress={requestPermission} style={styles.permissionButton}>
          <Text style={styles.permissionButtonText}>Grant Camera Access</Text>
        </Pressable>
      </View>
    )
  }

  function toggleCameraFacing() {
    setFacing(current => (current === 'back' ? 'front' : 'back'))
  }

  const ensureForegroundLocationPermission = async (): Promise<boolean> => {
    try {
      const servicesEnabled = await Location.hasServicesEnabledAsync()
      if (!servicesEnabled) {
        Snackbar.show({
          text: 'Location services are disabled. Enable them to include location metadata.',
          duration: Snackbar.LENGTH_SHORT,
          backgroundColor: 'rgba(176,0,32,0.95)',
          textColor: 'white',
          action: {
            text: 'Settings',
            textColor: 'yellow',
            onPress: () => {
              try {
                Linking.openSettings()
              } catch {}
            },
          },
        })
        return false
      }
      let perm = await Location.getForegroundPermissionsAsync()
      if (perm.status !== 'granted') perm = await Location.requestForegroundPermissionsAsync()
      if (perm.status !== 'granted') {
        Snackbar.show({
          text: 'Location permission denied. Open Settings to grant access.',
          duration: Snackbar.LENGTH_SHORT,
          backgroundColor: 'rgba(176,0,32,0.95)',
          textColor: 'white',
          action: {
            text: 'Settings',
            textColor: 'yellow',
            onPress: () => {
              try {
                Linking.openSettings()
              } catch {}
            },
          },
        })
        return false
      }
      return true
    } catch {
      return false
    }
  }

  const handleTakePicture = async () => {
    if (!isReady || isTaking || isSubmitting) return
    try {
      setIsTaking(true)
      const captured = await cameraRef.current?.takePictureAsync({
        base64: true,
        skipProcessing: true,
      } as any)
      if (!captured?.uri) throw new Error('Unable to capture photo')

      setPreviewUri(captured.uri)
      setIsPreviewing(true)

      const base64 =
        typeof captured.base64 === 'string'
          ? captured.base64
          : await FileSystem.readAsStringAsync(captured.uri, {
              encoding: FileSystem.EncodingType.Base64,
            })
      const bytes = Uint8Array.from(Buffer.from(base64, 'base64'))
      photoBytesRef.current = bytes
      setPhotoHashHex(blake3HexFromBytes(bytes))

      const blockAnchorPromise: Promise<{ slot: number; blockhash: string; timestampSec: number | null } | null> =
        (async () => {
          try {
            const latest = await connection.getLatestBlockhashAndContext()
            const slot = latest.context.slot
            const blockhash = latest.value.blockhash
            const timestampSec = await connection.getBlockTime(slot)
            return { slot, blockhash, timestampSec }
          } catch {
            return null
          }
        })()

      const canUseLocation = await ensureForegroundLocationPermission()
      setLocationLoading(true)
      const locationPromise = canUseLocation ? getCurrentLocation() : Promise.resolve(null)

      setSeekerLoading(true)
      const seekerPromise = (async () => {
        try {
          const ownerStr = account?.publicKey?.toString()
          if (!ownerStr) return null
          const res = await verifySeeker({
            walletAddress: ownerStr,
            rpcUrl: AppConfig.seeker.verificationRpcUrl,
          })
          return res.isVerified ? res.mint : null
        } catch {
          return null
        }
      })()

      Promise.allSettled([locationPromise, seekerPromise, blockAnchorPromise])
        .then(([locRes, seekerRes, blockRes]) => {
          const computedLocation = locRes.status === 'fulfilled' ? locRes.value : null
          const computedSeekerMint = seekerRes.status === 'fulfilled' ? seekerRes.value : null
          const blockAnchor = blockRes.status === 'fulfilled' ? blockRes.value : null

          setLocationValue(computedLocation)
          setLocationLoading(false)
          setSeekerMintValue(computedSeekerMint)
          setSeekerLoading(false)

          if (blockAnchor?.slot != null) setCaptureSlot(blockAnchor.slot)
          if (blockAnchor?.blockhash) setCaptureBlockhash(blockAnchor.blockhash)
          if (typeof blockAnchor?.timestampSec === 'number') {
            setCaptureTimestampSec(blockAnchor.timestampSec)
            setTimestampIso(new Date(blockAnchor.timestampSec * 1000).toISOString())
          } else {
            setCaptureTimestampSec(null)
            setTimestampIso(null)
          }
        })
        .catch(() => {
          setLocationLoading(false)
          setSeekerLoading(false)
        })
    } catch (e: any) {
      Snackbar.show({
        text: `Error: ${e?.message ?? 'Unknown error'}`,
        duration: Snackbar.LENGTH_SHORT,
        backgroundColor: 'rgba(176, 0, 32, 0.95)',
        textColor: 'white',
      })
    } finally {
      setIsTaking(false)
    }
  }

  const ensureSeekerMint = async (): Promise<string | null> => {
    if (seekerMintValue) return seekerMintValue
    try {
      const ownerStr = account?.publicKey?.toString()
      if (!ownerStr) return null
      setSeekerLoading(true)
      const res = await verifySeeker({
        walletAddress: ownerStr,
        rpcUrl: AppConfig.seeker.verificationRpcUrl,
      })
      const mint = res.isVerified ? res.mint : null
      setSeekerMintValue(mint)
      return mint
    } catch {
      return null
    } finally {
      setSeekerLoading(false)
    }
  }

  const ensureLocation = async (): Promise<LocationValue | null> => {
    if (locationValue) return locationValue
    const canUseLocation = await ensureForegroundLocationPermission()
    if (!canUseLocation) return null
    try {
      setLocationLoading(true)
      const current = await getCurrentLocation()
      setLocationValue(current)
      return current
    } catch {
      return null
    } finally {
      setLocationLoading(false)
    }
  }

  const ensureBlockAnchor = async (): Promise<{ slot: number; blockhash: string; timestampSec: number }> => {
    if (captureSlot != null && captureBlockhash && captureTimestampSec != null) {
      return { slot: captureSlot, blockhash: captureBlockhash, timestampSec: captureTimestampSec }
    }
    const latest = await connection.getLatestBlockhashAndContext()
    const slot = latest.context.slot
    const blockhash = latest.value.blockhash
    const timestampSec = await connection.getBlockTime(slot)
    if (timestampSec == null) throw new Error('Failed to resolve chain timestamp for capture')
    setCaptureSlot(slot)
    setCaptureBlockhash(blockhash)
    setCaptureTimestampSec(timestampSec)
    setTimestampIso(new Date(timestampSec * 1000).toISOString())
    return { slot, blockhash, timestampSec }
  }

  const handleDiscard = () => {
    if (isSubmitting) return
    setIsPreviewing(false)
    setPreviewUri(null)
    setPhotoHashHex(null)
    setTimestampIso(null)
    setCaptureTimestampSec(null)
    setCaptureSlot(null)
    setCaptureBlockhash(null)
    setLocationLoading(false)
    setLocationValue(null)
    setSeekerLoading(false)
    setSeekerMintValue(null)
    photoBytesRef.current = null
  }

  const handleUploadAndSubmit = async () => {
    if (isSubmitting) return
    try {
      if (!previewUri || !photoHashHex) {
        Snackbar.show({
          text: 'Missing preview or hash',
          duration: Snackbar.LENGTH_SHORT,
          backgroundColor: 'rgba(176,0,32,0.95)',
          textColor: 'white',
        })
        return
      }
      if (!account?.publicKey) {
        Snackbar.show({
          text: 'Connect wallet first',
          duration: Snackbar.LENGTH_SHORT,
          backgroundColor: 'rgba(176,0,32,0.95)',
          textColor: 'white',
        })
        return
      }

      setIsSubmitting(true)

      const seekerMint = await ensureSeekerMint()
      if (!seekerMint) {
        Snackbar.show({
          text: 'Requires Seeker Genesis Token in connected wallet',
          duration: Snackbar.LENGTH_SHORT,
          backgroundColor: 'rgba(33,33,33,0.95)',
          textColor: 'white',
        })
        return
      }

      const location = await ensureLocation()
      if (!location) {
        Snackbar.show({
          text: 'Location is required for proof submission',
          duration: Snackbar.LENGTH_SHORT,
          backgroundColor: 'rgba(176,0,32,0.95)',
          textColor: 'white',
        })
        return
      }
      const locationString = `${location.latitude},${location.longitude}`
      const latitudeE6 = Math.round(location.latitude * 1_000_000)
      const longitudeE6 = Math.round(location.longitude * 1_000_000)

      const { slot, blockhash, timestampSec } = await ensureBlockAnchor()

      const key = buildS3KeyForPhoto({
        seekerMint,
        photoHashHex,
        extension: 'jpg',
        basePrefix: AppConfig.s3.basePrefix,
      })

      const nonceBigInt = (BigInt(Date.now()) << 20n) | BigInt(Math.floor(Math.random() * 0x100000))
      const nonce = nonceBigInt.toString()
      const integrityPayload = {
        hashHex: photoHashHex,
        location: locationString,
        latitudeE6,
        longitudeE6,
        timestampSec,
        wallet: account.publicKey.toBase58(),
        nonce,
        slot,
        blockhash,
      }
      const canonicalPayload = canonicalizeIntegrityPayload(integrityPayload)
      const sigBytes = await signMessage(new TextEncoder().encode(canonicalPayload))
      const signatureB64 = Base64.fromUint8Array(sigBytes)

      let uploadURL = ''
      let returnedKey = key
      let attestationSignatureBytes: Uint8Array | null = null
      try {
        const presign = await requestPresignedPut(AppConfig.s3.presignEndpoint, {
          key,
          contentType: AppConfig.s3.defaultContentType,
          integrity: {
            version: 'v1',
            payload: integrityPayload,
            signature: signatureB64,
          },
        })
        uploadURL = presign.uploadURL
        returnedKey = presign.key || key
        attestationSignatureBytes = presign.attestationSignature64
      } catch (err: any) {
        const code = err instanceof PresignError ? err.code : ''
        const friendly =
          code === 'PRESIGN_MISSING_ATTESTATION_SIGNATURE'
            ? 'Server update required: presign API must return attestation signature'
            : code === 'PRESIGN_INVALID_ATTESTATION_SIGNATURE'
              ? 'Presign API returned malformed attestation signature'
              : `Could not authorize upload: ${err?.message ?? 'unknown error'}`
        Snackbar.show({
          text: friendly,
          duration: Snackbar.LENGTH_SHORT,
          backgroundColor: 'rgba(176,0,32,0.95)',
          textColor: 'white',
        })
        return
      }

      let uploadBytes = photoBytesRef.current
      if (!uploadBytes) {
        const fallbackBase64 = await FileSystem.readAsStringAsync(previewUri, {
          encoding: FileSystem.EncodingType.Base64,
        })
        uploadBytes = Uint8Array.from(Buffer.from(fallbackBase64, 'base64'))
        photoBytesRef.current = uploadBytes
      }
      await putToPresignedUrl({ url: uploadURL, bytes: uploadBytes, contentType: AppConfig.s3.defaultContentType })

      const remoteUri = buildS3Uri(AppConfig.s3.bucket, returnedKey || key)
      if (!remoteUri || remoteUri.length > 256) {
        throw new Error('Invalid S3 URI generated for proof')
      }
      if (locationString.length > 256) {
        throw new Error('Location string too long for program constraints')
      }

      const hashBytes = Uint8Array.from(Buffer.from(photoHashHex, 'hex'))
      if (!attestationSignatureBytes || attestationSignatureBytes.length !== 64) {
        throw new Error('Missing valid attestation signature from presign API')
      }

      const { transaction } = await buildRecordPhotoProofTransaction({
        connection,
        owner: account.publicKey,
        hash32: hashBytes,
        nonce: nonceBigInt,
        timestampSec: Math.floor(timestampSec),
        latitudeE6,
        longitudeE6,
        attestationSignature64: attestationSignatureBytes,
      })

      const {
        context: { slot: minContextSlot },
      } = await connection.getLatestBlockhashAndContext()

      const txSignature = await signAndSendTransaction(transaction as any, minContextSlot)
      await connection.confirmTransaction(txSignature, 'confirmed')
      const localUri = await copyPreviewToAppStorage(previewUri, photoHashHex).catch(() => null)

      await saveUploadHistoryRecord({
        timestampSec,
        slot,
        blockhash,
        wallet: account.publicKey.toBase58(),
        seekerMint,
        hashHex: photoHashHex,
        latitudeE6,
        longitudeE6,
        txSignature,
        nonce,
        remoteUri,
        localUri,
      })

      Snackbar.show({
        text: `Proof submitted on ${selectedCluster.name}`,
        duration: Snackbar.LENGTH_SHORT,
        backgroundColor: 'rgba(76, 175, 80, 0.95)',
        textColor: 'white',
      })

      handleDiscard()
    } catch (e: any) {
      console.log('Upload error', e)
      Snackbar.show({
        text: `Submit failed: ${e?.message ?? 'unknown error'}`,
        duration: Snackbar.LENGTH_SHORT,
        backgroundColor: 'rgba(176,0,32,0.95)',
        textColor: 'white',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const chainReady = Boolean(timestampIso && captureSlot)
  const locationReady = Boolean(locationValue)
  const seekerReady = Boolean(seekerMintValue)

  return (
    <View style={styles.container}>
      {!isPreviewing ? (
        <>
          <CameraView
            ref={cameraRef}
            style={styles.camera}
            facing={facing}
            onCameraReady={() => setIsReady(true)}
          />

          <LinearGradient
            colors={['rgba(10,15,20,0.84)', 'rgba(10,15,20,0)']}
            style={styles.topOverlay}
            pointerEvents="none"
          >
            <Text style={styles.appTitle}>Proof Camera</Text>
            <Text style={styles.appSubtitle}>Capture. Attest. Commit on-chain.</Text>
          </LinearGradient>

          <LinearGradient
            colors={['rgba(10,15,20,0)', 'rgba(10,15,20,0.95)']}
            style={styles.bottomOverlay}
            pointerEvents="box-none"
          >
            <View style={styles.controlsRow}>
              <TouchableOpacity onPress={toggleCameraFacing} style={styles.roundControl}>
                <Text style={styles.roundControlText}>Flip</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleTakePicture}
                disabled={!isReady || isTaking || isSubmitting}
                style={styles.captureOuter}
              >
                <View style={[styles.captureInner, (!isReady || isTaking || isSubmitting) && styles.captureInnerDisabled]} />
              </TouchableOpacity>

              <View style={styles.readyPill}>
                <Text style={styles.readyPillText}>{isReady ? 'Ready' : 'Loading'}</Text>
              </View>
            </View>
          </LinearGradient>
        </>
      ) : (
        <View style={styles.previewContainer}>
          {!!previewUri && <Image source={{ uri: previewUri }} style={styles.previewImage} contentFit="cover" />}

          <LinearGradient colors={['rgba(7,10,14,0.70)', 'transparent']} style={styles.previewTopOverlay}>
            <Text style={styles.previewTitle}>Review Proof</Text>
            <Text style={styles.previewSubtitle}>Finalize and send to Solana devnet</Text>
          </LinearGradient>

          <LinearGradient colors={['transparent', 'rgba(7,10,14,0.94)']} style={styles.previewBottomOverlay}>
            <View style={styles.chipRow}>
              <View style={[styles.statusChip, chainReady ? styles.statusChipOk : styles.statusChipLoading]}>
                <Text style={styles.statusChipText}>{chainReady ? 'Chain time locked' : 'Locking chain time'}</Text>
              </View>
              <View style={[styles.statusChip, locationReady ? styles.statusChipOk : styles.statusChipLoading]}>
                <Text style={styles.statusChipText}>{locationLoading ? 'Resolving GPS' : locationReady ? 'GPS ready' : 'GPS needed'}</Text>
              </View>
              <View style={[styles.statusChip, seekerReady ? styles.statusChipOk : styles.statusChipLoading]}>
                <Text style={styles.statusChipText}>{seekerLoading ? 'Checking token' : seekerReady ? 'Seeker verified' : 'Seeker required'}</Text>
              </View>
            </View>

            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Timestamp</Text>
              <Text style={styles.metaValue}>{timestampIso ?? 'Resolving from chain...'}</Text>
            </View>

            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Location</Text>
              <Text style={styles.metaValue}>
                {locationValue
                  ? `${locationValue.latitude.toFixed(5)}, ${locationValue.longitude.toFixed(5)}`
                  : 'Required for proof'}
              </Text>
            </View>

            <View style={styles.actionRow}>
              <Pressable style={[styles.actionButton, styles.secondaryButton]} onPress={handleDiscard} disabled={isSubmitting}>
                <Text style={styles.secondaryButtonText}>Retake</Text>
              </Pressable>
              <Pressable
                style={[styles.actionButton, styles.primaryButton, isSubmitting && styles.primaryButtonBusy]}
                onPress={handleUploadAndSubmit}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <View style={styles.submitBusyRow}>
                    <ActivityIndicator size="small" color="#061219" />
                    <Text style={styles.primaryButtonText}>Submitting</Text>
                  </View>
                ) : (
                  <Text style={styles.primaryButtonText}>Submit Proof</Text>
                )}
              </Pressable>
            </View>
          </LinearGradient>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#05090e',
  },
  permissionContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    gap: 14,
  },
  permissionTitle: {
    color: '#eef4ff',
    fontWeight: '700',
    fontSize: 24,
  },
  permissionText: {
    color: '#b6c3d8',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 21,
  },
  permissionButton: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    backgroundColor: '#66f5c5',
    borderRadius: 999,
  },
  permissionButtonText: {
    color: '#061219',
    fontWeight: '700',
  },
  camera: {
    flex: 1,
  },
  topOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 68,
    paddingBottom: 30,
    paddingHorizontal: 20,
  },
  appTitle: {
    color: '#eef4ff',
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  appSubtitle: {
    color: '#bfd0e9',
    fontSize: 13,
    marginTop: 6,
  },
  bottomOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 24,
    paddingBottom: 40,
    paddingTop: 80,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  roundControl: {
    width: 64,
    height: 64,
    borderRadius: 999,
    backgroundColor: 'rgba(236, 244, 255, 0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(238, 244, 255, 0.28)',
  },
  roundControlText: {
    color: '#e8f2ff',
    fontWeight: '600',
    fontSize: 14,
  },
  captureOuter: {
    width: 98,
    height: 98,
    borderRadius: 999,
    borderWidth: 5,
    borderColor: '#eef4ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureInner: {
    width: 78,
    height: 78,
    borderRadius: 999,
    backgroundColor: '#66f5c5',
  },
  captureInnerDisabled: {
    opacity: 0.45,
  },
  readyPill: {
    minWidth: 64,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(236, 244, 255, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(238, 244, 255, 0.28)',
    alignItems: 'center',
  },
  readyPillText: {
    color: '#dce9fb',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  previewContainer: {
    flex: 1,
    backgroundColor: '#05090e',
  },
  previewImage: {
    ...StyleSheet.absoluteFillObject,
  },
  previewTopOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    paddingTop: 64,
    paddingHorizontal: 20,
    paddingBottom: 34,
  },
  previewTitle: {
    color: '#f4f8ff',
    fontSize: 28,
    fontWeight: '800',
  },
  previewSubtitle: {
    color: '#ccd8ea',
    fontSize: 13,
    marginTop: 4,
  },
  previewBottomOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 18,
    paddingTop: 90,
    paddingBottom: 22,
    gap: 12,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statusChip: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  statusChipOk: {
    backgroundColor: 'rgba(102, 245, 197, 0.18)',
    borderColor: 'rgba(102, 245, 197, 0.52)',
  },
  statusChipLoading: {
    backgroundColor: 'rgba(200, 214, 236, 0.18)',
    borderColor: 'rgba(200, 214, 236, 0.42)',
  },
  statusChipText: {
    color: '#eef4ff',
    fontSize: 12,
    fontWeight: '600',
  },
  metaRow: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(7, 17, 29, 0.52)',
    borderWidth: 1,
    borderColor: 'rgba(175, 194, 222, 0.22)',
    gap: 4,
  },
  metaLabel: {
    color: '#adc0dc',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  metaValue: {
    color: '#f4f8ff',
    fontSize: 13,
    fontWeight: '500',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  actionButton: {
    flex: 1,
    height: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: 'rgba(233, 241, 255, 0.48)',
    backgroundColor: 'rgba(12, 23, 36, 0.60)',
  },
  secondaryButtonText: {
    color: '#eff5ff',
    fontSize: 15,
    fontWeight: '700',
  },
  primaryButton: {
    backgroundColor: '#66f5c5',
  },
  primaryButtonBusy: {
    opacity: 0.85,
  },
  primaryButtonText: {
    color: '#061219',
    fontSize: 15,
    fontWeight: '800',
  },
  submitBusyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
})
