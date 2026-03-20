/**
 * License Management Module
 * 
 * Handles license key validation and feature gating
 * LICENSE: Required for blockchain features
 */

import type { LicenseInfo, LicenseValidationResult } from './types.js';

/**
 * License tier configurations
 */
export const LICENSE_TIERS = {
  free: {
    name: 'Free',
    maxPhotos: 0,
    features: ['core-sdk'],
    price: 0,
  },
  startup: {
    name: 'Startup',
    maxPhotos: 1000,
    features: ['core-sdk', 'compressed-accounts', 'white-label'],
    price: 99,
  },
  enterprise: {
    name: 'Enterprise',
    maxPhotos: -1, // unlimited
    features: ['core-sdk', 'compressed-accounts', 'white-label', 'dedicated-support', 'custom-integration'],
    price: 499,
  },
} as const;

/**
 * Encode license key (simple encoding for demo - production should use proper encryption)
 * Format: base64(tier:maxPhotos:expires:signature)
 */
export function encodeLicenseKey(params: {
  tier: keyof typeof LICENSE_TIERS;
  maxPhotos: number;
  expiresAt: number | null;
  secret: string;
}): string {
  const { tier, maxPhotos, expiresAt, secret } = params;
  const data = `${tier}:${maxPhotos}:${expiresAt ?? 'never'}`;
  const signature = simpleHash(`${data}:${secret}`);
  
  return btoa(`${data}:${signature}`);
}

/**
 * Decode and validate license key
 */
export function decodeLicenseKey(licenseKey: string, secret: string): LicenseValidationResult {
  try {
    const decoded = atob(licenseKey);
    const parts = decoded.split(':');
    
    if (parts.length < 4) {
      return { valid: false, error: 'Invalid license key format' };
    }

    const [tier, maxPhotosStr, expiresStr, signature] = parts;
    const expectedSig = simpleHash(`${parts.slice(0, 3).join(':')}:${secret}`);
    
    if (signature !== expectedSig) {
      return { valid: false, error: 'Invalid license signature' };
    }

    const maxPhotos = parseInt(maxPhotosStr, 10);
    const expiresAt = expiresStr === 'never' ? null : new Date(parseInt(expiresStr, 10) * 1000);
    
    if (expiresAt && expiresAt.getTime() < Date.now()) {
      return { valid: false, error: 'License expired' };
    }

    const tierConfig = LICENSE_TIERS[tier as keyof typeof LICENSE_TIERS];
    if (!tierConfig) {
      return { valid: false, error: 'Unknown license tier' };
    }

    return {
      valid: true,
      license: {
        licenseKey,
        tier: tier as LicenseInfo['tier'],
        maxPhotos,
        expiresAt,
        features: [...tierConfig.features],
      },
    };
  } catch {
    return { valid: false, error: 'Failed to decode license key' };
  }
}

/**
 * Simple hash function for demo purposes
 * Production should use HMAC-SHA256
 */
function simpleHash(data: string): string {
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

/**
 * Check if a feature is enabled for a license
 */
export function hasFeature(license: LicenseInfo, feature: string): boolean {
  return license.features.includes(feature);
}

/**
 * Create a demo license key (for testing only)
 */
function requireDemoLicenseSecret(secret?: string): string {
  const resolvedSecret = secret?.trim();
  if (resolvedSecret) {
    return resolvedSecret;
  }

  throw new Error(
    'PHOTO_VERIFIER_DEMO_LICENSE_SECRET is required to create demo license keys.'
  );
}

export function createDemoLicenseKey(
  tier: keyof typeof LICENSE_TIERS = 'startup',
  secret = process.env.PHOTO_VERIFIER_DEMO_LICENSE_SECRET
): string {
  return encodeLicenseKey({
    tier,
    maxPhotos: LICENSE_TIERS[tier].maxPhotos,
    expiresAt: tier === 'free' ? null : Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60, // 30 days
    secret: requireDemoLicenseSecret(secret),
  });
}

/**
 * Usage tracking for license enforcement
 */
export class UsageTracker {
  private usage: Map<string, number> = new Map();
  private license: LicenseInfo;
  
  constructor(license: LicenseInfo) {
    this.license = license;
  }
  
  /**
   * Record a photo verification
   */
  recordPhoto(): boolean {
    const current = this.usage.get('photos') || 0;
    
    if (this.license.maxPhotos > 0 && current >= this.license.maxPhotos) {
      return false; // Limit exceeded
    }
    
    this.usage.set('photos', current + 1);
    return true;
  }
  
  /**
   * Get current photo count
   */
  getPhotoCount(): number {
    return this.usage.get('photos') || 0;
  }
  
  /**
   * Get remaining photos allowed
   */
  getRemainingPhotos(): number {
    if (this.license.maxPhotos < 0) return -1; // unlimited
    return this.license.maxPhotos - this.getPhotoCount();
  }
  
  /**
   * Reset usage (for new billing period)
   */
  reset(): void {
    this.usage.clear();
  }
  
  /**
   * Export usage data for syncing
   */
  exportUsage(): string {
    return btoa(JSON.stringify(Object.fromEntries(this.usage)));
  }
  
  /**
   * Import usage data
   */
  importUsage(data: string): void {
    try {
      const parsed = JSON.parse(atob(data));
      this.usage = new Map(Object.entries(parsed));
    } catch {
      // Invalid data, ignore
    }
  }
}
