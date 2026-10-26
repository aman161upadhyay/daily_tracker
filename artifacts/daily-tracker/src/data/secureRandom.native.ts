import { getRandomValues } from 'expo-crypto';

/** Hermes has no `globalThis.crypto`; expo-crypto reads from the OS CSPRNG. */
export function secureRandomBytes(length: number): Uint8Array {
  return getRandomValues(new Uint8Array(length));
}
