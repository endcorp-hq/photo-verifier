// Core SDK - Free and Open Source
// This module contains non-blockchain functionality:
// - Blake3 hashing
// - Camera capture
// - Location services
// - S3 storage abstraction

export * from './hash';
export * from './camera';
export * from './location';
export * from './storage';
export * from './types';

// Re-export commonly used functions for convenience
export { blake3HexFromBase64, blake3HexFromBytes, blake3Hash } from './hash';
export { captureAndPersist, readFileAsBase64, readFileAsBytes } from './camera';
export { 
  getCurrentLocation, 
  hasLocationServicesEnabled, 
  requestLocationPermission,
  locationToString,
  parseLocationString 
} from './location';
export { 
  uploadBytes, 
  buildS3KeyForPhoto, 
  buildS3Uri, 
  parseS3Uri, 
  putToPresignedUrl 
} from './storage';
