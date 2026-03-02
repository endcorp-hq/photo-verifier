import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system';
import { useRef, useState } from 'react';
import { Button, StyleSheet, Text, TouchableOpacity, View, Linking, Image, ScrollView } from 'react-native';
import Snackbar from 'react-native-snackbar'
import { useWalletUi } from '@/components/solana/use-wallet-ui'
import { Buffer } from 'buffer'
import { useConnection } from '@/components/solana/solana-provider'
import { useCluster } from '@/components/cluster/cluster-provider'
import { AppConfig } from '@/constants/app-config'
import { blake3HexFromBytes, getCurrentLocation, buildS3KeyForPhoto, buildS3Uri, putToPresignedUrl, verifySeeker, buildRecordPhotoProofTransaction } from '@photoverifier/sdk'
import { requestPresignedPut, PresignError } from '@/utils/s3'
import { canonicalizeIntegrityPayload } from '@/utils/integrity'
import { Base64 } from 'js-base64'
import * as Location from 'expo-location'



export default function TabCameraScreen() {
  const [facing, setFacing] = useState<CameraType>('back');
  const [permission, requestPermission] = useCameraPermissions();
  const [isReady, setIsReady] = useState(false);
  const [isTaking, setIsTaking] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [photoHashHex, setPhotoHashHex] = useState<string | null>(null);
  const [timestampIso, setTimestampIso] = useState<string | null>(null);
  const [captureTimestampSec, setCaptureTimestampSec] = useState<number | null>(null);
  const [captureSlot, setCaptureSlot] = useState<number | null>(null);
  const [captureBlockhash, setCaptureBlockhash] = useState<string | null>(null);
  const [locationLoading, setLocationLoading] = useState<boolean>(false);
  const [locationValue, setLocationValue] = useState<{ latitude: number; longitude: number; accuracy?: number } | null>(null);
  const [seekerLoading, setSeekerLoading] = useState<boolean>(false);
  const [seekerMintValue, setSeekerMintValue] = useState<string | null>(null);
  const photoBytesRef = useRef<Uint8Array | null>(null);
  const cameraRef = useRef<any>(null);
  const { account, signAndSendTransaction, signMessage } = useWalletUi()
  const connection = useConnection()
  const { selectedCluster } = useCluster()

  if (!permission) {
    // Camera permissions are still loading.
    return <View />;
  }

  if (!permission.granted) {
    // Camera permissions are not granted yet.
    return (
      <View style={styles.container}>
        <Text style={styles.message}>We need your permission to show the camera</Text>
        <Button onPress={requestPermission} title="grant permission" />
      </View>
    );
  }

  function toggleCameraFacing() {
    setFacing(current => (current === 'back' ? 'front' : 'back'));
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
              try { Linking.openSettings() } catch {}
            },
          },
        })
        // Continue without blocking capture; return false to skip location
        return false
      }
      let perm = await Location.getForegroundPermissionsAsync()
      if (perm.status !== 'granted') {
        perm = await Location.requestForegroundPermissionsAsync()
      }
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
              try { Linking.openSettings() } catch {}
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
    if (!isReady || isTaking) return;
    try {
      setIsTaking(true);
      const captured = await cameraRef.current?.takePictureAsync({
        base64: true,
        skipProcessing: true,
      } as any);
      if (!captured?.uri) throw new Error('Unable to capture photo');

      setPreviewUri(captured.uri)
      setIsPreviewing(true)

      const base64 =
        typeof captured.base64 === 'string'
          ? captured.base64
          : await FileSystem.readAsStringAsync(captured.uri, {
              encoding: FileSystem.EncodingType.Base64,
            });
      const bytes = Uint8Array.from(Buffer.from(base64, 'base64'))
      photoBytesRef.current = bytes
      setPhotoHashHex(blake3HexFromBytes(bytes))

      const blockAnchorPromise: Promise<{ slot: number; blockhash: string; timestampSec: number | null } | null> = (async () => {
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
          if (!ownerStr) {
            return null
          }
          const res = await verifySeeker({
            walletAddress: ownerStr,
            rpcUrl: AppConfig.seeker.verificationRpcUrl,
          })
          return res.isVerified ? res.mint : null
        } catch { return null }

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
      setIsTaking(false);
    }
  };

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

  const ensureLocation = async (): Promise<{ latitude: number; longitude: number; accuracy?: number } | null> => {
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
    try {
      if (!previewUri || !photoHashHex) {
        Snackbar.show({ text: 'Missing preview or hash', duration: Snackbar.LENGTH_SHORT, backgroundColor: 'rgba(176,0,32,0.95)', textColor: 'white' })
        return
      }
      if (!account?.publicKey) {
        Snackbar.show({ text: 'Connect wallet first', duration: Snackbar.LENGTH_SHORT, backgroundColor: 'rgba(176,0,32,0.95)', textColor: 'white' })
        return
      }
      const seekerMint = await ensureSeekerMint()
      if (!seekerMint) {
        Snackbar.show({ text: 'Requires Seeker Genesis Token in connected wallet', duration: Snackbar.LENGTH_SHORT, backgroundColor: 'rgba(33,33,33,0.95)', textColor: 'white' })
        return
      }

      const location = await ensureLocation()
      if (!location) {
        Snackbar.show({ text: 'Location is required for proof submission', duration: Snackbar.LENGTH_SHORT, backgroundColor: 'rgba(176,0,32,0.95)', textColor: 'white' })
        return
      }
      const locationString = `${location.latitude},${location.longitude}`
      const latitudeE6 = Math.round(location.latitude * 1_000_000)
      const longitudeE6 = Math.round(location.longitude * 1_000_000)

      const { slot, blockhash, timestampSec } = await ensureBlockAnchor()

      let remoteUri: string | null = null
      try {
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
          const fallbackBase64 = await FileSystem.readAsStringAsync(previewUri, { encoding: FileSystem.EncodingType.Base64 })
          uploadBytes = Uint8Array.from(Buffer.from(fallbackBase64, 'base64'))
          photoBytesRef.current = uploadBytes
        }
        await putToPresignedUrl({ url: uploadURL, bytes: uploadBytes, contentType: AppConfig.s3.defaultContentType })
        remoteUri = buildS3Uri(AppConfig.s3.bucket, returnedKey || key)
        Snackbar.show({ text: 'Uploaded photo to S3', duration: Snackbar.LENGTH_SHORT, backgroundColor: 'rgba(76, 175, 80, 0.95)', textColor: 'white' })

        // On-chain submit (separate step so wallet cancellation isn’t reported as S3 failure)
        try {
          if (!remoteUri) return
          if (remoteUri.length > 256) {
            Snackbar.show({ text: 'S3 URI too long (>256)', duration: Snackbar.LENGTH_SHORT, backgroundColor: 'rgba(176,0,32,0.95)', textColor: 'white' })
            return
          }
          if (locationString.length > 256) {
            Snackbar.show({ text: 'Location string too long (>256)', duration: Snackbar.LENGTH_SHORT, backgroundColor: 'rgba(176,0,32,0.95)', textColor: 'white' })
            return
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
          const signature = await signAndSendTransaction(transaction as any, minContextSlot)

          Snackbar.show({ text: 'Submitted on-chain transaction', duration: Snackbar.LENGTH_SHORT, backgroundColor: 'rgba(76, 175, 80, 0.95)', textColor: 'white' })

          handleDiscard()
          try { Linking.openURL(`https://solscan.io/tx/${signature}?cluster=${selectedCluster.network}`) } catch {}
        } catch (err: any) {
          const msg = String(err || '')
          const friendly = msg.includes('CancellationException') ? 'Wallet request canceled' : (err?.message ?? 'unknown error')
          Snackbar.show({ text: `On-chain submit failed: ${friendly}`, duration: Snackbar.LENGTH_SHORT, backgroundColor: 'rgba(176,0,32,0.95)', textColor: 'white' })
        }
      } catch (e: any) {
        console.log('Upload error', e)
        Snackbar.show({ text: `Upload failed: ${e?.message ?? 'unknown error'}`, duration: Snackbar.LENGTH_SHORT, backgroundColor: 'rgba(176,0,32,0.95)', textColor: 'white' })
      }

    } catch (e: any) {
      Snackbar.show({ text: `Error: ${e?.message ?? 'Unknown error'}`, duration: Snackbar.LENGTH_SHORT, backgroundColor: 'rgba(176,0,32,0.95)', textColor: 'white' })
    }
  }

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
          <View style={styles.buttonContainer}>
            <TouchableOpacity style={styles.button} onPress={toggleCameraFacing}>
              <Text style={styles.text}>Flip Camera</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.button}
              onPress={handleTakePicture}
              disabled={!isReady || isTaking}
            >
              <View style={[styles.shutter, isTaking ? { opacity: 0.6 } : null]} />
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <View style={styles.previewContainer}>
          {!!previewUri && (
            <Image source={{ uri: previewUri }} style={styles.previewImage} resizeMode="contain" />
          )}
          <View style={styles.statsPanel}>
            <ScrollView style={{ maxHeight: 200 }}>
              <Text style={styles.statText}>Time: {timestampIso ?? 'loading...'}</Text>
              <Text style={styles.statText}>Slot: {captureSlot ?? 'loading...'}</Text>
              <Text style={styles.statText}>Hash: {photoHashHex ?? 'loading...'}</Text>
              <Text style={styles.statText}>
                Location: {locationLoading ? 'loading...' : (locationValue ? `${locationValue.latitude.toFixed(5)}, ${locationValue.longitude.toFixed(5)}${locationValue.accuracy ? ` ±${Math.round(locationValue.accuracy)}m` : ''}` : 'unavailable')}
              </Text>
              <Text style={styles.statText}>Seeker: {seekerLoading ? 'loading...' : (seekerMintValue ?? 'none')}</Text>
            </ScrollView>
            <View style={styles.previewButtons}>
              <TouchableOpacity onPress={handleDiscard} style={[styles.actionButton, styles.discardButton]}>
                <Text style={styles.actionText}>Discard</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleUploadAndSubmit} style={[styles.actionButton, styles.uploadButton]}>
                <Text style={styles.actionText}>Upload & Submit</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
  },
  message: {
    textAlign: 'center',
    paddingBottom: 10,
  },
  camera: {
    flex: 1,
  },
  previewContainer: {
    flex: 1,
    backgroundColor: 'black',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewImage: {
    flex: 1,
    width: '100%',
  },
  buttonContainer: {
    position: 'absolute',
    bottom: 64,
    flexDirection: 'row',
    backgroundColor: 'transparent',
    width: '100%',
    paddingHorizontal: 64,
  },
  button: {
    flex: 1,
    alignItems: 'center',
  },
  shutter: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 4,
    borderColor: 'white',
    backgroundColor: 'transparent',
  },
  text: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
  },
  statsPanel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 16,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  statText: {
    color: 'white',
    fontSize: 14,
    marginBottom: 6,
  },
  previewButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  discardButton: {
    backgroundColor: 'rgba(176,0,32,0.9)',
  },
  uploadButton: {
    backgroundColor: 'rgba(76,175,80,0.9)',
  },
  actionText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
});
