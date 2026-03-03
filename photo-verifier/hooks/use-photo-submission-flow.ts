import { Base64 } from 'js-base64'
import { Buffer } from 'buffer'
import { useCallback, useState } from 'react'
import type { PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js'
import {
  buildS3KeyForPhoto,
  canonicalizeIntegrityPayload,
  locationToH3Cell,
  submitPhotoProofWithPresignedUpload,
} from '@endcorp/photoverifier-sdk'
import { AppConfig } from '@/constants/app-config'
import { isWalletAuthorizationError } from '@/features/wallet-auth/wallet-operation-errors'

type SubmitSteps = {
  signedPayload: boolean
  attestedPayload: boolean
  uploadedPhoto: boolean
  submittedOnchain: boolean
}

const INITIAL_SUBMIT_STEPS: SubmitSteps = {
  signedPayload: false,
  attestedPayload: false,
  uploadedPhoto: false,
  submittedOnchain: false,
}

type LocationValue = { latitude: number; longitude: number; accuracy?: number }
type NoticeLevel = 'success' | 'error' | 'info'
type NoticeState = {
  level: NoticeLevel
  title: string
  message: string
}

type WalletAccount = {
  publicKey: PublicKey
} | null

type ClusterLike = {
  network: string
  name: string
}

type SubmissionPreconditions = {
  ensureSeekerMint: () => Promise<string | null>
  ensureLocation: () => Promise<LocationValue | null>
  ensureBlockAnchor: () => Promise<{ slot: number; blockhash: string; timestampSec: number }>
}

type SubmissionRuntime = {
  connection: {
    getLatestBlockhashAndContext: () => Promise<{ context: { slot: number } }>
    confirmTransaction: (signature: string, commitment: 'confirmed') => Promise<{ value: { err: unknown } }>
  }
  signMessageWithRecovery: (message: Uint8Array) => Promise<Uint8Array>
  signAndSendWithRecovery: (
    transaction: Transaction | VersionedTransaction,
    minContextSlot: number
  ) => Promise<string>
  requestAttestationPresign: (
    key: string,
    integrity: {
      version: 'v1'
      payload: {
        hashHex: string
        h3Cell: string
        h3Resolution: number
        timestampSec: number
        wallet: string
        nonce: string
        slot: number
        blockhash: string
      }
      signature: string
    },
  ) => Promise<{ uploadURL: string; returnedKey: string; attestationSignatureBytes: Uint8Array }>
  resolveUploadBytes: (uri: string) => Promise<Uint8Array>
  finalizeSubmission: (params: {
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
  }) => Promise<void>
  showNotice: (payload: NoticeState, autoHideMs?: number) => void
}

type UsePhotoSubmissionFlowArgs = {
  previewUri: string | null
  photoHashHex: string | null
  account: WalletAccount
  selectedCluster: ClusterLike
  preconditions: SubmissionPreconditions
  runtime: SubmissionRuntime
}

function resetSubmitStepsState(): SubmitSteps {
  return { ...INITIAL_SUBMIT_STEPS }
}

function ensureSubmitInput(
  args: UsePhotoSubmissionFlowArgs,
): { previewUri: string; photoHashHex: string; accountPublicKey: PublicKey } | null {
  if (!args.previewUri || !args.photoHashHex) {
    args.runtime.showNotice({ level: 'error', title: 'Missing Data', message: 'Missing preview or hash.' }, 3200)
    return null
  }
  if (!args.account?.publicKey) {
    args.runtime.showNotice({ level: 'error', title: 'Wallet Required', message: 'Connect wallet first.' }, 3200)
    return null
  }
  return {
    previewUri: args.previewUri,
    photoHashHex: args.photoHashHex,
    accountPublicKey: args.account.publicKey,
  }
}

async function ensureSubmissionContext(args: UsePhotoSubmissionFlowArgs): Promise<{
  seekerMint: string
  location: LocationValue
  slot: number
  blockhash: string
  timestampSec: number
}> {
  const seekerMint = await args.preconditions.ensureSeekerMint()
  if (!seekerMint) {
    args.runtime.showNotice(
      {
        level: 'error',
        title: 'Seeker Required',
        message: 'Connected wallet must hold a Seeker Genesis Token.',
      },
      4200,
    )
    throw new Error('submission_precondition_failed')
  }

  const location = await args.preconditions.ensureLocation()
  if (!location) {
    args.runtime.showNotice(
      {
        level: 'error',
        title: 'Location Required',
        message: 'Location is required for proof submission.',
      },
      4200,
    )
    throw new Error('submission_precondition_failed')
  }

  const blockAnchor = await args.preconditions.ensureBlockAnchor()
  return {
    seekerMint,
    location,
    slot: blockAnchor.slot,
    blockhash: blockAnchor.blockhash,
    timestampSec: blockAnchor.timestampSec,
  }
}

function createNonce(): { nonce: string; nonceBigInt: bigint } {
  const nonceBytes = new Uint32Array(1)
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error('Secure random source unavailable for nonce generation')
  }
  globalThis.crypto.getRandomValues(nonceBytes)
  const nonceBigInt = (BigInt(Date.now()) << 20n) | BigInt(nonceBytes[0] & 0x0fffff)
  return { nonce: nonceBigInt.toString(), nonceBigInt }
}

