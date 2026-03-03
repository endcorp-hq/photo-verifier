// Core SDK - Portable primitives
// This module contains runtime-agnostic functionality:
// - Blake3 hashing
// - S3 storage abstraction
// - Shared types/contracts
// - Theming tokens/providers

export * from './hash.js';
export * from './storage.js';
export * from './types.js';
export * from './network/cluster-policy.js';
export * from './contracts/chain-contracts.js';
export * from './contracts/api-contracts.js';

// Theming
export * from './theme.js';
export * from './theme-provider.js';

// Re-export commonly used functions for convenience
export { blake3HexFromBase64, blake3HexFromBytes, blake3Hash } from './hash.js';
export { 
  uploadBytes, 
  buildS3KeyForPhoto, 
  parseS3PhotoKey,
  buildS3Uri, 
  parseS3Uri, 
  putToPresignedUrl 
} from './storage.js';
