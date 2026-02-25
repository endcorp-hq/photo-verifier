/**
 * Theming System for Citizen Science SDK
 * 
 * Allows white-label customization for partners integrating the SDK
 */

import type { ReactNode } from 'react';

export interface ThemeColors {
  // Primary
  primary: string;
  primaryDark: string;
  primaryLight: string;
  
  // Secondary
  secondary: string;
  secondaryDark: string;
  secondaryLight: string;
  
  // Background
  background: string;
  backgroundSecondary: string;
  surface: string;
  
  // Text
  text: string;
  textSecondary: string;
  textInverse: string;
  
  // Status
  success: string;
  error: string;
  warning: string;
  info: string;
  
  // UI Elements
  border: string;
  divider: string;
  disabled: string;
  
  // Camera specific
  shutterButton: string;
  shutterButtonBorder: string;
}

export interface ThemeTypography {
  fontFamily: {
    regular: string;
    medium: string;
    bold: string;
    mono: string;
  };
  fontSize: {
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
    xxl: number;
  };
  lineHeight: {
    tight: number;
    normal: number;
    relaxed: number;
  };
}

export interface ThemeSpacing {
  xs: number;
  sm: number;
  md: number;
  lg: number;
  xl: number;
  xxl: number;
}

export interface ThemeBorderRadius {
  sm: number;
  md: number;
  lg: number;
  full: number;
}

export interface ThemeIcons {
  camera: string;
  flip: string;
  flash: string;
  gallery: string;
  settings: string;
  close: string;
  check: string;
  error: string;
  warning: string;
  info: string;
  location: string;
  clock: string;
}

export interface ThemeStrings {
  // Camera screen
  cameraPermissionTitle: string;
  cameraPermissionMessage: string;
  cameraPermissionButton: string;
  
  // Capture
  capturePhoto: string;
  retakePhoto: string;
  usePhoto: string;
  discardPhoto: string;
  
  // Upload
  uploading: string;
  uploadSuccess: string;
  uploadError: string;
  
  // Location
  locationPermissionTitle: string;
  locationPermissionMessage: string;
  locationLoading: string;
  locationUnavailable: string;
  
  // Verification
  verificationInProgress: string;
  verificationSuccess: string;
  verificationFailed: string;
  
  // Blockchain
  submittingToChain: string;
  chainSuccess: string;
  chainError: string;
  requiresLicense: string;
  
  // Errors
  errorGeneric: string;
  errorNetwork: string;
  errorStorage: string;
  errorCamera: string;
  
  // General
  cancel: string;
  confirm: string;
  retry: string;
  settings: string;
}

export interface Theme {
  id: string;
  name: string;
  colors: ThemeColors;
  typography: ThemeTypography;
  spacing: ThemeSpacing;
  borderRadius: ThemeBorderRadius;
  icons: ThemeIcons;
  strings: ThemeStrings;
  
  // Feature flags
  features: {
    showHashPreview: boolean;
    showLocation: boolean;
    showTimestamp: boolean;
    autoUpload: boolean;
    requireSeeker: boolean;
    enableAnalytics: boolean;
  };
}

/**
 * Default theme (Citizen Science branding)
 */
