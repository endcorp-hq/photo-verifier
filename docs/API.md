# Citizen Science SDK - API Reference

## Overview

The Citizen Science SDK provides photo verification capabilities with blockchain anchoring. It's designed to be integrated into mobile applications for capturing verifiable photos with cryptographic proof of authenticity.

## Package Structure

```
@citizen-science-sdk/
├── core/                    # Free, open-source (MIT)
│   ├── hash.ts              # Blake3 hashing
│   ├── camera.ts            # Camera capture
│   ├── location.ts          # Location services
│   ├── storage.ts           # S3 storage abstraction
│   ├── theme.ts             # Theming system
│   └── theme-provider.tsx   # React context provider
│
├── blockchain/              # Licensed component
│   ├── compressed.ts        # Compressed accounts
│   ├── license.ts           # License management
│   └── types.ts             # Type definitions
│
└── photoverifier-sdk/       # Unified SDK (recommended)
    └── sdk.ts               # High-level API
```

## Installation

```bash
# Install the unified SDK
npm install @citizen-science-sdk/photoverifier-sdk

# Peer dependencies (if not already installed)
npm install @solana/web3.js @solana/spl-token expo expo-camera expo-location expo-file-system expo-media-library
```

## Quick Start

```typescript
import { PhotoVerifier, darkTheme, ThemeProvider } from '@citizen-science-sdk/photoverifier-sdk';
import { Connection } from '@solana/web3.js';

// 1. Initialize with license (for blockchain features)
const verifier = new PhotoVerifier({
  licenseKey: 'your-license-key',
  rpcUrl: 'https://api.devnet.solana.com',
});

// 2. Set connection and authority
verifier.setConnection(new Connection('https://api.devnet.solana.com'));
verifier.setAuthority(wallet.publicKey);

// 3. Capture a photo
const { capture, data } = await verifier.capturePhoto(cameraRef);

// 4. Store proof on blockchain
const { signature } = await verifier.storeProof(data);
```

## Core API (Free)

These functions are available without a license:

### Hashing

```typescript
import { blake3HexFromBase64, blake3Hash } from '@citizen-science-sdk/core';

// Hash from Base64 string
const hash = blake3HexFromBase64(base64ImageData); // "abc123..."

// Hash from bytes
const { hash32, hashHex } = blake3Hash(imageBytes);
```

### Camera

```typescript
import { captureAndPersist, readFileAsBytes } from '@citizen-science-sdk/core';

// Capture photo
const { tempUri, assetUri } = await captureAndPersist(cameraRef);

// Read file as bytes
const bytes = await readFileAsBytes(assetUri);
```

### Location

```typescript
import { getCurrentLocation, locationToString } from '@citizen-science-sdk/core';

// Get current location
const location = await getCurrentLocation();
// { latitude: 37.7749, longitude: -122.4194, accuracy: 10 }

// Convert to storage format
const locString = locationToString(location); // "37.7749,-122.4194"
```

### Storage

```typescript
import { buildS3KeyForPhoto, buildS3Uri, putToPresignedUrl } from '@citizen-science-sdk/core';

// Build S3 key
const key = buildS3KeyForPhoto({
  seekerMint: 'MintAddress...',
  photoHashHex: 'abc123...',
}); // "photos/MintAddress/abc123...jpg"

// Upload to presigned URL
await putToPresignedUrl({
  url: 'https://s3.amazonaws.com/...',
  bytes: imageBytes,
  contentType: 'image/jpeg',
});
```

### Theming

```typescript
import { ThemeProvider, darkTheme, createCustomTheme, useTheme } from '@citizen-science-sdk/core';

// Use built-in dark theme
<ThemeProvider theme={darkTheme}>
  <App />
</ThemeProvider>

// Create custom theme
const myTheme = createCustomTheme({
  id: 'my-brand',
  name: 'My Brand',
  colors: {
    primary: '#FF5722',  // Override primary color
  },
  strings: {
    capturePhoto: 'Snap Issue',  // Custom button text
  },
});

// Access theme in components
function MyComponent() {
  const { colors, spacing, strings } = useTheme();
  return <Text style={{ color: colors.primary }}>{strings.capturePhoto}</Text>;
}
```

## Licensed API

These features require a valid license:

### PhotoVerifier Class

