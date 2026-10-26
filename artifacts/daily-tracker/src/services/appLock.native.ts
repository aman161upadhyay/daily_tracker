/**
 * App lock — Android / iOS: the phone's own screen lock through
 * expo-local-authentication. Biometrics when enrolled, otherwise the device
 * PIN / pattern (device fallback stays enabled, so a wet finger never locks
 * anyone out). Works in Expo Go. Never import './appLock' from here.
 */
import * as LocalAuthentication from 'expo-local-authentication';
import type { LockCapability } from './appLock';

export type { LockCapability } from './appLock';

export async function lockCapability(): Promise<LockCapability> {
  try {
    const level = await LocalAuthentication.getEnrolledLevelAsync();
    if (level === LocalAuthentication.SecurityLevel.NONE) {
      return { available: false, reason: 'Set up a screen lock (PIN, pattern, fingerprint or face) in the phone’s settings first.', biometric: false };
    }
    return { available: true, biometric: level === LocalAuthentication.SecurityLevel.BIOMETRIC };
  } catch (err) {
    return { available: false, reason: err instanceof Error ? err.message : 'Screen lock status could not be read.', biometric: false };
  }
}

export async function authenticate(): Promise<boolean> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock Daily Tracker',
      cancelLabel: 'Cancel',
      fallbackLabel: 'Use screen lock',
      disableDeviceFallback: false,
    });
    return result.success;
  } catch {
    return false;
  }
}
