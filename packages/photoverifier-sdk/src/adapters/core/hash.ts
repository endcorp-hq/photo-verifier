/**
 * Canonical hash logic lives in @photoverifier/core.
 * Keep this compatibility adapter for non-Expo runtime parity tests.
 */
export {
  blake3HexFromBase64,
  blake3HexFromBytes,
  blake3Hash,
} from '@photoverifier/core/dist/hash.js';
