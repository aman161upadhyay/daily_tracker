/**
 * App lock — web stub. The lock needs the phone's screen lock (biometrics or
 * PIN/pattern via expo-local-authentication); the browser preview has none,
 * so the setting is shown as unavailable and nothing ever locks.
 * Android/iOS live in appLock.native.ts; never import this file from there.
 */

export interface LockCapability {
  available: boolean;
  /**
   * 'ready': the phone can authenticate. 'none': no screen lock is set up, so
   * there is nothing to authenticate against (the gate steps aside). 'error':
   * the status could not be read — treat as locked and let the user retry.
   */
  status: 'ready' | 'none' | 'error';
  /** Why the lock cannot be turned on, for the Settings hint. */
  reason?: string;
  /** A fingerprint / face is enrolled (otherwise the screen-lock PIN/pattern is used). */
  biometric: boolean;
}

export async function lockCapability(): Promise<LockCapability> {
  return { available: false, status: 'none', reason: 'App lock uses the phone’s screen lock; it is not available in the browser preview.', biometric: false };
}

/** Resolves true when the user proved it is them. */
export async function authenticate(): Promise<boolean> {
  return true;
}

/** The outcome of asking the OS for (or releasing) screenshot / recents protection. */
export interface ProtectionResult {
  ok: boolean;
  /** Why the OS refused, for Settings. */
  reason?: string;
}

/** Hide the app's content from screenshots and the recent-apps switcher while the lock is on. */
export async function setScreenProtection(_enabled: boolean): Promise<ProtectionResult> {
  return { ok: true };
}
