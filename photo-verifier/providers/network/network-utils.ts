import type { Cluster } from '../../components/cluster/cluster'
import { ClusterNetwork } from '@/components/cluster/cluster-network'

function getExplorerClusterUrlParam(network: Cluster['network'], endpoint?: string): string {
  let suffix = ''

  switch (network) {
    case ClusterNetwork.Devnet:
      suffix = 'devnet'
      break
    case ClusterNetwork.Mainnet:
      suffix = ''
      break
    case ClusterNetwork.Testnet:
      suffix = 'testnet'
      break
    case ClusterNetwork.Custom:
    default:
      suffix = `custom&customUrl=${encodeURIComponent(endpoint ?? '')}`
      break
  }

  return suffix.length ? `?cluster=${suffix}` : ''
}

export function resolveInitialCluster(clusters: readonly Cluster[]): Cluster {
  if (!clusters.length) {
    throw new Error('At least one cluster configuration is required')
  }
  return clusters[0]
}

export function sortClustersByName(clusters: readonly Cluster[]): Cluster[] {
  return [...clusters].sort((a, b) => a.name.localeCompare(b.name))
}

export function buildExplorerUrl(path: string, cluster: Pick<Cluster, 'network' | 'endpoint'>): string {
  return `https://explorer.solana.com/${path}${getExplorerClusterUrlParam(
    cluster.network,
    cluster.endpoint,
  )}`
}
