export type SimpleLocation = {
  latitude: number;
  longitude: number;
  accuracy?: number;
};

type PermissionResult = { status?: string };
type Coordinates = { latitude: number; longitude: number; accuracy?: number };
type LocationResult = { coords: Coordinates };
type ExpoLocationModule = {
  Accuracy: { Low?: number };
  hasServicesEnabledAsync?: () => Promise<boolean>;
  getForegroundPermissionsAsync?: () => Promise<PermissionResult>;
  requestForegroundPermissionsAsync?: () => Promise<PermissionResult>;
  getCurrentPositionAsync?: (options?: { accuracy?: number }) => Promise<LocationResult>;
  getLastKnownPositionAsync?: () => Promise<LocationResult | null>;
};

// Get a simple foreground location using Expo Location when available.
// Returns last known location as a fallback if current position cannot be retrieved.
export async function getCurrentLocation(): Promise<SimpleLocation | null> {
  try {
    const locationModule = require('expo-location') as ExpoLocationModule;

    // Ensure services enabled when API is available
    if (typeof locationModule.hasServicesEnabledAsync === 'function') {
      const servicesEnabled = await locationModule.hasServicesEnabledAsync();
      if (servicesEnabled === false) return null;
    }

    // Check/request foreground permission
    let status: string | undefined;
    if (typeof locationModule.getForegroundPermissionsAsync === 'function') {
      const existing = await locationModule.getForegroundPermissionsAsync();
      status = existing?.status;
    }
    if (status !== 'granted' && typeof locationModule.requestForegroundPermissionsAsync === 'function') {
      const requested = await locationModule.requestForegroundPermissionsAsync();
      status = requested?.status;
    }
    if (status !== 'granted') return null;

    // Try current position first
    if (typeof locationModule.getCurrentPositionAsync === 'function') {
      try {
        const pos = await locationModule.getCurrentPositionAsync({
          accuracy: locationModule.Accuracy?.Low,
        });
        return {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        };
      } catch {
        // Fallback to last known position below.
      }
    }

    // Fallback to last known position
    if (typeof locationModule.getLastKnownPositionAsync === 'function') {
      const last = await locationModule.getLastKnownPositionAsync();
      if (last?.coords) {
        return {
          latitude: last.coords.latitude,
          longitude: last.coords.longitude,
          accuracy: last.coords.accuracy,
        };
      }
    }
    return null;
  } catch {
    return null;
  }
}
