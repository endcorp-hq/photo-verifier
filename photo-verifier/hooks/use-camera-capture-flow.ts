import * as FileSystem from 'expo-file-system'
import * as Location from 'expo-location'
import { Buffer } from 'buffer'
import { useRef, useState } from 'react'
import { blake3HexFromBytes, getCurrentLocation } from '@endcorp/photoverifier-sdk'

type NoticeLevel = 'success' | 'error' | 'info'
type NoticeState = {
  level: NoticeLevel
  title: string
  message: string
}

type CaptureLocationValue = { latitude: number; longitude: number; accuracy?: number }

type UseCameraCaptureFlowArgs = {
  isReady: boolean
  cameraRef: React.RefObject<any>
  connection: {
    getLatestBlockhashAndContext: () => Promise<{ context: { slot: number }; value: { blockhash: string } }>
    getBlockTime: (slot: number) => Promise<number | null>
  }
  seekerMintValueFromAuth: string | null
  isSeekerVerified: boolean
  refreshSeekerVerification: () => Promise<{ isVerified: boolean; seekerMint: string | null }>
  showNotice: (payload: NoticeState, autoHideMs?: number) => void
}

function showLocationDisabledNotice(showNotice: UseCameraCaptureFlowArgs['showNotice']): void {
  showNotice(
    {
      level: 'error',
      title: 'Location Disabled',
      message: 'Enable location services to include location metadata.',
    },
    4200,
  )
}

function showLocationPermissionNotice(showNotice: UseCameraCaptureFlowArgs['showNotice']): void {
  showNotice(
    {
      level: 'error',
      title: 'Permission Required',
      message: 'Location permission is required for proof submission.',
    },
    4200,
  )
}

async function ensureForegroundLocationPermission(showNotice: UseCameraCaptureFlowArgs['showNotice']): Promise<boolean> {
  try {
    const servicesEnabled = await Location.hasServicesEnabledAsync()
    if (!servicesEnabled) {
      showLocationDisabledNotice(showNotice)
      return false
    }
    let perm = await Location.getForegroundPermissionsAsync()
    if (perm.status !== 'granted') perm = await Location.requestForegroundPermissionsAsync()
    if (perm.status !== 'granted') {
      showLocationPermissionNotice(showNotice)
      return false
    }
    return true
  } catch {
    return false
  }
}

type TakePictureFlowParams = {
  args: UseCameraCaptureFlowArgs
  seekerMintValue: string | null
  photoBytesRef: React.MutableRefObject<Uint8Array | null>
}

type TakePictureFlowResult = {
  previewUri: string
  photoHashHex: string
  locationValue: CaptureLocationValue | null
  seekerMintValue: string | null
  captureSlot: number | null
  captureBlockhash: string | null
  captureTimestampSec: number | null
  timestampIso: string | null
}

async function runTakePictureFlow(params: TakePictureFlowParams): Promise<TakePictureFlowResult> {
  const captured = await params.args.cameraRef.current?.takePictureAsync({
    base64: true,
    skipProcessing: true,
  } as any)
  if (!captured?.uri) throw new Error('Unable to capture photo')

  const base64 =
    typeof captured.base64 === 'string'
      ? captured.base64
      : await FileSystem.readAsStringAsync(captured.uri, {
          encoding: FileSystem.EncodingType.Base64,
        })
  const bytes = Uint8Array.from(Buffer.from(base64, 'base64'))
  const hashHex = blake3HexFromBytes(bytes)
  params.photoBytesRef.current = bytes

  const blockAnchorPromise: Promise<{ slot: number; blockhash: string; timestampSec: number | null } | null> =
    (async () => {
      try {
        const latest = await params.args.connection.getLatestBlockhashAndContext()
        const slot = latest.context.slot
        const blockhash = latest.value.blockhash
        const timestampSec = await params.args.connection.getBlockTime(slot)
        return { slot, blockhash, timestampSec }
      } catch {
        return null
      }
    })()

  const canUseLocation = await ensureForegroundLocationPermission(params.args.showNotice)
  const locationPromise = canUseLocation ? getCurrentLocation() : Promise.resolve(null)
  const seekerPromise = (async () => {
    try {
      if (params.seekerMintValue) return params.seekerMintValue
      if (params.args.isSeekerVerified && params.args.seekerMintValueFromAuth) {
        return params.args.seekerMintValueFromAuth
      }
      const refreshed = await params.args.refreshSeekerVerification()
      return refreshed.isVerified ? refreshed.seekerMint : null
    } catch {
      return null
    }
  })()

  const [locRes, seekerRes, blockRes] = await Promise.allSettled([
    locationPromise,
    seekerPromise,
    blockAnchorPromise,
  ])
  const computedLocation = locRes.status === 'fulfilled' ? locRes.value : null
  const computedSeekerMint = seekerRes.status === 'fulfilled' ? seekerRes.value : null
  const blockAnchor = blockRes.status === 'fulfilled' ? blockRes.value : null
  return {
    previewUri: captured.uri,
    photoHashHex: hashHex,
    locationValue: computedLocation,
    seekerMintValue: computedSeekerMint,
    captureSlot: blockAnchor?.slot ?? null,
    captureBlockhash: blockAnchor?.blockhash ?? null,
    captureTimestampSec: typeof blockAnchor?.timestampSec === 'number' ? blockAnchor.timestampSec : null,
    timestampIso:
      typeof blockAnchor?.timestampSec === 'number'
        ? new Date(blockAnchor.timestampSec * 1000).toISOString()
        : null,
  }
}

