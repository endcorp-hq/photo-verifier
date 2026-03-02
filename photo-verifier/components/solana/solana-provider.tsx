import { Connection, type ConnectionConfig } from '@solana/web3.js'
import React, { createContext, type ReactNode, useContext, useMemo } from 'react'
import { useCluster } from '../cluster/cluster-provider'

export interface SolanaProviderState {
  connection: Connection
}

export interface SolanaProviderProps {
  children: ReactNode
  config?: ConnectionConfig
}

const ConnectionContext = createContext<SolanaProviderState>({} as SolanaProviderState)
const DEFAULT_CONNECTION_CONFIG: ConnectionConfig = { commitment: 'confirmed' }

export function SolanaProvider({ children, config }: SolanaProviderProps) {
  const { selectedCluster } = useCluster()
  const connectionConfig = config ?? DEFAULT_CONNECTION_CONFIG
  const connection = useMemo(
    () => new Connection(selectedCluster.endpoint, connectionConfig),
    [selectedCluster.endpoint, connectionConfig],
  )

  return <ConnectionContext.Provider value={{ connection }}>{children}</ConnectionContext.Provider>
}

export function useSolana(): SolanaProviderState {
  return useContext(ConnectionContext)
}

export function useConnection(): Connection {
  return useSolana().connection
}