async function runPhotoSubmission(
  args: UsePhotoSubmissionFlowArgs,
  setSubmitSteps: React.Dispatch<React.SetStateAction<SubmitSteps>>,
): Promise<void> {
  const input = ensureSubmitInput(args)
  if (!input) return

  const { seekerMint, location, slot, blockhash, timestampSec } = await ensureSubmissionContext(args)
  const h3Resolution = AppConfig.h3.resolution
  const h3Cell = locationToH3Cell(location, h3Resolution)
  const key = buildS3KeyForPhoto({
    seekerMint,
    photoHashHex: input.photoHashHex,
    extension: 'jpg',
    basePrefix: AppConfig.s3.basePrefix,
  })

  const { nonce, nonceBigInt } = createNonce()
  const integrityPayload = {
    hashHex: input.photoHashHex,
    h3Cell,
    h3Resolution,
    timestampSec,
    wallet: input.accountPublicKey.toBase58(),
    nonce,
    slot,
    blockhash,
  }
  const canonicalPayload = canonicalizeIntegrityPayload(integrityPayload)
  const sigBytes = await args.runtime.signMessageWithRecovery(new TextEncoder().encode(canonicalPayload))
  const signatureB64 = Base64.fromUint8Array(sigBytes)
  setSubmitSteps((current) => ({ ...current, signedPayload: true }))

  const { uploadURL, returnedKey, attestationSignatureBytes } = await args.runtime.requestAttestationPresign(
    key,
    {
      version: 'v1',
      payload: integrityPayload,
      signature: signatureB64,
    },
  )

  const uploadBytes = await args.runtime.resolveUploadBytes(input.previewUri)
  const hashBytes = Uint8Array.from(Buffer.from(input.photoHashHex, 'hex'))
  if (attestationSignatureBytes.length !== 64) {
    throw new Error('Missing valid attestation signature from presign API')
  }

  const submission = await submitPhotoProofWithPresignedUpload({
    connection: args.runtime.connection as any,
    owner: input.accountPublicKey,
    sendTransaction: async (tx: Transaction | VersionedTransaction, minContextSlot) =>
      args.runtime.signAndSendWithRecovery(tx, minContextSlot),
    bucket: AppConfig.s3.bucket,
    s3Key: returnedKey || key,
    uploadUrl: uploadURL,
    photoBytes: uploadBytes,
    contentType: AppConfig.s3.defaultContentType,
    hash32: hashBytes,
    hashHex: input.photoHashHex,
    nonce: nonceBigInt,
    timestamp: Math.floor(timestampSec),
    h3Cell,
    attestationSignature64: attestationSignatureBytes,
    onUploaded: () => {
      setSubmitSteps((current) => ({ ...current, uploadedPhoto: true }))
    },
  })
  const txSignature = submission.signature
  const remoteUri = submission.s3Uri
  if (!remoteUri || remoteUri.length > 256) {
    throw new Error('Invalid S3 URI generated for proof')
  }
  setSubmitSteps((current) => ({ ...current, submittedOnchain: true }))

  await args.runtime.finalizeSubmission({
    selectedNetwork: args.selectedCluster.network,
    selectedClusterName: args.selectedCluster.name,
    timestampSec,
    slot,
    blockhash,
    wallet: input.accountPublicKey.toBase58(),
    seekerMint,
    hashHex: input.photoHashHex,
    h3Cell,
    h3Resolution,
    txSignature,
    nonce,
    remoteUri,
    previewUri: input.previewUri,
  })
}

export function usePhotoSubmissionFlow(args: UsePhotoSubmissionFlowArgs) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitSteps, setSubmitSteps] = useState<SubmitSteps>(INITIAL_SUBMIT_STEPS)

  const resetSubmitSteps = useCallback(() => {
    setSubmitSteps(resetSubmitStepsState())
  }, [])

  const handleUploadAndSubmit = useCallback(async () => {
    if (isSubmitting) return
    try {
      setIsSubmitting(true)
      setSubmitSteps(resetSubmitStepsState())
      await runPhotoSubmission(args, setSubmitSteps)
    } catch (error: unknown) {
      const friendlyMessage = isWalletAuthorizationError(error)
        ? 'Wallet authorization failed. Reconnect wallet and retry submit.'
        : String((error as { message?: string })?.message ?? error ?? 'unknown error')
      args.runtime.showNotice(
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
  }, [args, isSubmitting])

  return {
    isSubmitting,
    submitSteps,
    setSubmitSteps,
    resetSubmitSteps,
    handleUploadAndSubmit,
  }
}
