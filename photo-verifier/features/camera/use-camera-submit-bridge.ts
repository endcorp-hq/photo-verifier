import * as FileSystem from 'expo-file-system'
import { useCallback } from 'react'
import type { PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js'
import { AppConfig } from '@/constants/app-config'
import { usePhotoSubmissionFlow } from '@/hooks/photo-submission-controller'
import { saveUploadHistoryRecord } from '@/utils/upload-history'
import { PresignError, requestPresignedPut } from '@/utils/s3'

type NoticePayload = {
  level: 'success' | 'error' | 'info'
  title: string
  message: string
}

type ClusterLike = {
  network: string
  name: string
}

type CameraSubmitBridgeArgs = {
  accountPublicKey: PublicKey | null
  signMessage: (message: Uint8Array) => Promise<Uint8Array>
  signAndSendTransaction: (
    transaction: Transaction | VersionedTransaction,
    minContextSlot: number
  ) => Promise<string>
  selectedCluster: ClusterLike
  connection: {
    getLatestBlockhashAndContext: () => Promise<{ context: { slot: number } }>
    confirmTransaction: (signature: string, commitment: 'confirmed') => Promise<{ value: { err: unknown } }>
  }
  previewUri: string | null
  photoHashHex: string | null
  ensureSeekerMint: () => Promise<string | null>
  ensureLocation: () => Promise<{ latitude: number; longitude: number; accuracy?: number } | null>
  ensureBlockAnchor: () => Promise<{ slot: number; blockhash: string; timestampSec: number }>
  resolveUploadBytes: (uri: string) => Promise<Uint8Array>
  resetCaptureState: () => void
  handleTakePicture: () => Promise<void>
  showNotice: (payload: NoticePayload, autoHideMs?: number) => void
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

export function useCameraSubmitBridge(args: CameraSubmitBridgeArgs) {
  const finalizeSubmission = useCallback(
    async (params: {
      selectedNetwork: string
      selectedClusterName: string
      timestampSec: number
      slot: number
      blockhash: string
      wallet: string
      seekerMint: string
      hashHex: string
      h3Cell: string
      h3Resolution: number
      txSignature: string
      nonce: string
      remoteUri: string
      previewUri: string
    }) => {
      const localUri = await copyPreviewToAppStorage(params.previewUri, params.hashHex).catch(() => null)
      await saveUploadHistoryRecord({
        clusterNetwork: params.selectedNetwork,
        timestampSec: params.timestampSec,
        slot: params.slot,
        blockhash: params.blockhash,
        wallet: params.wallet,
        seekerMint: params.seekerMint,
        hashHex: params.hashHex,
        h3Cell: params.h3Cell,
        h3Resolution: params.h3Resolution,
        txSignature: params.txSignature,
        nonce: params.nonce,
        remoteUri: params.remoteUri,
        localUri,
      })
      args.showNotice(
        {
          level: 'success',
          title: 'Proof Submitted',
          message: `Submitted on ${params.selectedClusterName}.`,
        },
        3600,
      )
      args.resetCaptureState()
    },
    [args],
  )

  const {
    isSubmitting,
    submitSteps,
    setSubmitSteps,
    resetSubmitSteps,
    handleUploadAndSubmit,
  } = usePhotoSubmissionFlow({
    previewUri: args.previewUri,
    photoHashHex: args.photoHashHex,
    account: args.accountPublicKey ? { publicKey: args.accountPublicKey } : null,
    selectedCluster: args.selectedCluster,
    preconditions: {
      ensureSeekerMint: args.ensureSeekerMint,
      ensureLocation: args.ensureLocation,
      ensureBlockAnchor: args.ensureBlockAnchor,
    },
    runtime: {
      connection: args.connection,
      signMessageWithRecovery: args.signMessage,
      signAndSendWithRecovery: args.signAndSendTransaction,
      requestAttestationPresign: async (key, integrityPayload) => {
        try {
          const presign = await requestPresignedPut(AppConfig.s3.presignEndpoint, {
            key,
            contentType: AppConfig.s3.defaultContentType,
            integrity: integrityPayload,
          })
          setSubmitSteps((current) => ({ ...current, attestedPayload: true }))
          return {
            uploadURL: presign.uploadURL,
            returnedKey: presign.key || key,
            attestationSignatureBytes: presign.attestationSignature64,
          }
        } catch (err: unknown) {
          const code = err instanceof PresignError ? err.code : ''
          const friendly =
            code === 'PRESIGN_MISSING_ATTESTATION_SIGNATURE'
              ? 'Server update required: presign API must return attestation signature'
              : code === 'PRESIGN_INVALID_ATTESTATION_SIGNATURE'
                ? 'Presign API returned malformed attestation signature'
                : `Could not authorize upload: ${String((err as { message?: string })?.message ?? err ?? 'unknown error')}`
          args.showNotice({ level: 'error', title: 'Presign Failed', message: friendly }, 5000)
          throw err
        }
      },
      resolveUploadBytes: args.resolveUploadBytes,
      finalizeSubmission,
      showNotice: args.showNotice,
    },
  })

  const handleDiscard = useCallback(() => {
    if (isSubmitting) return
    resetSubmitSteps()
    args.resetCaptureState()
  }, [args, isSubmitting, resetSubmitSteps])

  const handleTakePictureWithReset = useCallback(async () => {
    if (isSubmitting) return
    resetSubmitSteps()
    await args.handleTakePicture()
  }, [args, isSubmitting, resetSubmitSteps])

  return {
    isSubmitting,
    submitSteps,
    handleDiscard,
    handleUploadAndSubmit,
    handleTakePictureWithReset,
  }
}
