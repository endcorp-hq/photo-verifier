/**
 * Unified Photo Verifier SDK
 *
 * High-level API for capture/hash/upload flows.
 * On-chain write/verify methods require explicit runtime configuration.
 */

import { Connection, PublicKey, clusterApiUrl, type VersionedTransaction } from '@solana/web3.js';
import type { CameraView } from 'expo-camera';
import {
  type CaptureResult,
  type GeoLocation,
  type S3Config,
  buildS3KeyForPhoto,
  buildS3Uri,
  blake3Hash
} from '@photoverifier/core';
import { captureAndPersist, readFileAsBytes } from '@photoverifier/core-mobile/camera';
import { getCurrentLocation } from '@photoverifier/core-mobile/location';
import {
  decodeLicenseKey,
  hasFeature,
  TREE_CONFIGS,
  UsageTracker,
  type LicenseInfo,
  type VerificationResult
} from '@photoverifier/blockchain';
import { locationToH3Cell, h3CellToU64 } from './modules/h3';
import { submitRecordPhotoProof } from './modules/onchain';

export interface PhotoVerifierConfig {
  licenseKey?: string;
  rpcUrl?: string;
  s3Config?: S3Config;
  s3Bucket?: string;
  treeConfig?: 'small' | 'medium' | 'large';
  proofIndexEndpoint?: string;
}

export type ProofRuntimeAttestationInput = {
  owner: PublicKey;
  hash32: Uint8Array;
  hashHex: string;
  nonce: bigint;
  timestampSec: number;
  h3Cell: string;
  h3CellU64: bigint;
};

const DEFAULT_RPC_URL = clusterApiUrl('devnet');
const MILLISECONDS_PER_SECOND = 1_000;

export interface ProofRuntimeConfig {
  sendTransaction: (tx: VersionedTransaction) => Promise<string>;
  resolveAttestationSignature64: (
    input: ProofRuntimeAttestationInput
  ) => Promise<Uint8Array>;
  verifyProofByHash?: (hashHex: string) => Promise<VerificationResult>;
  h3Resolution?: number;
  createNonce?: () => number | bigint;
}

export interface PhotoVerifierOptions {
  connection?: Connection;
  authority?: PublicKey;
  proofRuntime?: ProofRuntimeConfig;
}

export class MissingProofRuntimeError extends Error {
  constructor(operation: 'storeProof' | 'verifyProof' | 'verifyProofPresence', message: string) {
    super(`${operation} runtime unavailable: ${message}`);
    this.name = 'MissingProofRuntimeError';
  }
}

/**
 * Photo data collected from device
 */
interface PhotoData {
  photoBytes: Uint8Array;
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
  private proofRuntime?: ProofRuntimeConfig;
  private proofIndexEndpoint?: string;

