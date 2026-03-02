import { CameraType, CameraView, useCameraPermissions } from 'expo-camera'
import * as FileSystem from 'expo-file-system'
import { LinearGradient } from 'expo-linear-gradient'
import * as Location from 'expo-location'
import { Image } from 'expo-image'
import { Base64 } from 'js-base64'
import { Buffer } from 'buffer'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { useFocusEffect, useIsFocused } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '@/components/auth/auth-provider'
import { useCluster } from '@/components/cluster/cluster-provider'
import { useConnection } from '@/components/solana/solana-provider'
import { useWalletUi } from '@/components/solana/use-wallet-ui'
import { AppConfig } from '@/constants/app-config'
import {
  blake3HexFromBytes,
  buildRecordPhotoProofTransaction,
  buildS3KeyForPhoto,
  buildS3Uri,
  canonicalizeIntegrityPayload,
  getCurrentLocation,
  locationToH3Cell,
  putToPresignedUrl,
} from '@photoverifier/sdk'
import { saveUploadHistoryRecord } from '@/utils/upload-history'
import { PresignError, requestPresignedPut } from '@/utils/s3'

type LocationValue = { latitude: number; longitude: number; accuracy?: number }
type SubmitSteps = {
  signedPayload: boolean
  attestedPayload: boolean
  uploadedPhoto: boolean
  submittedOnchain: boolean
}
type StepState = 'done' | 'pending' | 'idle'
type NoticeLevel = 'success' | 'error' | 'info'
type NoticeState = {
  level: NoticeLevel
  title: string
  message: string
}

const INITIAL_SUBMIT_STEPS: SubmitSteps = {
  signedPayload: false,
  attestedPayload: false,
  uploadedPhoto: false,
  submittedOnchain: false,
}

async function copyPreviewToAppStorage(previewUri: string, hashHex: string): Promise<string | null> {
  const baseDir = FileSystem.documentDirectory
  if (!baseDir) return null
  const uploadsDir = `${baseDir}uploads`
  await FileSystem.makeDirectoryAsync(uploadsDir, { intermediates: true })
  const localUri = `${uploadsDir}/${Date.now()}-${hashHex.slice(0, 10)}.jpg`
  await FileSystem.copyAsync({ from: previewUri, to: localUri })
  return localUri
}

function isAuthorizationFailure(error: unknown): boolean {
  const message = String((error as any)?.message ?? error ?? '').toLowerCase()
  return (
    message.includes('authorization request failed') ||
    message.includes('authorization failed') ||
    message.includes('not authorized')
  )
}

