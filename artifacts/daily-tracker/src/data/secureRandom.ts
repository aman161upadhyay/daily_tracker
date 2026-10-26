/**
 * Cryptographically secure random bytes — web and tests. Browsers and Node
 * expose WebCrypto on `globalThis`; Hermes does not, so Android/iOS use the
 * `.native.ts` twin (expo-crypto). Never fall back to `Math.random`: a
 * predictable salt or IV would silently weaken every encrypted backup.
 */
export function secureRandomBytes(length: number): Uint8Array {
  const cr = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (!cr || typeof cr.getRandomValues !== 'function') throw new Error('No secure random source is available on this platform.');
  return cr.getRandomValues(new Uint8Array(length));
}
