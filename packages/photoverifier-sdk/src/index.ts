/**
 * Citizen Science SDK - Unified Photo Verification
 * 
 * This is the main entry point for the SDK. It provides:
 * - Core functionality (free): Camera, hashing, location, storage
 * - Blockchain functionality (licensed): Compressed accounts, verification
 * 
 * Usage:
 * 
 * import { PhotoVerifier } from '@endcorp/photoverifier-sdk';
 * 
 * // Initialize with license (for blockchain features)
 * const verifier = new PhotoVerifier({
 *   licenseKey: 'your-license-key',
 *   rpcUrl: 'https://api.devnet.solana.com',
 * });
 * 
 * // Capture photo
 * const { hash, metadata } = await verifier.captureAndHash(cameraRef);
 * 
 * // Store on chain (requires license)
 * const { signature } = await verifier.storeProof(hash, metadata);
 */

// Core - always available (free)
export {
  // Hashing
  blake3HexFromBase64,
  blake3HexFromBytes,
  blake3Hash,
  // Camera
  captureAndPersist,
  readFileAsBase64,
  readFileAsBytes,
  // Location
  getCurrentLocation,
  hasLocationServicesEnabled,
  requestLocationPermission,
  locationToString,
  parseLocationString,
  // Storage
  uploadBytes,
  buildS3KeyForPhoto,
  buildS3Uri,
  parseS3Uri,
  putToPresignedUrl,
  // Types
  type Blake3HashResult,
  type GeoLocation,
  type PhotoMetadata,
  type CaptureResult,
  type S3Config,
  type S3KeyParams,
} from './core';

// Blockchain - requires license
export {
  // Compressed accounts
  PHOTO_PROOF_PROGRAM_ID,
  BUBBLEGUM_PROGRAM_ID,
  TREE_CONFIGS,
  serializePhotoProof,
  deserializePhotoProof,
  hashPhotoProof,
  calculateTreeCost,
  deriveTreeConfigPda,
  deriveAuthorityPda,
  getTreeCapacity,
  estimateCostPerPhoto,
  createLeafSchema,
  type TreeConfig,
  type PhotoProof,
  type CompressedAccountConfig,
  type PhotoProofResult,
  type VerificationResult,
  // License
  LICENSE_TIERS,
  encodeLicenseKey,
  decodeLicenseKey,
  hasFeature,
  createDemoLicenseKey,
  UsageTracker,
  type LicenseInfo,
  type LicenseValidationResult,
} from './blockchain';

// Unified SDK class
export { PhotoVerifier } from './sdk';
export type { PhotoVerifierConfig, PhotoVerifierOptions } from './sdk';

// Seeker/SGT verification - from modules/seeker
export {
  isSeekerDevice,
  verifySeeker,
  detectSeekerUser,
  findSeekerMintForOwner,
  type SeekerDetectionResult,
} from './modules/seeker';

// H3 helpers
export {
  latLngToH3Cell,
  locationToH3Cell,
  h3CellToU64,
  type H3LocationInput,
} from './modules/h3';

// On-chain transaction helpers - from modules/onchain
export {
  buildRecordPhotoProofTransaction,
  buildRecordPhotoProofInstruction,
  buildInitializeTreeInstruction,
  deriveTreeConfigPda as deriveOnchainTreeConfigPda,
  deriveTreeAuthorityPda,
  PHOTO_PROOF_COMPRESSED_PROGRAM_ID,
  SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
  SPL_NOOP_PROGRAM_ID,
  PHOTO_PROOF_FEE_AUTHORITY,
  PHOTO_PROOF_ATTESTATION_AUTHORITY,
  buildAttestationMessage,
  sendTransactionWithKeypair,
  confirmTransaction,
  uploadAndSubmit,
  hashBytes,
} from './modules/onchain';

// Presign helpers - robust response parsing and UX-friendly errors
export {
  canonicalizeIntegrityPayload,
  requestAttestedPresignedPut,
  parseAttestedPresignResponse,
  decodeAttestationSignature64,
  PresignError,
  type PresignErrorCode,
  type PresignIntegrityPayload,
  type PresignIntegrityEnvelope,
  type AttestedPresignResponse,
} from './modules/presign';