export function useCameraCaptureFlow(args: UseCameraCaptureFlowArgs) {
  const [isTaking, setIsTaking] = useState(false)
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [previewUri, setPreviewUri] = useState<string | null>(null)
  const [photoHashHex, setPhotoHashHex] = useState<string | null>(null)
  const [timestampIso, setTimestampIso] = useState<string | null>(null)
  const [captureTimestampSec, setCaptureTimestampSec] = useState<number | null>(null)
  const [captureSlot, setCaptureSlot] = useState<number | null>(null)
  const [captureBlockhash, setCaptureBlockhash] = useState<string | null>(null)
  const [locationLoading, setLocationLoading] = useState<boolean>(false)
  const [locationValue, setLocationValue] = useState<CaptureLocationValue | null>(null)
  const [seekerLoading, setSeekerLoading] = useState<boolean>(false)
  const [seekerMintValue, setSeekerMintValue] = useState<string | null>(null)
  const photoBytesRef = useRef<Uint8Array | null>(null)

  const handleTakePicture = async () => {
    if (!args.isReady || isTaking) return
    try {
      setIsTaking(true)
      setLocationLoading(true)
      setSeekerLoading(true)
      const result = await runTakePictureFlow({
        args,
        seekerMintValue,
        photoBytesRef,
      })
      setPreviewUri(result.previewUri)
      setIsPreviewing(true)
      setPhotoHashHex(result.photoHashHex)
      setLocationValue(result.locationValue)
      setSeekerMintValue(result.seekerMintValue)
      setCaptureSlot(result.captureSlot)
      setCaptureBlockhash(result.captureBlockhash)
      setCaptureTimestampSec(result.captureTimestampSec)
      setTimestampIso(result.timestampIso)
    } catch (e: any) {
      args.showNotice(
        {
          level: 'error',
          title: 'Camera Error',
          message: e?.message ?? 'Unknown error',
        },
        4200,
      )
    } finally {
      setLocationLoading(false)
      setSeekerLoading(false)
      setIsTaking(false)
    }
  }

  const ensureSeekerMint = async (): Promise<string | null> => {
    if (seekerMintValue) return seekerMintValue
    if (args.isSeekerVerified && args.seekerMintValueFromAuth) {
      setSeekerMintValue(args.seekerMintValueFromAuth)
      return args.seekerMintValueFromAuth
    }
    try {
      setSeekerLoading(true)
      const res = await args.refreshSeekerVerification()
      const mint = res.isVerified ? res.seekerMint : null
      setSeekerMintValue(mint)
      return mint
    } catch {
      return null
    } finally {
      setSeekerLoading(false)
    }
  }

  const ensureLocation = async (): Promise<CaptureLocationValue | null> => {
    if (locationValue) return locationValue
    const canUseLocation = await ensureForegroundLocationPermission(args.showNotice)
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
    const latest = await args.connection.getLatestBlockhashAndContext()
    const slot = latest.context.slot
    const blockhash = latest.value.blockhash
    const timestampSec = await args.connection.getBlockTime(slot)
    if (timestampSec == null) throw new Error('Failed to resolve chain timestamp for capture')
    setCaptureSlot(slot)
    setCaptureBlockhash(blockhash)
    setCaptureTimestampSec(timestampSec)
    setTimestampIso(new Date(timestampSec * 1000).toISOString())
    return { slot, blockhash, timestampSec }
  }

  const resolveUploadBytes = async (uri: string): Promise<Uint8Array> => {
    if (photoBytesRef.current) {
      return photoBytesRef.current
    }
    const fallbackBase64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    })
    const resolved = Uint8Array.from(Buffer.from(fallbackBase64, 'base64'))
    photoBytesRef.current = resolved
    return resolved
  }

  const resetCaptureState = () => {
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

  return {
    isTaking,
    isPreviewing,
    previewUri,
    photoHashHex,
    timestampIso,
    captureTimestampSec,
    captureSlot,
    captureBlockhash,
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
  }
}
