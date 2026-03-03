import type { SupportedSolanaCluster } from './chain-contracts.js';

export const API_CONTRACT_VERSION = 'v1';

export const HELIUS_TX_API_BASE_BY_CLUSTER: Record<
  SupportedSolanaCluster,
  string | null
> = {
  devnet: 'https://api-devnet.helius.xyz',
  'mainnet-beta': 'https://api.helius.xyz',
  testnet: null,
};
