/**
 * Theme Provider for React Native
 * 
 * Provides theme context to all child components
 */

import type { ReactNode } from 'react';
import React, { createContext, useContext } from 'react';
import type { Theme } from './theme';
import { defaultTheme } from './theme';

const ThemeContext = createContext<Theme>(defaultTheme);

interface ThemeProviderProps {
  theme: Theme;
  children: ReactNode;
}

/**
 * Provider component that wraps your app and supplies the theme
 * 
 * @example
 * ```tsx
 * import { ThemeProvider, lightTheme } from '@photoverifier/core';
 * 
 * function App() {
 *   return (
 *     <ThemeProvider theme={lightTheme}>
 *       <YourApp />
 *     </ThemeProvider>
 *   );
 * }
 * ```
 */
export function ThemeProvider({ theme, children }: ThemeProviderProps) {
  return (
    <ThemeContext.Provider value={theme}>
      {children}
    </ThemeContext.Provider>
  );
}

/**
 * Hook to access the current theme
 * 
 * @example
 * ```tsx
 * import { useTheme } from '@photoverifier/core';
 * 
 * function MyComponent() {
 *   const theme = useTheme();
 *   return <Text style={{ color: theme.colors.primary }}>Hello</Text>;
 * }
 * ```
 */
export function useTheme(): Theme {
  return useContext(ThemeContext);
}

/**
 * Hook to access specific theme values
 * 
 * @example
 * ```tsx
 * const { colors, spacing, strings } = useThemeValues();
 * ```
 */
export function useThemeValues() {
  const theme = useTheme();
  return theme;
}

// Re-export theme utilities
export {
  type Theme,
  type ThemeColors,
  type ThemeTypography,
  type ThemeSpacing,
  type ThemeBorderRadius,
  type ThemeIcons,
  type ThemeStrings,
  defaultTheme,
  darkTheme,
  lightTheme,
  createCustomTheme,
  themes,
} from './theme';
