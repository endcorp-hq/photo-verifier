/**
 * On-chain focused SDK entrypoint.
 * Exposes blockchain contracts, transaction builders, and attestation/presign helpers.
 */
export {
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
  LICENSE_TIERS,
  encodeLicenseKey,
  decodeLicenseKey,
  hasFeature,
  createDemoLicenseKey,
  UsageTracker,
  type LicenseInfo,
  type LicenseValidationResult,
} from '@photoverifier/blockchain';

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

export {
  h3CellToU64,
} from './modules/h3';
