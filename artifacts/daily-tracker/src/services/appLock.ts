/**
 * App lock — web stub. The lock needs the phone's screen lock (biometrics or
 * PIN/pattern via expo-local-authentication); the browser preview has none,
 * so the setting is shown as unavailable and nothing ever locks.
 * Android/iOS live in appLock.native.ts; never import this file from there.
 */

export interface LockCapability {
  available: boolean;
  /** Why the lock cannot be turned on, for the Settings hint. */
  reason?: string;
  /** A fingerprint / face is enrolled (otherwise the screen-lock PIN/pattern is used). */
  biometric: boolean;
}

export async function lockCapability(): Promise<LockCapability> {
  return { available: false, reason: 'App lock uses the phone’s screen lock; it is not available in the browser preview.', biometric: false };
}

/** Resolves true when the user proved it is them. */
export async function authenticate(): Promise<boolean> {
  return true;
}
