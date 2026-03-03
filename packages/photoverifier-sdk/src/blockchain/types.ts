/**
 * Blockchain layer type definitions
 */

import type { PublicKey } from '@solana/web3.js';
import type { PhotoProof } from './compressed';

export type { PhotoProof };

export interface LicenseInfo {
  licenseKey: string;
  tier: 'free' | 'startup' | 'enterprise';
  maxPhotos: number;
  expiresAt: Date | null;
  features: string[];
}

export interface LicenseValidationResult {
  valid: boolean;
  license?: LicenseInfo;
  error?: string;
}

export interface CompressedAccountConfig {
  treeAddress: PublicKey;
  treeAuthority: PublicKey;
  maxDepth: number;
  maxBufferSize: number;
}

export interface PhotoProofResult {
  photoDataPda: PublicKey;
  signature: string;
  proof: Uint8Array[];
  root: Uint8Array;
  leaf: Uint8Array;
}

export interface VerificationResult {
  valid: boolean;
  proof: PhotoProof | null;
  metadata?: {
    timestamp: number;
    location: { lat: number; lng: number };
    hash: string;
  };
}