export const defaultTheme: Theme = {
  id: 'default',
  name: 'Citizen Science',
  
  colors: {
    primary: '#4CAF50',
    primaryDark: '#388E3C',
    primaryLight: '#81C784',
    secondary: '#2196F3',
    secondaryDark: '#1976D2',
    secondaryLight: '#64B5F6',
    background: '#000000',
    backgroundSecondary: '#121212',
    surface: '#1E1E1E',
    text: '#FFFFFF',
    textSecondary: '#B0B0B0',
    textInverse: '#000000',
    success: '#4CAF50',
    error: '#F44336',
    warning: '#FF9800',
    info: '#2196F3',
    border: '#333333',
    divider: '#333333',
    disabled: '#666666',
    shutterButton: '#FFFFFF',
    shutterButtonBorder: '#FFFFFF',
  },
  
  typography: {
    fontFamily: {
      regular: 'System',
      medium: 'System',
      bold: 'System',
      mono: 'monospace',
    },
    fontSize: {
      xs: 10,
      sm: 12,
      md: 14,
      lg: 16,
      xl: 20,
      xxl: 24,
    },
    lineHeight: {
      tight: 1.2,
      normal: 1.5,
      relaxed: 1.75,
    },
  },
  
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
  },
  
  borderRadius: {
    sm: 4,
    md: 8,
    lg: 16,
    full: 9999,
  },
  
  icons: {
    camera: '📷',
    flip: '🔄',
    flash: '⚡',
    gallery: '🖼️',
    settings: '⚙️',
    close: '✕',
    check: '✓',
    error: '!',
    warning: '⚠',
    info: 'ℹ',
    location: '📍',
    clock: '🕐',
  },
  
  strings: {
    cameraPermissionTitle: 'Camera Access Required',
    cameraPermissionMessage: 'We need access to your camera to capture photos.',
    cameraPermissionButton: 'Grant Permission',
    capturePhoto: 'Take Photo',
    retakePhoto: 'Retake',
    usePhoto: 'Use Photo',
    discardPhoto: 'Discard',
    uploading: 'Uploading...',
    uploadSuccess: 'Photo uploaded successfully',
    uploadError: 'Upload failed',
    locationPermissionTitle: 'Location Access',
    locationPermissionMessage: 'Enable location to verify photo location.',
    locationLoading: 'Getting location...',
    locationUnavailable: 'Location unavailable',
    verificationInProgress: 'Verifying...',
    verificationSuccess: 'Verified',
    verificationFailed: 'Verification failed',
    submittingToChain: 'Storing on blockchain...',
    chainSuccess: 'Stored on blockchain',
    chainError: 'Blockchain error',
    requiresLicense: 'License required for blockchain features',
    errorGeneric: 'Something went wrong',
    errorNetwork: 'Network error',
    errorStorage: 'Storage error',
    errorCamera: 'Camera error',
    cancel: 'Cancel',
    confirm: 'Confirm',
    retry: 'Retry',
    settings: 'Settings',
  },
  
  features: {
    showHashPreview: true,
    showLocation: true,
    showTimestamp: true,
    autoUpload: false,
    requireSeeker: true,
    enableAnalytics: true,
  },
};

/**
 * Dark theme (default for camera apps)
 */
export const darkTheme: Theme = {
  ...defaultTheme,
  id: 'dark',
  name: 'Dark',
  colors: {
    ...defaultTheme.colors,
    background: '#000000',
    backgroundSecondary: '#0A0A0A',
    surface: '#1A1A1A',
  },
};

/**
 * Light theme
 */
export const lightTheme: Theme = {
  ...defaultTheme,
  id: 'light',
  name: 'Light',
  colors: {
    ...defaultTheme.colors,
    background: '#FFFFFF',
    backgroundSecondary: '#F5F5F5',
    surface: '#FFFFFF',
    text: '#000000',
    textSecondary: '#666666',
    textInverse: '#FFFFFF',
    border: '#E0E0E0',
    divider: '#E0E0E0',
  },
};

/**
 * Create a custom theme by extending the default
 */
export function createCustomTheme(overrides: Partial<Theme>): Theme {
  return {
    ...defaultTheme,
    ...overrides,
    colors: {
      ...defaultTheme.colors,
      ...overrides.colors,
    },
    typography: {
      ...defaultTheme.typography,
      ...overrides.typography,
    },
    spacing: {
      ...defaultTheme.spacing,
      ...overrides.spacing,
    },
    borderRadius: {
      ...defaultTheme.borderRadius,
      ...overrides.borderRadius,
    },
    icons: {
      ...defaultTheme.icons,
      ...overrides.icons,
    },
    strings: {
      ...defaultTheme.strings,
      ...overrides.strings,
    },
    features: {
      ...defaultTheme.features,
      ...overrides.features,
    },
  };
}

/**
 * Pre-built themes
 */
export const themes: Record<string, Theme> = {
  default: defaultTheme,
  dark: darkTheme,
  light: lightTheme,
};
