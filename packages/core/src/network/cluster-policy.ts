import { HELIUS_TX_API_BASE_BY_CLUSTER } from '../contracts/api-contracts.js';
import type { SupportedSolanaCluster } from '../contracts/chain-contracts.js';

export type ExplorerCluster = SupportedSolanaCluster;
export type ClusterNetworkPolicy = ExplorerCluster | 'custom';

export function inferExplorerCluster(rpcUrl: string): ExplorerCluster {
  const lower = rpcUrl.toLowerCase();
  if (lower.includes('testnet')) return 'testnet';
  if (lower.includes('mainnet')) return 'mainnet-beta';
  return 'devnet';
}

export function inferHeliusTxApiBase(
  rpcUrl: string,
  cluster: ExplorerCluster,
  heliusApiKey?: string | null
): string | null {
  const lower = rpcUrl.toLowerCase();
  const looksLikeHelius = lower.includes('helius');
  if (!looksLikeHelius && !heliusApiKey) return null;
  return HELIUS_TX_API_BASE_BY_CLUSTER[cluster];
}

export function getExplorerClusterUrlParam(
  network: ClusterNetworkPolicy,
  endpoint?: string
): string {
  let suffix = '';
  switch (network) {
    case 'devnet':
      suffix = 'devnet';
      break;
    case 'mainnet-beta':
      suffix = '';
      break;
    case 'testnet':
      suffix = 'testnet';
      break;
    default:
      suffix = `custom&customUrl=${encodeURIComponent(endpoint ?? '')}`;
      break;
  }

  return suffix.length ? `?cluster=${suffix}` : '';
}
