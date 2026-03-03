import { createContext, type ReactNode, useContext, useMemo, useState } from 'react'
import { AppConfig } from '@/constants/app-config'
import { Cluster } from '@/components/cluster/cluster'
import { buildExplorerUrl, resolveInitialCluster, sortClustersByName } from './network-utils'

type NetworkProviderState = {
  selectedCluster: Cluster
  clusters: Cluster[]
  setSelectedCluster: (cluster: Cluster) => void
  endpoint: string
  getExplorerUrl: (path: string) => string
}

const NetworkContext = createContext<NetworkProviderState | undefined>(undefined)

export function NetworkProvider({ children }: { children: ReactNode }) {
  const [selectedCluster, setSelectedCluster] = useState<Cluster>(() =>
    resolveInitialCluster(AppConfig.clusters),
  )

  const value = useMemo<NetworkProviderState>(
    () => ({
      selectedCluster,
      clusters: sortClustersByName(AppConfig.clusters),
      setSelectedCluster,
      endpoint: selectedCluster.endpoint,
      getExplorerUrl: (path: string) => buildExplorerUrl(path, selectedCluster),
    }),
    [selectedCluster],
  )

  return <NetworkContext.Provider value={value}>{children}</NetworkContext.Provider>
}

export function useNetwork(): NetworkProviderState {
  const context = useContext(NetworkContext)
  if (!context) {
    throw new Error('useNetwork must be used within a NetworkProvider')
  }
  return context
}
