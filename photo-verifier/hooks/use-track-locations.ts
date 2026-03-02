import { UnknownOutputParams, useGlobalSearchParams, usePathname } from 'expo-router'
import { useEffect } from 'react'

// Hook to track the location for analytics
export function useTrackLocations(
  onChange: (pathname: string, params: UnknownOutputParams) => void,
  enabled = true,
) {
  const pathname = usePathname()
  const params = useGlobalSearchParams()

  useEffect(() => {
    if (!enabled) return
    onChange(pathname, params)
  }, [enabled, onChange, pathname, params])
}
