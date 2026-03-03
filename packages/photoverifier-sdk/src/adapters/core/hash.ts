import { blake3 } from '@noble/hashes/blake3';
import { bytesToHex } from '@noble/hashes/utils';
import { toUint8Array } from 'js-base64';

/**
 * Compute Blake3 hash from Base64-encoded image data
 * This is the core hashing function - free and open source
 */
export function blake3HexFromBase64(base64: string): string {
  const bytes = toUint8Array(base64);
  return bytesToHex(blake3(bytes));
}

/**
 * Compute Blake3 hash from Uint8Array
 */
export function blake3HexFromBytes(bytes: Uint8Array): string {
  return bytesToHex(blake3(bytes));
}

/**
 * Compute Blake3 hash and return both bytes and hex
 */
export function blake3Hash(bytes: Uint8Array): { hash32: Uint8Array; hashHex: string } {
  const digest = blake3(bytes);
  return { hash32: digest, hashHex: bytesToHex(digest) };
}

export type { Blake3HashResult } from './types';
