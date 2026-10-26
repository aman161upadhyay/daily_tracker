/**
 * Password protection for backup files: PBKDF2-SHA256 → AES-256-GCM, with
 * every parameter written into the file so it can be opened without this app
 * (OpenSSL, Python's `cryptography`, WebCrypto — see docs/BUILD_ANDROID.md
 * "Backups"). Pure JavaScript (@noble) so the same code runs on Hermes, the
 * browser and Node's tests; the GCM tag is the last 16 bytes of `ciphertext`.
 */
import { gcm } from '@noble/ciphers/aes.js';
import { bytesToUtf8, utf8ToBytes } from '@noble/ciphers/utils.js';
import { pbkdf2 } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { randomBytes } from '@noble/hashes/utils.js';
import { StorageError } from './store';

export interface EncryptedBackup {
  app: 'daily-tracker';
  encrypted: true;
  /** Envelope version, independent of the data version inside. */
  envelope: 1;
  kdf: 'PBKDF2-SHA256';
  iterations: number;
  /** Base64, 16 bytes. */
  salt: string;
  cipher: 'AES-256-GCM';
  /** Base64, 12 bytes. */
  iv: string;
  /** Base64; the 16-byte GCM tag follows the data. */
  ciphertext: string;
  exportedAt: string;
}

/** OWASP suggests 600k for SHA-256; 200k keeps a mid-range phone under ~3 s in pure JS. */
export const PBKDF2_ITERATIONS = 200_000;
export const MIN_PASSWORD_LENGTH = 6;

export interface EncryptOptions {
  iterations?: number;
  salt?: Uint8Array;
  iv?: Uint8Array;
  now?: Date;
}

export function encryptBackup(plaintext: string, password: string, options: EncryptOptions = {}): EncryptedBackup {
  if (password.length < MIN_PASSWORD_LENGTH) throw new StorageError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
  const iterations = options.iterations ?? PBKDF2_ITERATIONS;
  const salt = options.salt ?? randomBytes(16);
  const iv = options.iv ?? randomBytes(12);
  const key = deriveKey(password, salt, iterations);
  const ciphertext = gcm(key, iv).encrypt(utf8ToBytes(plaintext));
  return {
    app: 'daily-tracker',
    encrypted: true,
    envelope: 1,
    kdf: 'PBKDF2-SHA256',
    iterations,
    salt: toBase64(salt),
    cipher: 'AES-256-GCM',
    iv: toBase64(iv),
    ciphertext: toBase64(ciphertext),
    exportedAt: (options.now ?? new Date()).toISOString(),
  };
}

/** Throws StorageError('Wrong password…') when the tag does not verify (wrong password or a damaged file). */
export function decryptBackup(file: EncryptedBackup, password: string): string {
  const key = deriveKey(password, fromBase64(file.salt), file.iterations);
  try {
    return bytesToUtf8(gcm(key, fromBase64(file.iv)).decrypt(fromBase64(file.ciphertext)));
  } catch {
    throw new StorageError('Wrong password, or the file is damaged.');
  }
}

/** True when the parsed JSON is a password-protected backup (shape-checked, not trusted beyond that). */
export function isEncryptedBackup(raw: unknown): raw is EncryptedBackup {
  if (!raw || typeof raw !== 'object') return false;
  const f = raw as Partial<EncryptedBackup>;
  return (
    f.app === 'daily-tracker' &&
    f.encrypted === true &&
    f.envelope === 1 &&
    f.kdf === 'PBKDF2-SHA256' &&
    f.cipher === 'AES-256-GCM' &&
    typeof f.iterations === 'number' &&
    f.iterations >= 1000 &&
    typeof f.salt === 'string' &&
    typeof f.iv === 'string' &&
    typeof f.ciphertext === 'string'
  );
}

function deriveKey(password: string, salt: Uint8Array, iterations: number): Uint8Array {
  return pbkdf2(sha256, utf8ToBytes(password.normalize('NFKC')), salt, { c: iterations, dkLen: 32 });
}

// Base64 without Buffer: Hermes, browsers and Node all have btoa/atob; chunked so large files do not blow the call stack.
export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 0x2000; // well under Hermes' argument limit for spread calls
  for (let i = 0; i < bytes.length; i += CHUNK) binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(binary);
}

export function fromBase64(text: string): Uint8Array {
  let binary: string;
  try {
    binary = atob(text);
  } catch {
    throw new StorageError('The file is damaged (bad base64).');
  }
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
