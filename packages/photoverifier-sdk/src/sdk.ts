/**
 * Unified Photo Verifier SDK
 * 
 * High-level API that combines core and blockchain functionality
 */

import { Connection, PublicKey } from '@solana/web3.js';
import type { CameraView } from 'expo-camera';
import type { GeoLocation, CaptureResult, S3Config } from '@photoverifier/core';
import {
  blake3Hash,
  captureAndPersist,
  readFileAsBytes,
  getCurrentLocation,
  buildS3KeyForPhoto,
  buildS3Uri,
  putToPresignedUrl,
} from '@photoverifier/core';
import {
  decodeLicenseKey,
  hasFeature,
  UsageTracker,
  PhotoProof,
  serializePhotoProof,
  TREE_CONFIGS,
  type LicenseInfo,
  type LicenseValidationResult,
  type VerificationResult,
} from '@photoverifier/blockchain';

export interface PhotoVerifierConfig {
  licenseKey?: string;
  rpcUrl?: string;
  s3Config?: S3Config;
  s3Bucket?: string;
  treeConfig?: 'small' | 'medium' | 'large';
}

export interface PhotoVerifierOptions {
  connection?: Connection;
  authority?: PublicKey;
}

/**
 * Photo data collected from device
 */
export interface PhotoData {
  hashHex: string;
  hashBytes: Uint8Array;
  timestamp: Date;
  location: GeoLocation | null;
  owner: PublicKey;
  seekerMint?: string;
  s3Uri?: string;
}

/**
 * Unified SDK for photo verification
 * 
 * @example
 * ```typescript
 * const verifier = new PhotoVerifier({
 *   licenseKey: 'your-license-key',
 *   rpcUrl: 'https://api.devnet.solana.com',
 * });
 * 
 * // Capture and hash photo
 * const { hashHex, timestamp, location } = await verifier.capturePhoto(cameraRef);
 * 
 * // Upload to S3 (requires S3 config)
 * await verifier.uploadToS3(photoData);
 * 
 * // Store proof on chain (requires license)
 * await verifier.storeProof(photoData);
 * ```
 */
export class PhotoVerifier {
  private license: LicenseInfo | null = null;
  private usageTracker: UsageTracker | null = null;
  private rpcUrl: string;
  private s3Config?: S3Config;
  private s3Bucket?: string;
  private treeConfig: 'small' | 'medium' | 'large';
  private connection?: Connection;
  private authority?: PublicKey;

  constructor(config: PhotoVerifierConfig = {}, options: PhotoVerifierOptions = {}) {
    this.rpcUrl = config.rpcUrl ?? 'https://api.devnet.solana.com';
    this.s3Config = config.s3Config;
    this.s3Bucket = config.s3Bucket;
    this.treeConfig = config.treeConfig ?? 'medium';
    this.connection = options.connection;
    this.authority = options.authority;

    // Validate license if provided
    if (config.licenseKey) {
      const result = decodeLicenseKey(config.licenseKey, this.getLicenseSecret());
      if (result.valid && result.license) {
        this.license = result.license;
        this.usageTracker = new UsageTracker(result.license);
        console.log(`[PhotoVerifier] License activated: ${result.license.tier}`);
      } else {
        console.warn(`[PhotoVerifier] Invalid license: ${result.error}`);
      }
    }
  }

  /**
   * Set the Solana connection
   */
  setConnection(connection: Connection): void {
    this.connection = connection;
  }

  /**
   * Set the authority (wallet) for transactions
   */
  setAuthority(authority: PublicKey): void {
    this.authority = authority;
  }

  /**
   * Check if blockchain features are available
   */
  hasBlockchainAccess(): boolean {
    return this.license !== null && hasFeature(this.license!, 'compressed-accounts');
  }

  /**
   * Get current license info
   */
  getLicense(): LicenseInfo | null {
    return this.license;
  }

  /**
   * Get usage tracker
   */
  getUsageTracker(): UsageTracker | null {
    return this.usageTracker;
  }

