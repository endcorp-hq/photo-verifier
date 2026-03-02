import { SplashScreen } from 'expo-router'
import { useAuth } from '@/components/auth/auth-provider'
import { useEffect, useRef } from 'react'

export function AppSplashController() {
  const { isLoading } = useAuth()
  const hiddenRef = useRef(false)

  useEffect(() => {
    if (isLoading || hiddenRef.current) return
    hiddenRef.current = true
    void SplashScreen.hideAsync()
  }, [isLoading])

  return null
}
