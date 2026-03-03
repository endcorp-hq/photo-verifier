/**
 * Experimental compatibility surface.
 *
 * These exports are transitional while production flows use direct module helpers
 * (`modules/onchain`, `modules/presign`, `core/*`).
 */
export {
  PhotoVerifier as ExperimentalPhotoVerifier,
  MissingProofRuntimeError as ExperimentalMissingProofRuntimeError,
  type PhotoVerifierConfig as ExperimentalPhotoVerifierConfig,
  type PhotoVerifierOptions as ExperimentalPhotoVerifierOptions,
  type ProofRuntimeConfig as ExperimentalProofRuntimeConfig,
} from '../sdk';
