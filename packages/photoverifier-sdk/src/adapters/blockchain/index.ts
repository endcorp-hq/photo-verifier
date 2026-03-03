/**
 * Blockchain Layer - Licensed Component
 * 
 * This module provides:
 * - Compressed account operations (Solana state compression)
 * - Merkle tree management
 * - License validation and usage tracking
 * 
 * LICENSE: This component requires a valid license key
 */

export * from './compressed';
export * from './license';
export * from './types';

// Re-export commonly used functions
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
} from './compressed';

export {
  LICENSE_TIERS,
  encodeLicenseKey,
  decodeLicenseKey,
  hasFeature,
  createDemoLicenseKey,
  UsageTracker,
} from './license';
