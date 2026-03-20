/**
 * Citizen Science SDK - Unified Photo Verification
 * 
 * This is the main entry point for the SDK. It provides:
 * - Core functionality (free): Camera, hashing, location, storage
 * - Blockchain functionality (licensed): Compressed accounts, verification
 * 
 * Usage:
 * 
 * import { blake3HexFromBytes } from '@endcorp/photoverifier-sdk/core';
 * 
 * const hashHex = blake3HexFromBytes(photoBytes);
 */

// Core - always available (free)
export {
  // Hashing
  blake3HexFromBase64,
  blake3HexFromBytes,
  blake3Hash,
  // Storage
  uploadBytes,
  buildS3KeyForPhoto,
  parseS3PhotoKey,
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
  type S3UploadRequest,
  type S3UploadResult,
  type PresignedPutRequest,
  type S3UriParts,
  type S3PhotoKeyParseParams,
  type S3StorageRuntimeConfig,
} from '@photoverifier/core';

export {
  // Camera
  captureAndPersist,
  readFileAsBase64,
  readFileAsBytes,
} from '@photoverifier/core-mobile/camera';

export {
  // Location
  getCurrentLocation,
  hasLocationServicesEnabled,
  requestLocationPermission,
  locationToString,
  parseLocationString,
} from '@photoverifier/core-mobile/location';

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
} from '@photoverifier/blockchain';

// Seeker/SGT verification - from modules/seeker
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
  deriveGlobalTreeConfigPda,
  deriveGlobalTreeAuthorityPda,
  PHOTO_PROOF_COMPRESSED_PROGRAM_ID,
  SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
  SPL_NOOP_PROGRAM_ID,
  PHOTO_PROOF_FEE_AUTHORITY,
  PHOTO_PROOF_ATTESTATION_AUTHORITY,
  buildAttestationMessage,
  sendTransactionWithKeypair,
  confirmTransaction,
  uploadAndSubmit,
  submitPhotoProofWithPresignedUpload,
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

// Experimental compatibility exports
export * as experimental from './experimental';
