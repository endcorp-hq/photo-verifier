import { Platform } from 'react-native';

// Lightweight client-side device check using Platform constants. Spoofable; for UX only.
export function isSeekerDevice(): boolean {
  try {
    const platform = Platform as unknown as { constants?: { Model?: string } };
    return platform.constants?.Model === 'Seeker';
  } catch {
    return false;
  }
}
