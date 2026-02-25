import * as Location from 'expo-location';
import type { GeoLocation } from './types';

/**
 * Get current device location
 * Core location functionality - free and open source
 */
export async function getCurrentLocation(): Promise<GeoLocation | null> {
  try {
    const permission = await Location.getForegroundPermissionsAsync();
    if (permission.status !== 'granted') {
      const result = await Location.requestForegroundPermissionsAsync();
      if (result.status !== 'granted') {
        return null;
      }
    }

    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });

    return {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      accuracy: location.coords.accuracy ?? undefined,
    };
  } catch (error) {
    console.warn('Failed to get location:', error);
    return null;
  }
}

/**
 * Check if location services are enabled
 */
export async function hasLocationServicesEnabled(): Promise<boolean> {
  return Location.hasServicesEnabledAsync();
}

/**
 * Request foreground location permission
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
 * Convert GeoLocation to storage string format
 */
export function locationToString(location: GeoLocation): string {
  return `${location.latitude},${location.longitude}`;
}

/**
 * Parse location string back to GeoLocation
 */
export function parseLocationString(str: string): GeoLocation | null {
  const parts = str.split(',');
  if (parts.length !== 2) return null;
  
  const lat = parseFloat(parts[0]);
  const lng = parseFloat(parts[1]);
  
  if (isNaN(lat) || isNaN(lng)) return null;
  
  return { latitude: lat, longitude: lng };
}
