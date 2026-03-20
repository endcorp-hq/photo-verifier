import { getConcurrentMerkleTreeAccountSize } from '@solana/spl-account-compression';
import type { Connection } from '@solana/web3.js';
import type { TreeConfig } from '../contracts/compressed-contracts.js';

export async function calculateTreeCost(
  connection: Connection,
  config: TreeConfig
): Promise<number> {
  const treeSize = getConcurrentMerkleTreeAccountSize(
    config.maxDepth,
    config.maxBufferSize,
    config.canopyDepth
  );
  const lamports = await connection.getMinimumBalanceForRentExemption(treeSize);
  return lamports;
}

export function getTreeCapacity(config: TreeConfig): number {
  return Math.pow(2, config.maxDepth);
}

function normalizeExpectedPhotos(expectedPhotos: number): number {
  const normalized = Math.trunc(expectedPhotos);
  if (!Number.isFinite(expectedPhotos) || normalized <= 0) {
    throw new Error('expectedPhotos must be a positive finite integer');
  }
  return normalized;
}

export async function estimateCostPerPhoto(
  connection: Connection,
  config: TreeConfig,
  expectedPhotos: number
): Promise<number> {
  const treeCost = await calculateTreeCost(connection, config);
  const normalizedExpectedPhotos = normalizeExpectedPhotos(expectedPhotos);
  const lamportsPerPhoto = treeCost / Math.min(normalizedExpectedPhotos, getTreeCapacity(config));
  return lamportsPerPhoto;
}
