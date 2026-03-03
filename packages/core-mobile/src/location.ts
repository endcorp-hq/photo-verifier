import * as Location from 'expo-location';
import type { GeoLocation } from '@photoverifier/core/types';

export type LocationErrorCode =
  | 'LOCATION_PERMISSION_DENIED'
  | 'LOCATION_SERVICES_DISABLED'
  | 'LOCATION_UNAVAILABLE';

export type LocationLookupResult =
  | { ok: true; value: GeoLocation }
  | {
      ok: false;
      error: {
        code: LocationErrorCode;
        message: string;
        cause?: string;
      };
    };

/**
 * Get current device location.
 */
export async function getCurrentLocation(): Promise<GeoLocation | null> {
  const result = await getCurrentLocationResult();
  return result.ok ? result.value : null;
}

/**
 * Get current device location with explicit error metadata.
 */
export async function getCurrentLocationResult(): Promise<LocationLookupResult> {
  try {
    const servicesEnabled = await Location.hasServicesEnabledAsync();
    if (!servicesEnabled) {
      return {
        ok: false,
        error: {
          code: 'LOCATION_SERVICES_DISABLED',
          message: 'Location services are disabled.',
        },
      };
    }

    const permission = await Location.getForegroundPermissionsAsync();
    if (permission.status !== 'granted') {
      const result = await Location.requestForegroundPermissionsAsync();
      if (result.status !== 'granted') {
        return {
          ok: false,
          error: {
            code: 'LOCATION_PERMISSION_DENIED',
            message: 'Foreground location permission was denied.',
          },
        };
      }
    }

    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });

    return {
      ok: true,
      value: {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy ?? undefined,
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'LOCATION_UNAVAILABLE',
        message: 'Failed to resolve current location.',
        cause: String((error as { message?: string })?.message ?? error ?? 'unknown error'),
      },
    };
  }
}

/**
 * Check if location services are enabled.
 */
export async function hasLocationServicesEnabled(): Promise<boolean> {
  return Location.hasServicesEnabledAsync();
}

/**
 * Request foreground location permission.
 */
export async function requestLocationPermission(): Promise<boolean> {
  const permission = await Location.getForegroundPermissionsAsync();
  if (permission.status === 'granted') {
    return true;
  }

  const result = await Location.requestForegroundPermissionsAsync();
  return result.status === 'granted';
}

/**
 * Convert GeoLocation to storage string format.
 */
export function locationToString(location: GeoLocation): string {
  return `${location.latitude},${location.longitude}`;
}

/**
 * Parse location string back to GeoLocation.
 */
export function parseLocationString(str: string): GeoLocation | null {
  const segments = str.split(',');
  if (segments.length !== 2) return null;

  const latitude = Number.parseFloat(segments[0].trim());
  const longitude = Number.parseFloat(segments[1].trim());
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;

  return { latitude, longitude };
}