```typescript
import { PhotoVerifier } from '@citizen-science-sdk/photoverifier-sdk';

const verifier = new PhotoVerifier({
  licenseKey: string,           // Required for blockchain features
  rpcUrl?: string,               // Default: devnet
  s3Config?: S3Config,          // For S3 uploads
  s3Bucket?: string,            // S3 bucket name
  treeConfig?: 'small' | 'medium' | 'large',  // Default: medium
});
```

#### Methods

##### `capturePhoto(cameraRef)`
Capture a photo and compute its hash.
```typescript
const { capture, data } = await verifier.capturePhoto(cameraRef);
// capture: { tempUri, assetUri }
// data: { hashHex, hashBytes, timestamp, location, owner }
```

##### `hashPhoto(uri)`
Hash an existing photo.
```typescript
const data = await verifier.hashPhoto('file://path/to/photo.jpg');
```

##### `uploadToS3(data)`
Upload photo to S3 (requires S3 config).
```typescript
const s3Uri = await verifier.uploadToS3(data);
```

##### `storeProof(data)`
Store proof on Solana blockchain (requires license).
```typescript
const { signature, treeAddress } = await verifier.storeProof(data);
```

##### `verifyProof(hash)`
Verify an existing photo proof.
```typescript
const result = await verifier.verifyProof(hashHex);
// result: { valid: boolean, proof: PhotoProof | null }
```

##### `hasBlockchainAccess()`
Check if license allows blockchain features.
```typescript
const hasAccess = verifier.hasBlockchainAccess();
```

##### `getLicense()`
Get current license information.
```typescript
const license = verifier.getLicense();
// { tier: 'startup', maxPhotos: 1000, features: [...] }
```

### License Management

```typescript
import { 
  decodeLicenseKey, 
  createDemoLicenseKey, 
  UsageTracker,
  LICENSE_TIERS 
} from '@citizen-science-sdk/blockchain';

// Validate license
const result = decodeLicenseKey(licenseKey, secret);
if (result.valid) {
  console.log(result.license.tier); // 'startup', 'enterprise', etc.
}

// Create demo key (for testing)
const demoKey = createDemoLicenseKey('startup');

// Track usage
const tracker = new UsageTracker(license);
tracker.recordPhoto();       // Returns false if limit exceeded
tracker.getPhotoCount();    // Current count
tracker.getRemainingPhotos(); // Remaining (-1 for unlimited)
```

## Configuration

### License Tiers

| Tier | Photos/Month | Price | Features |
|------|-------------|-------|----------|
| Free | 0 | $0 | Core SDK only |
| Startup | 1,000 | $99/mo | Blockchain, White-label |
| Enterprise | Unlimited | $499/mo | Custom integration, Support |

### Tree Configurations

| Size | Capacity | Cost (one-time) | Cost/Photo |
|------|----------|----------------|------------|
| small | 1,000 | ~$5 | ~$0.005 |
| medium | 16,384 | ~$15 | ~$0.001 |
| large | 1,048,576 | ~$100 | ~$0.0001 |

## Error Handling

```typescript
try {
  await verifier.storeProof(data);
} catch (error) {
  if (error.message.includes('License')) {
    // Handle license error
  } else if (error.message.includes('Tree is full')) {
    // Handle capacity error
  } else {
    // Handle other errors
  }
}
```

## TypeScript Types

```typescript
// Photo data
interface PhotoData {
  hashHex: string;
  hashBytes: Uint8Array;
  timestamp: Date;
  location: GeoLocation | null;
  owner: PublicKey;
  seekerMint?: string;
  s3Uri?: string;
}

// Location
interface GeoLocation {
  latitude: number;
  longitude: number;
  accuracy?: number;
}

// License
interface LicenseInfo {
  licenseKey: string;
  tier: 'free' | 'startup' | 'enterprise';
  maxPhotos: number;
  expiresAt: Date | null;
  features: string[];
}

// Verification result
interface VerificationResult {
  valid: boolean;
  proof: PhotoProof | null;
  metadata?: {
    timestamp: number;
    location: { lat: number; lng: number };
    hash: string;
  };
}
```

## License

- **Core SDK**: MIT License (free, open source)
- **Blockchain Layer**: Proprietary (requires license)

See LICENSE files in respective packages for details.
