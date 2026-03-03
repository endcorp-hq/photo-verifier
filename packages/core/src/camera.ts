import type { CameraView } from 'expo-camera';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system';
import type { CaptureResult } from './types';

type SavedPicture = { uri?: string };
type PictureRefLike = { savePictureAsync: () => Promise<SavedPicture> };
type CameraViewLike = {
  takePictureAsync: (options: { pictureRef: true }) => Promise<PictureRefLike | null | undefined>;
};

/**
 * Capture a photo using the camera and persist to media library
 * Core camera functionality - free and open source
 */
export async function captureAndPersist(cameraRef: React.RefObject<CameraView>): Promise<CaptureResult> {
  const camera = cameraRef.current as unknown as CameraViewLike | null;
  const pictureRef = await camera?.takePictureAsync({ pictureRef: true });
  if (!pictureRef) throw new Error('Unable to capture photo');
  
  const saved = await pictureRef.savePictureAsync();
  if (!saved?.uri) throw new Error('Unable to save temp photo');
  
  const asset = await MediaLibrary.createAssetAsync(saved.uri);
  const info = await MediaLibrary.getAssetInfoAsync(asset);
  if (!info.localUri) throw new Error('Unable to resolve local asset URI');
  
  return { tempUri: saved.uri, assetUri: info.localUri };
}

/**
 * Read file as Base64 string
 */
export async function readFileAsBase64(uri: string): Promise<string> {
  return FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
}


/**
 * Read file as Uint8Array
 */
export async function readFileAsBytes(uri: string): Promise<Uint8Array> {
  const base64 = await readFileAsBase64(uri);
  return Uint8Array.from(Buffer.from(base64, 'base64'));
}