  /**
   * Capture a photo and compute its hash
   * Core functionality - no license required
   */
  async capturePhoto(cameraRef: React.RefObject<CameraView>): Promise<{
    capture: CaptureResult;
    data: PhotoData;
  }> {
    // Capture photo
    const capture = await captureAndPersist(cameraRef);
    
    // Read and hash
    const bytes = await readFileAsBytes(capture.assetUri);
    const { hash32, hashHex } = blake3Hash(bytes);
    
    // Get location
    const location = await getCurrentLocation();
    
    // Create photo data
    const data: PhotoData = {
      hashHex,
      hashBytes: hash32,
      timestamp: new Date(),
      location,
      owner: this.authority ?? PublicKey.default,
    };
    
    return { capture, data };
  }

  /**
   * Hash existing photo data
   * Core functionality - no license required
   */
  async hashPhoto(uri: string): Promise<PhotoData> {
    const bytes = await readFileAsBytes(uri);
    const { hash32, hashHex } = blake3Hash(bytes);
    const location = await getCurrentLocation();
    
    return {
      hashHex,
      hashBytes: hash32,
      timestamp: new Date(),
      location,
      owner: this.authority ?? PublicKey.default,
    };
  }

  /**
   * Upload photo to S3
   * Core functionality - no license required
   * Requires S3 config to be provided
   */
  async uploadToS3(data: PhotoData): Promise<string> {
    if (!this.s3Config || !this.s3Bucket) {
      throw new Error('S3 not configured. Provide s3Config in constructor.');
    }

    if (!data.seekerMint) {
      throw new Error('Seeker mint required for S3 upload');
    }

    const key = buildS3KeyForPhoto({
      seekerMint: data.seekerMint,
      photoHashHex: data.hashHex,
    });

    const result = await this.s3Config.upload({
      key,
      contentType: 'image/jpeg',
      bytes: data.hashBytes, // Note: Should upload actual image bytes, not just hash
    });

    const returnedKey = result.key ?? key;
    data.s3Uri = buildS3Uri(this.s3Bucket, returnedKey);
    return data.s3Uri;
      key,
      contentType: 'image/jpeg',
      bytes: data.hashBytes, // Note: Should upload actual image bytes, not just hash
    });

    data.s3Uri = buildS3Uri(this.s3Bucket, result.key);
    return data.s3Uri;
  }

  /**
   * Store proof on Solana blockchain
   * Requires license
   * 
   * Note: This is a placeholder. Full implementation requires:
   * 1. Merkle tree setup (one-time)
   * 2. Bubblegum program integration
   * 3. Transaction building and signing
   */
  async storeProof(data: PhotoData): Promise<{
    signature: string;
    treeAddress: PublicKey;
  }> {
    if (!this.hasBlockchainAccess()) {
      throw new Error('Blockchain access requires a valid license. Use compressed-accounts tier or higher.');
    }

    if (!this.usageTracker?.recordPhoto()) {
      throw new Error('Photo limit exceeded. Please upgrade your license.');
    }

    if (!this.connection || !this.authority) {
      throw new Error('Connection and authority required. Call setConnection() and setAuthority() first.');
    }

    // This is where the actual Bubblegum/compression logic would go
    // For now, return a placeholder
    console.log('[PhotoVerifier] Storing proof:', {
      hash: data.hashHex,
      timestamp: data.timestamp.toISOString(),
      location: data.location,
    });

    // Placeholder - would create actual transaction here
    const treeAddress = PublicKey.default; // Would be actual tree address

    return {
      signature: 'placeholder-signature',
      treeAddress,
    };
  }

  /**
   * Verify a photo proof on-chain
   * Requires license
   */
  async verifyProof(hash: string): Promise<VerificationResult> {
    if (!this.hasBlockchainAccess()) {
      throw new Error('Verification requires a valid license.');
    }

    // Would query the DAS API or on-chain data
    // Placeholder implementation
    return {
      valid: false,
      proof: null,
    };
  }

  /**
   * Get tree configuration for current tier
   */
  getTreeConfig() {
    return TREE_CONFIGS[this.treeConfig];
  }

  /**
   * Get license secret (should be env var in production)
   */
  private getLicenseSecret(): string {
    // In production, this should come from environment variables
    return process.env.PHOTO_VERIFIER_LICENSE_SECRET ?? 'demo-secret-change-in-production';
  }
}
