import type { ComponentProps } from 'react'
import { DarkTheme as AppThemeDark, DefaultTheme as AppThemeLight, ThemeProvider } from '@react-navigation/native'
import { useColorScheme } from 'react-native'

function useAppTheme() {
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'
  const theme = isDark ? AppThemeDark : AppThemeLight
  return {
    colorScheme,
    isDark,
    theme,
  }
}

type AppThemeProps = {
  children?: ComponentProps<typeof ThemeProvider>['children']
}

export function AppTheme({ children }: AppThemeProps) {
  const { theme } = useAppTheme()

  return <ThemeProvider value={theme}>{children}</ThemeProvider>
}
