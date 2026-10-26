/**
 * Whether the app-lock gate is up, for anything that could appear above it. The gate is a
 * native Modal; a Sheet opened by a deep link while the gate is up is another Modal, presented
 * later, and Android stacks it on top — showing what the lock is meant to hide. Sheets read
 * this and wait for the unlock (see components/ui/Sheet).
 */
import { useSyncExternalStore } from 'react';

let locked = false;
const listeners = new Set<() => void>();

export function setAppLocked(next: boolean): void {
  if (locked === next) return;
  locked = next;
  for (const l of listeners) l();
}

export function isAppLocked(): boolean {
  return locked;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useAppLocked(): boolean {
  return useSyncExternalStore(subscribe, isAppLocked, isAppLocked);
}
