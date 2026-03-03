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

export * from './compressed.js';
export * from './contracts/compressed-contracts.js';
export * from './serialization/compressed-proof.js';
export * from './economics/tree-cost.js';
export * from './license.js';
export * from './types.js';

// Re-export commonly used functions
export {
  PHOTO_PROOF_PROGRAM_ID,
  BUBBLEGUM_PROGRAM_ID,
  TREE_CONFIGS,
  deriveTreeConfigPda,
  deriveAuthorityPda,
} from './contracts/compressed-contracts.js';

export {
  serializePhotoProof,
  deserializePhotoProof,
  hashPhotoProof,
  createLeafSchema,
} from './serialization/compressed-proof.js';

export {
  calculateTreeCost,
  getTreeCapacity,
  estimateCostPerPhoto,
} from './economics/tree-cost.js';

export {
  LICENSE_TIERS,
  encodeLicenseKey,
  decodeLicenseKey,
  hasFeature,
  createDemoLicenseKey,
  UsageTracker,
} from './license.js';
