/**
 * Mobile-focused SDK entrypoint.
 * Exposes camera/location plus seeker verification and high-level SDK ergonomics.
 */
export {
  captureAndPersist,
  readFileAsBase64,
  readFileAsBytes,
} from '@photoverifier/core-mobile/camera';
export {
  getCurrentLocation,
  hasLocationServicesEnabled,
  requestLocationPermission,
  locationToString,
  parseLocationString,
} from '@photoverifier/core-mobile/location';
export type { GeoLocation, CaptureResult, PhotoMetadata } from '@photoverifier/core';

export {
  verifySeeker,
  detectSeekerUser,
  findSeekerMintForOwner,
  type SeekerWalletVerificationRequest,
  type SeekerOwnerVerificationRequest,
  type SeekerVerificationResult,
  type SeekerDetectionResult,
} from './modules/seeker';

export { isSeekerDevice } from './modules/seeker-device';

export {
  latLngToH3Cell,
  locationToH3Cell,
  type H3LocationInput,
} from './modules/h3';

export { PhotoVerifier as ExperimentalPhotoVerifier } from './sdk';
export {
  type PhotoVerifierConfig as ExperimentalPhotoVerifierConfig,
  type PhotoVerifierOptions as ExperimentalPhotoVerifierOptions,
  type ProofRuntimeAttestationInput as ExperimentalProofRuntimeAttestationInput,
  type ProofRuntimeConfig as ExperimentalProofRuntimeConfig,
  MissingProofRuntimeError as ExperimentalMissingProofRuntimeError,
} from './sdk';
