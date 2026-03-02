import { PortalHost } from '@rn-primitives/portal'
import { useFonts } from 'expo-font'
import {
  DarkerGrotesque_400Regular,
  DarkerGrotesque_500Medium,
  DarkerGrotesque_700Bold,
} from '@expo-google-fonts/darker-grotesque'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import 'react-native-reanimated'
import { AppProviders } from '@/components/app-providers'
import { useCallback, useEffect } from 'react'
import * as SplashScreen from 'expo-splash-screen'
import { Text, TextInput, View } from 'react-native'
import { AppSplashController } from '@/components/app-splash-controller'
import { useAuth } from '@/components/auth/auth-provider'

const APP_FONT_FAMILY = 'DarkerGrotesque_500Medium'
let globalFontApplied = false

function withDefaultFontStyle(style: unknown): unknown {
  if (!style) return { fontFamily: APP_FONT_FAMILY }
  if (Array.isArray(style)) return [{ fontFamily: APP_FONT_FAMILY }, ...style]
  return [{ fontFamily: APP_FONT_FAMILY }, style]
}

function applyGlobalFontDefaults(): void {
  if (globalFontApplied) return
  globalFontApplied = true

  const TextAny = Text as unknown as { defaultProps?: { style?: unknown } }
  const TextInputAny = TextInput as unknown as { defaultProps?: { style?: unknown } }

  TextAny.defaultProps = {
    ...(TextAny.defaultProps ?? {}),
    style: withDefaultFontStyle(TextAny.defaultProps?.style),
  }
  TextInputAny.defaultProps = {
    ...(TextInputAny.defaultProps ?? {}),
    style: withDefaultFontStyle(TextInputAny.defaultProps?.style),
  }
}

SplashScreen.preventAutoHideAsync()

export default function RootLayout() {
  const [loaded] = useFonts({
    DarkerGrotesque_400Regular,
    DarkerGrotesque_500Medium,
    DarkerGrotesque_700Bold,
  })

  useEffect(() => {
    if (loaded) applyGlobalFontDefaults()
  }, [loaded])

  const onLayoutRootView = useCallback(async () => {
    if (loaded) {
      await SplashScreen.hideAsync()
    }
  }, [loaded])

  if (!loaded) {
    // Async font loading only occurs in development.
    return null
  }

  return (
    <View style={{ flex: 1 }} onLayout={onLayoutRootView}>
      <AppProviders>
        <AppSplashController />
        <RootNavigator />
        <StatusBar style="auto" />
      </AppProviders>
      <PortalHost />
    </View>
  )
}

function RootNavigator() {
  const { isAuthenticated, isSeekerVerified } = useAuth()
  const isAllowed = isAuthenticated && isSeekerVerified

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={isAllowed}>
        <Stack.Screen name="(tabs)" />
      </Stack.Protected>
      <Stack.Protected guard={!isAllowed}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
      <Stack.Screen name="+not-found" />
    </Stack>
  )
}
