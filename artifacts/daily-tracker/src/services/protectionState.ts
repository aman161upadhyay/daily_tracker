/**
 * Whether the screenshot / recents protection the app lock promises is actually in force. The
 * OS call can fail (a window not ready, a vendor quirk); the lock must not describe protection it
 * never got, so the gate records each attempt here and Settings → App lock shows a failure with
 * a Retry. `null` = never attempted (the lock is off).
 */
import { useSyncExternalStore } from 'react';

export interface ProtectionStatus {
  /** What was asked for. */
  enabled: boolean;
  ok: boolean;
  reason?: string;
}

let status: ProtectionStatus | null = null;
const listeners = new Set<() => void>();

export function setProtectionStatus(next: ProtectionStatus | null): void {
  status = next;
  for (const l of listeners) l();
}

export function protectionStatus(): ProtectionStatus | null {
  return status;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useProtectionStatus(): ProtectionStatus | null {
  return useSyncExternalStore(subscribe, protectionStatus, protectionStatus);
}
