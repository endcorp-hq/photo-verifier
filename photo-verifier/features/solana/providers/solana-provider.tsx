import { Connection, type ConnectionConfig } from '@solana/web3.js'
import React, { createContext, type ReactNode, useContext, useMemo } from 'react'
import { useNetwork } from '@/providers/network/network-provider'

interface SolanaProviderState {
  connection: Connection
}

interface SolanaProviderProps {
  children: ReactNode
  config?: ConnectionConfig
}

const ConnectionContext = createContext<SolanaProviderState | undefined>(undefined)
const DEFAULT_CONNECTION_CONFIG: ConnectionConfig = { commitment: 'confirmed' }

export function SolanaProvider({ children, config }: SolanaProviderProps) {
  const { endpoint } = useNetwork()
  const connectionConfig = config ?? DEFAULT_CONNECTION_CONFIG
  const connection = useMemo(
    () => new Connection(endpoint, connectionConfig),
    [connectionConfig, endpoint],
  )

  return <ConnectionContext.Provider value={{ connection }}>{children}</ConnectionContext.Provider>
}

function useSolana(): SolanaProviderState {
  const context = useContext(ConnectionContext)
  if (!context) {
    throw new Error('useConnection must be used within a SolanaProvider')
  }
  return context
}

export function useConnection(): Connection {
  return useSolana().connection
}
