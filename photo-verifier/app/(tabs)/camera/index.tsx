import { CameraType, useCameraPermissions } from 'expo-camera'
import { useCallback, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useFocusEffect, useIsFocused } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { locationToH3Cell } from '@endcorp/photoverifier-sdk'
import { useAuth } from '@/components/auth/auth-provider'
import { useCluster } from '@/components/cluster/cluster-provider'
import { AppConfig } from '@/constants/app-config'
import { useCameraCaptureFlow } from '@/hooks/use-camera-capture-flow'
import { useNoticeBanner } from '@/hooks/use-notice-banner'
import { useConnection } from '@/features/solana/providers/solana-provider'
import { useWalletUi } from '@/features/wallet-auth/use-wallet-ui'
import { CameraScreenView } from '@/features/camera/camera-screen-view'
import { useCameraSubmitBridge } from '@/features/camera/use-camera-submit-bridge'

type ChecklistItem = {
  label: string
  done: boolean
  pending: boolean
}

function buildCameraProgressModel(params: {
  timestampIso: string | null
  captureSlot: number | null
  locationValue: { latitude: number; longitude: number; accuracy?: number } | null
  locationLoading: boolean
  photoHashHex: string | null
  seekerMintValue: string | null
  seekerLoading: boolean
  isVerifyingSeeker: boolean
  submitSteps: {
    signedPayload: boolean
    attestedPayload: boolean
    uploadedPhoto: boolean
    submittedOnchain: boolean
  }
  isSubmitting: boolean
}): {
  captureChecklist: ChecklistItem[]
  submitChecklist: ChecklistItem[]
  hasSubmitProgress: boolean
  previewH3Cell: string | null
} {
  const chainReady = Boolean(params.timestampIso && params.captureSlot)
  const locationReady = Boolean(params.locationValue)
  const seekerReady = Boolean(params.seekerMintValue)
  const seekerBusy = params.seekerLoading || params.isVerifyingSeeker
  const hasSubmitProgress =
    params.submitSteps.signedPayload ||
    params.submitSteps.attestedPayload ||
    params.submitSteps.uploadedPhoto ||
    params.submitSteps.submittedOnchain

  const captureChecklist: ChecklistItem[] = [
    { label: 'Photo hashed', done: Boolean(params.photoHashHex), pending: false },
    { label: 'Chain timestamp locked', done: chainReady, pending: !chainReady },
    { label: 'GPS locked for H3 cell', done: locationReady, pending: params.locationLoading },
    { label: 'Seeker token verified', done: seekerReady, pending: seekerBusy },
  ]

  const submitChecklist: ChecklistItem[] = [
    {
      label: 'Wallet signed payload',
      done: params.submitSteps.signedPayload,
      pending: params.isSubmitting && !params.submitSteps.signedPayload,
    },
    {
      label: 'Server attestation received',
      done: params.submitSteps.attestedPayload,
      pending: params.isSubmitting && params.submitSteps.signedPayload && !params.submitSteps.attestedPayload,
    },
    {
      label: 'Photo uploaded to storage',
      done: params.submitSteps.uploadedPhoto,
      pending: params.isSubmitting && params.submitSteps.attestedPayload && !params.submitSteps.uploadedPhoto,
    },
    {
      label: 'Proof submitted on-chain',
      done: params.submitSteps.submittedOnchain,
      pending: params.isSubmitting && params.submitSteps.uploadedPhoto && !params.submitSteps.submittedOnchain,
    },
  ]

  const previewH3Cell = params.locationValue
    ? locationToH3Cell(params.locationValue, AppConfig.h3.resolution)
    : null

  return {
    captureChecklist,
    submitChecklist,
    hasSubmitProgress,
    previewH3Cell,
  }
}

export default function TabCameraScreen() {
  const isFocused = useIsFocused()
  const insets = useSafeAreaInsets()
  const [facing, setFacing] = useState<CameraType>('back')
  const [permission, requestPermission] = useCameraPermissions()
  const [isReady, setIsReady] = useState(false)
  const [cameraSessionKey, setCameraSessionKey] = useState(0)
  const cameraRef = useRef<any>(null)

  const { account, signAndSendTransaction, signMessage } = useWalletUi()
  const { seekerMint: authSeekerMint, isSeekerVerified, refreshSeekerVerification, isVerifyingSeeker } = useAuth()
  const connection = useConnection()
  const { selectedCluster } = useCluster()
  const { notice, noticeSlideX, showNotice, dismissNotice, hideNoticeImmediately } = useNoticeBanner()

  useFocusEffect(
    useCallback(() => {
      setIsReady(false)
      setCameraSessionKey((value) => value + 1)
      return () => {
        setIsReady(false)
        hideNoticeImmediately()
      }
    }, [hideNoticeImmediately]),
  )

  const toggleCameraFacing = useCallback(() => {
    setFacing((current) => (current === 'back' ? 'front' : 'back'))
  }, [])

  const {
    isTaking,
    isPreviewing,
    previewUri,
    photoHashHex,
    timestampIso,
    captureSlot,
    locationLoading,
    locationValue,
    seekerLoading,
    seekerMintValue,
    handleTakePicture,
    ensureSeekerMint,
    ensureLocation,
    ensureBlockAnchor,
    resolveUploadBytes,
    resetCaptureState,
  } = useCameraCaptureFlow({
    isReady,
    cameraRef,
    connection,
    seekerMintValueFromAuth: authSeekerMint,
    isSeekerVerified,
    refreshSeekerVerification,
    showNotice,
  })

  const {
    isSubmitting,
    submitSteps,
    handleDiscard,
    handleUploadAndSubmit,
    handleTakePictureWithReset,
  } = useCameraSubmitBridge({
    accountPublicKey: account?.publicKey ?? null,
    signMessage,
    signAndSendTransaction,
    selectedCluster,
    connection,
    previewUri,
    photoHashHex,
    ensureSeekerMint,
    ensureLocation,
    ensureBlockAnchor,
    resolveUploadBytes,
    resetCaptureState,
    handleTakePicture,
    showNotice,
  })

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

  const { captureChecklist, submitChecklist, hasSubmitProgress, previewH3Cell } = buildCameraProgressModel({
    timestampIso,
    captureSlot,
    locationValue,
    locationLoading,
    photoHashHex,
    seekerMintValue,
    seekerLoading,
    isVerifyingSeeker,
    submitSteps,
    isSubmitting,
  })

  return (
    <CameraScreenView
      notice={notice}
      insetTop={insets.top}
      noticeSlideX={noticeSlideX}
      dismissNotice={dismissNotice}
      isPreviewing={isPreviewing}
      isFocused={isFocused}
      cameraSessionKey={cameraSessionKey}
      cameraRef={cameraRef}
      facing={facing}
      onCameraReady={() => setIsReady(true)}
      onToggleCameraFacing={toggleCameraFacing}
      onTakePicture={handleTakePictureWithReset}
      isReady={isReady}
      isTaking={isTaking}
      isSubmitting={isSubmitting}
      previewUri={previewUri}
      captureChecklist={captureChecklist}
      submitChecklist={submitChecklist}
      hasSubmitProgress={hasSubmitProgress}
      timestampIso={timestampIso}
      previewH3Cell={previewH3Cell}
      h3Resolution={AppConfig.h3.resolution}
      onDiscard={handleDiscard}
      onSubmit={handleUploadAndSubmit}
    />
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
})
