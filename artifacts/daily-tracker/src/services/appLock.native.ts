/**
 * App lock — Android / iOS: the phone's own screen lock through
 * expo-local-authentication. Biometrics when enrolled, otherwise the device
 * PIN / pattern (device fallback stays enabled, so a wet finger never locks
 * anyone out). Works in Expo Go. Never import './appLock' from here.
 */
import * as LocalAuthentication from 'expo-local-authentication';
import * as ScreenCapture from 'expo-screen-capture';
import type { LockCapability, ProtectionResult } from './appLock';

export type { LockCapability, ProtectionResult } from './appLock';

const PROTECTION_KEY = 'app-lock';

export async function lockCapability(): Promise<LockCapability> {
  try {
    const level = await LocalAuthentication.getEnrolledLevelAsync();
    if (level === LocalAuthentication.SecurityLevel.NONE) {
      return { available: false, status: 'none', reason: 'Set up a screen lock (PIN, pattern, fingerprint or face) in the phone’s settings first.', biometric: false };
    }
    return { available: true, status: 'ready', biometric: level === LocalAuthentication.SecurityLevel.BIOMETRIC };
  } catch (err) {
    return { available: false, status: 'error', reason: err instanceof Error ? err.message : 'Screen lock status could not be read.', biometric: false };
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

/**
 * FLAG_SECURE while the lock is on: no screenshots, no screen recording, and a
 * blank card in the recent-apps switcher — the lock screen would otherwise
 * cover the app only after the thumbnail was already taken.
 */
export async function setScreenProtection(enabled: boolean): Promise<ProtectionResult> {
  try {
    if (enabled) {
      // The library remembers the key and skips the native call the second time, but FLAG_SECURE
      // lives on the activity's window: when Android recreates the activity and keeps this runtime
      // (a locale change, "Don't keep activities", memory pressure), the new window has no flag
      // while the remembered key says it does. Releasing the key first makes every call reach the
      // window — the gate calls this on each foreground, and Settings' Retry too.
      await ScreenCapture.allowScreenCaptureAsync(PROTECTION_KEY);
      await ScreenCapture.preventScreenCaptureAsync(PROTECTION_KEY);
    } else {
      await ScreenCapture.allowScreenCaptureAsync(PROTECTION_KEY);
    }
    return { ok: true };
  } catch (err) {
    // Reported, not swallowed: the lock's privacy promise is only as good as this call (Settings shows it with a Retry).
    console.warn('Screen protection could not be changed', err);
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}