  constructor(config: PhotoVerifierConfig = {}, options: PhotoVerifierOptions = {}) {
    this.rpcUrl = config.rpcUrl ?? DEFAULT_RPC_URL;
    this.s3Config = config.s3Config;
    this.s3Bucket = config.s3Bucket;
    this.treeConfig = config.treeConfig ?? 'medium';
    this.connection = options.connection ?? new Connection(this.rpcUrl, 'confirmed');
    this.authority = options.authority;
    this.proofRuntime = options.proofRuntime;
    this.proofIndexEndpoint = config.proofIndexEndpoint?.trim() || undefined;

    // Validate license if provided
    if (config.licenseKey) {
      const result = decodeLicenseKey(config.licenseKey, this.getLicenseSecret());
      if (result.valid && result.license) {
        this.license = result.license;
        this.usageTracker = new UsageTracker(result.license);
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

  setProofRuntime(runtime: ProofRuntimeConfig): void {
    this.proofRuntime = runtime;
  }

  /**
   * Check if blockchain features are available
   */
  hasBlockchainAccess(): boolean {
    return this.license !== null && hasFeature(this.license, 'compressed-accounts');
  }

  hasStoreProofRuntime(): boolean {
    return (
      this.hasBlockchainAccess() &&
      this.connection !== undefined &&
      this.authority !== undefined &&
      this.proofRuntime !== undefined &&
      typeof this.proofRuntime.sendTransaction === 'function' &&
      typeof this.proofRuntime.resolveAttestationSignature64 === 'function'
    );
  }

  hasVerifyProofRuntime(): boolean {
    return typeof this.proofRuntime?.verifyProofByHash === 'function';
  }

  hasVerifyProofPresenceRuntime(): boolean {
    return typeof this.proofIndexEndpoint === 'string';
  }

  getCapabilities(): {
    capturePhoto: boolean;
    hashPhoto: boolean;
    uploadToS3: boolean;
    storeProof: boolean;
    verifyProof: boolean;
    verifyProofPresence: boolean;
  } {
    return {
      capturePhoto: true,
      hashPhoto: true,
      uploadToS3: Boolean(this.s3Config && this.s3Bucket),
      storeProof: this.hasStoreProofRuntime(),
      verifyProof: this.hasVerifyProofRuntime(),
      verifyProofPresence: this.hasVerifyProofPresenceRuntime(),
    };
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
      photoBytes: bytes,
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
      photoBytes: bytes,
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
    if (!data.photoBytes?.length) {
      throw new Error('Photo bytes required for S3 upload');
    }

    const key = buildS3KeyForPhoto({
      seekerMint: data.seekerMint,
      photoHashHex: data.hashHex,
    });

    const result = await this.s3Config.upload({
      key,
      contentType: 'image/jpeg',
      bytes: data.photoBytes,
    });

    const returnedKey = result.key ?? key;
    data.s3Uri = buildS3Uri(this.s3Bucket, returnedKey);
    return data.s3Uri;
  }

  /**
   * Store proof on-chain using configured runtime hooks.
   */
  async storeProof(data: PhotoData): Promise<{
    signature: string;
    treeAddress: PublicKey;
  }> {
    if (!this.hasBlockchainAccess()) {
      throw new Error('Blockchain access is not available for this license tier.');
    }
    if (!this.connection) {
      throw new MissingProofRuntimeError('storeProof', 'connection is not configured');
    }
    if (!this.authority) {
      throw new MissingProofRuntimeError('storeProof', 'authority is not configured');
    }
    if (!this.proofRuntime) {
      throw new MissingProofRuntimeError('storeProof', 'proofRuntime is not configured');
    }
    if (!this.proofRuntime.sendTransaction) {
      throw new MissingProofRuntimeError('storeProof', 'sendTransaction is required');
    }
    if (!this.proofRuntime.resolveAttestationSignature64) {
      throw new MissingProofRuntimeError(
        'storeProof',
        'resolveAttestationSignature64 is required'
      );
    }
    if (!data.hashBytes || data.hashBytes.length !== 32) {
      throw new Error('Photo hash bytes must be exactly 32 bytes.');
    }
    if (!data.location) {
      throw new Error('Photo location is required to submit on-chain proof.');
    }
    const proofRuntime = this.proofRuntime;

    const h3Resolution = proofRuntime.h3Resolution ?? 7;
    const h3Cell = locationToH3Cell(data.location, h3Resolution);
    const h3CellU64 = h3CellToU64(h3Cell);
    const timestampSec = Math.trunc(data.timestamp.getTime() / MILLISECONDS_PER_SECOND);
    const nonce = normalizeNonce(proofRuntime.createNonce?.() ?? Date.now());

    const attestationInput: ProofRuntimeAttestationInput = {
      owner: this.authority,
      hash32: data.hashBytes,
      hashHex: data.hashHex,
      nonce,
      timestampSec,
      h3Cell,
      h3CellU64,
    };
    const attestationSignature64 =
      await proofRuntime.resolveAttestationSignature64(attestationInput);
    if (attestationSignature64.length !== 64) {
      throw new Error(
        `resolveAttestationSignature64 must return 64 bytes, got ${attestationSignature64.length}`
      );
    }

    const { signature, merkleTree } = await submitRecordPhotoProof({
      connection: this.connection,
      owner: this.authority,
      sendTransaction: async (tx) => proofRuntime.sendTransaction(tx as VersionedTransaction),
      hash32: data.hashBytes,
      nonce,
      timestamp: timestampSec,
      h3Cell,
      attestationSignature64,
    });

    return { signature, treeAddress: merkleTree };
  }

  /**
   * Verify proof using a runtime verifier or index endpoint.
   */
  async verifyProof(hash: string): Promise<VerificationResult> {
    const hashHex = normalizeHashHex(hash);
    if (typeof this.proofRuntime?.verifyProofByHash === 'function') {
      return this.proofRuntime.verifyProofByHash(hashHex);
    }
    if (this.proofIndexEndpoint) {
      throw new MissingProofRuntimeError(
        'verifyProof',
        'proofIndexEndpoint provides presence checks only; use verifyProofPresence'
      );
    }
    throw new MissingProofRuntimeError(
      'verifyProof',
      'configure proofRuntime.verifyProofByHash'
    );
  }

  /**
   * Verify proof presence via index endpoint.
   * Returns `{ valid, proof: null }` because index responses do not include full proof payloads.
   */
  async verifyProofPresence(hash: string): Promise<VerificationResult> {
    const hashHex = normalizeHashHex(hash);
    if (!this.proofIndexEndpoint) {
      throw new MissingProofRuntimeError(
        'verifyProofPresence',
        'configure proofIndexEndpoint'
      );
    }
    return verifyProofViaIndex(this.proofIndexEndpoint, hashHex);
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
    const secret = process.env.PHOTO_VERIFIER_LICENSE_SECRET?.trim();
    if (!secret) {
      throw new Error('PHOTO_VERIFIER_LICENSE_SECRET is required to validate license keys.');
    }
    return secret;
  }
}

function normalizeNonce(value: number | bigint): bigint {
  const nonce = typeof value === 'bigint' ? value : BigInt(Math.trunc(value));
  if (nonce < 0n) throw new Error('Nonce must be non-negative.');
  return nonce;
}

function normalizeHashHex(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/^0x/, '');
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new Error('Hash must be a 32-byte hex string.');
  }
  return normalized;
}

type ProofIndexEntry = {
  hashHex?: string;
};

async function verifyProofViaIndex(
  endpoint: string,
  targetHashHex: string
): Promise<VerificationResult> {
  const requestUrl = withQueryHash(endpoint, targetHashHex);
  const response = await fetch(requestUrl);
  if (!response.ok) {
    throw new Error(`Proof index lookup failed (${response.status}).`);
  }
  const json = (await response.json()) as { entries?: ProofIndexEntry[] };
  const entries = Array.isArray(json.entries) ? json.entries : [];
  const found = entries.some((entry) => {
    if (typeof entry?.hashHex !== 'string') return false;
    try {
      return normalizeHashHex(entry.hashHex) === targetHashHex;
    } catch {
      return false;
    }
  });
  return { valid: found, proof: null };
}

function withQueryHash(endpoint: string, hashHex: string): string {
  try {
    const url = new URL(endpoint);
    if (!url.searchParams.has('hash')) {
      url.searchParams.set('hash', hashHex);
    }
    return url.toString();
  } catch {
    const separator = endpoint.includes('?') ? '&' : '?';
    return `${endpoint}${separator}hash=${encodeURIComponent(hashHex)}`;
  }
}
