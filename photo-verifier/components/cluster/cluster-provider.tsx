import { type ReactNode, useMemo } from 'react'
import { type Cluster } from '@/components/cluster/cluster'
import { NetworkProvider, useNetwork } from '@/providers/network/network-provider'

type ClusterProviderContext = {
  selectedCluster: Cluster
  clusters: Cluster[]
  setSelectedCluster: (cluster: Cluster) => void
  getExplorerUrl: (path: string) => string
}

export function ClusterProvider({ children }: { children: ReactNode }) {
  return <NetworkProvider>{children}</NetworkProvider>
}

export function useCluster(): ClusterProviderContext {
  const network = useNetwork()
  return useMemo(
    () => ({
      selectedCluster: network.selectedCluster,
      clusters: network.clusters,
      setSelectedCluster: network.setSelectedCluster,
      getExplorerUrl: network.getExplorerUrl,
    }),
    [network],
  )
}