export default function TabCameraScreen() {
  const isFocused = useIsFocused()
  const insets = useSafeAreaInsets()
  const [facing, setFacing] = useState<CameraType>('back')
  const [permission, requestPermission] = useCameraPermissions()
  const [isReady, setIsReady] = useState(false)
  const [cameraSessionKey, setCameraSessionKey] = useState(0)
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
  const [submitSteps, setSubmitSteps] = useState<SubmitSteps>(INITIAL_SUBMIT_STEPS)
  const [notice, setNotice] = useState<NoticeState | null>(null)
  const photoBytesRef = useRef<Uint8Array | null>(null)
  const cameraRef = useRef<any>(null)
  const noticeSlideX = useRef(new Animated.Value(360)).current
  const noticeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const noticeAnimationRef = useRef<Animated.CompositeAnimation | null>(null)

  const { account, connect, signAndSendTransaction, signMessage } = useWalletUi()
  const { seekerMint: authSeekerMint, isSeekerVerified, refreshSeekerVerification, isVerifyingSeeker } = useAuth()
  const connection = useConnection()
  const { selectedCluster } = useCluster()

  const clearNoticeTimer = useCallback(() => {
    if (!noticeTimeoutRef.current) return
    clearTimeout(noticeTimeoutRef.current)
    noticeTimeoutRef.current = null
  }, [])

  const stopNoticeAnimation = useCallback(() => {
    noticeAnimationRef.current?.stop()
    noticeAnimationRef.current = null
  }, [])

  const hideNoticeImmediately = useCallback(() => {
    clearNoticeTimer()
    stopNoticeAnimation()
    noticeSlideX.setValue(360)
    setNotice(null)
  }, [clearNoticeTimer, noticeSlideX, stopNoticeAnimation])

  const dismissNotice = useCallback(() => {
    clearNoticeTimer()
    stopNoticeAnimation()
    const animation = Animated.timing(noticeSlideX, {
      toValue: 360,
      duration: 180,
      useNativeDriver: false,
    })
    noticeAnimationRef.current = animation
    animation.start(({ finished }) => {
      noticeAnimationRef.current = null
      if (finished) setNotice(null)
    })
  }, [clearNoticeTimer, noticeSlideX, stopNoticeAnimation])

  const showNotice = useCallback(
    (payload: NoticeState, autoHideMs = 3400) => {
      clearNoticeTimer()
      stopNoticeAnimation()
      setNotice(payload)
      noticeSlideX.setValue(360)
      const animation = Animated.timing(noticeSlideX, {
        toValue: 0,
        duration: 220,
        useNativeDriver: false,
      })
      noticeAnimationRef.current = animation
      animation.start(() => {
        noticeAnimationRef.current = null
      })
      if (autoHideMs > 0) {
        noticeTimeoutRef.current = setTimeout(() => {
          dismissNotice()
        }, autoHideMs)
      }
    },
    [clearNoticeTimer, dismissNotice, noticeSlideX, stopNoticeAnimation],
  )

  useEffect(() => {
    return () => {
      hideNoticeImmediately()
    }
  }, [hideNoticeImmediately])

  useFocusEffect(
    useCallback(() => {
      // Force remount on each tab focus to avoid occasional black preview frame.
      setIsReady(false)
      setCameraSessionKey(value => value + 1)
      return () => {
        setIsReady(false)
        hideNoticeImmediately()
      }
    }, [hideNoticeImmediately]),
  )

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
        showNotice(
          {
            level: 'error',
            title: 'Location Disabled',
            message: 'Enable location services to include location metadata.',
          },
          4200,
        )
        return false
      }
      let perm = await Location.getForegroundPermissionsAsync()
      if (perm.status !== 'granted') perm = await Location.requestForegroundPermissionsAsync()
      if (perm.status !== 'granted') {
        showNotice(
          {
            level: 'error',
            title: 'Permission Required',
            message: 'Location permission is required for proof submission.',
          },
          4200,
        )
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
      setSubmitSteps(INITIAL_SUBMIT_STEPS)

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
          if (seekerMintValue) return seekerMintValue
          if (isSeekerVerified && authSeekerMint) return authSeekerMint
          const refreshed = await refreshSeekerVerification()
          return refreshed.isVerified ? refreshed.mint : null
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
      showNotice(
        {
          level: 'error',
          title: 'Camera Error',
          message: e?.message ?? 'Unknown error',
        },
        4200,
      )
    } finally {
      setIsTaking(false)
    }
  }

  const ensureSeekerMint = async (): Promise<string | null> => {
    if (seekerMintValue) return seekerMintValue
    if (isSeekerVerified && authSeekerMint) {
      setSeekerMintValue(authSeekerMint)
      return authSeekerMint
    }
    try {
      setSeekerLoading(true)
      const res = await refreshSeekerVerification()
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

  const signMessageWithRecovery = async (message: Uint8Array): Promise<Uint8Array> => {
    try {
      return await signMessage(message)
    } catch (error) {
      if (!isAuthorizationFailure(error)) throw error
      await connect()
      return await signMessage(message)
    }
  }

  const signAndSendWithRecovery = async (transaction: any, minContextSlot: number): Promise<string> => {
    try {
      return await signAndSendTransaction(transaction, minContextSlot)
    } catch (error) {
      if (!isAuthorizationFailure(error)) throw error
      await connect()
      return await signAndSendTransaction(transaction, minContextSlot)
    }
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
    setSubmitSteps(INITIAL_SUBMIT_STEPS)
    photoBytesRef.current = null
  }

  const handleUploadAndSubmit = async () => {
    if (isSubmitting) return
    try {
      if (!previewUri || !photoHashHex) {
        showNotice({ level: 'error', title: 'Missing Data', message: 'Missing preview or hash.' }, 3200)
        return
      }
      if (!account?.publicKey) {
        showNotice({ level: 'error', title: 'Wallet Required', message: 'Connect wallet first.' }, 3200)
        return
      }

      setIsSubmitting(true)
      setSubmitSteps(INITIAL_SUBMIT_STEPS)

      const seekerMint = await ensureSeekerMint()
      if (!seekerMint) {
        showNotice(
          {
            level: 'error',
            title: 'Seeker Required',
            message: 'Connected wallet must hold a Seeker Genesis Token.',
          },
          4200,
        )
        return
      }

      const location = await ensureLocation()
      if (!location) {
        showNotice(
          {
            level: 'error',
            title: 'Location Required',
            message: 'Location is required for proof submission.',
          },
          4200,
        )
        return
      }
      const h3Resolution = AppConfig.h3.resolution
      const h3Cell = locationToH3Cell(location, h3Resolution)

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
        h3Cell,
        h3Resolution,
        timestampSec,
        wallet: account.publicKey.toBase58(),
        nonce,
        slot,
        blockhash,
      }
      const canonicalPayload = canonicalizeIntegrityPayload(integrityPayload)
      const sigBytes = await signMessageWithRecovery(new TextEncoder().encode(canonicalPayload))
      const signatureB64 = Base64.fromUint8Array(sigBytes)
      setSubmitSteps(current => ({ ...current, signedPayload: true }))

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
        setSubmitSteps(current => ({ ...current, attestedPayload: true }))
      } catch (err: any) {
        const code = err instanceof PresignError ? err.code : ''
        const friendly =
          code === 'PRESIGN_MISSING_ATTESTATION_SIGNATURE'
            ? 'Server update required: presign API must return attestation signature'
            : code === 'PRESIGN_INVALID_ATTESTATION_SIGNATURE'
              ? 'Presign API returned malformed attestation signature'
              : `Could not authorize upload: ${err?.message ?? 'unknown error'}`
        showNotice({ level: 'error', title: 'Presign Failed', message: friendly }, 5000)
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
      const remoteUri = buildS3Uri(AppConfig.s3.bucket, returnedKey || key)
      if (!remoteUri || remoteUri.length > 256) {
        throw new Error('Invalid S3 URI generated for proof')
      }

      const hashBytes = Uint8Array.from(Buffer.from(photoHashHex, 'hex'))
      if (!attestationSignatureBytes || attestationSignatureBytes.length !== 64) {
        throw new Error('Missing valid attestation signature from presign API')
      }

      const txBuildPromise = buildRecordPhotoProofTransaction({
        connection,
        owner: account.publicKey,
        hash32: hashBytes,
        nonce: nonceBigInt,
        timestampSec: Math.floor(timestampSec),
        h3CellU64: BigInt(`0x${h3Cell}`),
        attestationSignature64: attestationSignatureBytes,
      })
      const minContextSlotPromise = connection.getLatestBlockhashAndContext().then(({ context }) => context.slot)
      const uploadPromise = putToPresignedUrl({
        url: uploadURL,
        bytes: uploadBytes,
        contentType: AppConfig.s3.defaultContentType,
      })

      const [txBuild, minContextSlot] = await Promise.all([txBuildPromise, minContextSlotPromise])
      await uploadPromise
      setSubmitSteps(current => ({ ...current, uploadedPhoto: true }))

      const txSignature = await signAndSendWithRecovery(txBuild.transaction as any, minContextSlot)
      setSubmitSteps(current => ({ ...current, submittedOnchain: true }))
      const localUri = await copyPreviewToAppStorage(previewUri, photoHashHex).catch(() => null)

      await saveUploadHistoryRecord({
        timestampSec,
        slot,
        blockhash,
        wallet: account.publicKey.toBase58(),
        seekerMint,
        hashHex: photoHashHex,
        h3Cell,
        h3Resolution,
        txSignature,
        nonce,
        remoteUri,
        localUri,
      })

      showNotice(
        {
          level: 'success',
          title: 'Proof Submitted',
          message: `Submitted on ${selectedCluster.name}.`,
        },
        3600,
      )

      handleDiscard()
    } catch (e: any) {
      console.log('Upload error', e)
      const friendlyMessage = isAuthorizationFailure(e)
        ? 'Wallet authorization failed. Reconnect wallet and retry submit.'
        : e?.message ?? 'unknown error'
      showNotice(
        {
          level: 'error',
          title: 'Submit Failed',
          message: friendlyMessage,
        },
        5000,
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  const chainReady = Boolean(timestampIso && captureSlot)
  const locationReady = Boolean(locationValue)
  const seekerReady = Boolean(seekerMintValue)
  const seekerBusy = seekerLoading || isVerifyingSeeker
  const hasSubmitProgress =
    submitSteps.signedPayload ||
    submitSteps.attestedPayload ||
    submitSteps.uploadedPhoto ||
    submitSteps.submittedOnchain

  const captureChecklist = [
    { label: 'Photo hashed', done: Boolean(photoHashHex), pending: false },
    { label: 'Chain timestamp locked', done: chainReady, pending: !chainReady },
    { label: 'GPS locked for H3 cell', done: locationReady, pending: locationLoading },
    { label: 'Seeker token verified', done: seekerReady, pending: seekerBusy },
  ]

  const previewH3Cell = locationValue ? locationToH3Cell(locationValue, AppConfig.h3.resolution) : null

  const submitChecklist = [
    { label: 'Wallet signed payload', done: submitSteps.signedPayload, pending: isSubmitting && !submitSteps.signedPayload },
    {
      label: 'Server attestation received',
      done: submitSteps.attestedPayload,
      pending: isSubmitting && submitSteps.signedPayload && !submitSteps.attestedPayload,
    },
    {
      label: 'Photo uploaded to storage',
      done: submitSteps.uploadedPhoto,
      pending: isSubmitting && submitSteps.attestedPayload && !submitSteps.uploadedPhoto,
    },
    {
      label: 'Proof submitted on-chain',
      done: submitSteps.submittedOnchain,
      pending: isSubmitting && submitSteps.uploadedPhoto && !submitSteps.submittedOnchain,
    },
  ]

  const getStepState = (done: boolean, pending: boolean): StepState => {
    if (done) return 'done'
    if (pending) return 'pending'
    return 'idle'
  }

  const getStepIconName = (state: StepState): keyof typeof MaterialIcons.glyphMap => {
    if (state === 'done') return 'check-circle'
    if (state === 'pending') return 'hourglass-top'
    return 'radio-button-unchecked'
  }

  const getStepIconColor = (state: StepState): string => {
    if (state === 'done') return '#66f5c5'
    if (state === 'pending') return '#ffd66a'
    return '#89a3c2'
  }

  const noticeColorStyle =
    notice?.level === 'success'
      ? styles.noticeSuccess
      : notice?.level === 'error'
        ? styles.noticeError
        : styles.noticeInfo

  return (
    <View style={styles.container}>
      {notice ? (
        <Animated.View
          style={[
            styles.noticeWrap,
            { top: insets.top + 8, transform: [{ translateX: noticeSlideX }] },
          ]}
          pointerEvents="box-none"
        >
          <View style={[styles.noticeCard, noticeColorStyle]}>
            <View style={styles.noticeHeader}>
              <Text style={styles.noticeTitle} numberOfLines={1}>
                {notice.title}
              </Text>
              <Pressable onPress={dismissNotice} hitSlop={8}>
                <MaterialIcons name="chevron-right" size={18} color="#d8e5f9" />
              </Pressable>
            </View>
            <Text style={styles.noticeMessage} numberOfLines={3}>
              {notice.message}
            </Text>
          </View>
        </Animated.View>
      ) : null}

      {!isPreviewing ? (
        <>
          {isFocused ? (
            <CameraView
              key={cameraSessionKey}
              ref={cameraRef}
              style={styles.camera}
              facing={facing}
              onCameraReady={() => setIsReady(true)}
            />
          ) : (
            <View style={styles.camera} />
          )}

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

              <View style={styles.controlSpacer} />
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
            <View style={styles.previewPanel}>
              <View style={styles.checklistCard}>
                <Text style={styles.checklistTitle}>Verification Steps</Text>
                {captureChecklist.map(step => {
                  const state = getStepState(step.done, step.pending)
                  return (
                    <View key={step.label} style={styles.checklistRow}>
                      <MaterialIcons name={getStepIconName(state)} size={17} color={getStepIconColor(state)} />
                      <Text style={styles.checklistText}>{step.label}</Text>
                    </View>
                  )
                })}
              </View>

              {isSubmitting || hasSubmitProgress ? (
                <View style={styles.checklistCard}>
                  <Text style={styles.checklistTitle}>Submit Steps</Text>
                  {submitChecklist.map(step => {
                    const state = getStepState(step.done, step.pending)
                    return (
                      <View key={step.label} style={styles.checklistRow}>
                        <MaterialIcons name={getStepIconName(state)} size={17} color={getStepIconColor(state)} />
                        <Text style={styles.checklistText}>{step.label}</Text>
                      </View>
                    )
                  })}
                </View>
              ) : null}

              <View style={styles.metaGrid}>
                <View style={[styles.metaRow, styles.metaHalf]}>
                  <Text style={styles.metaLabel}>Timestamp</Text>
                  <Text style={styles.metaValue} numberOfLines={2}>
                    {timestampIso ?? 'Resolving from chain...'}
                  </Text>
                </View>

                <View style={[styles.metaRow, styles.metaHalf]}>
                  <Text style={styles.metaLabel}>H3 Cell</Text>
                  <Text style={styles.metaValue} numberOfLines={2}>
                    {previewH3Cell ? `${previewH3Cell} (r${AppConfig.h3.resolution})` : 'Requires location permission'}
                  </Text>
                </View>
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
  noticeWrap: {
    position: 'absolute',
    right: 10,
    width: 280,
    zIndex: 50,
  },
  noticeCard: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOpacity: 0.24,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 8,
  },
  noticeSuccess: {
    backgroundColor: 'rgba(14, 50, 37, 0.96)',
    borderColor: 'rgba(102, 245, 197, 0.58)',
  },
  noticeError: {
    backgroundColor: 'rgba(67, 14, 24, 0.96)',
    borderColor: 'rgba(255, 122, 144, 0.58)',
  },
  noticeInfo: {
    backgroundColor: 'rgba(17, 32, 51, 0.96)',
    borderColor: 'rgba(145, 173, 206, 0.58)',
  },
  noticeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  noticeTitle: {
    color: '#eef5ff',
    fontSize: 13,
    fontWeight: '800',
    flex: 1,
    marginRight: 8,
  },
  noticeMessage: {
    color: '#d8e5f9',
    fontSize: 12,
    lineHeight: 16,
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
  controlSpacer: {
    width: 64,
    height: 64,
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
    paddingTop: 80,
    paddingBottom: 22,
  },
  previewPanel: {
    borderRadius: 18,
    backgroundColor: 'rgba(7, 13, 24, 0.76)',
    borderWidth: 1,
    borderColor: 'rgba(175, 194, 222, 0.2)',
    padding: 12,
    gap: 10,
  },
  checklistCard: {
    borderRadius: 10,
    backgroundColor: 'rgba(7, 17, 29, 0.38)',
    borderWidth: 1,
    borderColor: 'rgba(175, 194, 222, 0.18)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 6,
  },
  checklistTitle: {
    color: '#d7e7ff',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  checklistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    backgroundColor: 'rgba(12, 24, 40, 0.34)',
  },
  checklistText: {
    color: '#eef4ff',
    fontSize: 12,
    fontWeight: '500',
    flex: 1,
  },
  metaGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  metaHalf: {
    flex: 1,
  },
  metaRow: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(7, 17, 29, 0.52)',
    borderWidth: 1,
    borderColor: 'rgba(175, 194, 222, 0.22)',
    gap: 3,
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
    marginTop: 2,
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
