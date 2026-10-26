/**
 * Password protection for backup files: PBKDF2-SHA256 → AES-256-GCM, with
 * every parameter written into the file so it can be opened without this app
 * (OpenSSL, Python's `cryptography`, WebCrypto — see docs/BUILD_ANDROID.md
 * "Backups"). Pure JavaScript (@noble) so the same code runs on Hermes, the
 * browser and Node's tests; the GCM tag is the last 16 bytes of `ciphertext`.
 *
 * Envelope 2 (current) authenticates the header too: the GCM additional data is
 * `headerAad(file)` — so the iteration count, salt, IV and the "exported" date a
 * person sees before typing the password cannot be edited without the file
 * failing to open. Envelope 1 files (no AAD) still open.
 */
import { gcm } from '@noble/ciphers/aes.js';
import { bytesToUtf8, utf8ToBytes } from '@noble/ciphers/utils.js';
import { pbkdf2 } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { secureRandomBytes } from './secureRandom';
import { StorageError } from './store';

export interface EncryptedBackup {
  app: 'daily-tracker';
  encrypted: true;
  /** Envelope version, independent of the data version inside. 2 = header authenticated as GCM AAD. */
  envelope: 1 | 2;
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
/** A file asking for more than this is refused: ~30 s of hashing on a phone is a denial of service, not security. */
export const MAX_PBKDF2_ITERATIONS = 2_000_000;
export const MIN_PASSWORD_LENGTH = 6;
/** Largest ciphertext we will decrypt in memory (base64 characters, ≈ 48 MB of data). */
export const MAX_CIPHERTEXT_CHARS = 64 * 1024 * 1024;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const GCM_TAG_BYTES = 16;

export interface EncryptOptions {
  iterations?: number;
  salt?: Uint8Array;
  iv?: Uint8Array;
  now?: Date;
}

export function encryptBackup(plaintext: string, password: string, options: EncryptOptions = {}): EncryptedBackup {
  if (password.length < MIN_PASSWORD_LENGTH) throw new StorageError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
  const iterations = options.iterations ?? PBKDF2_ITERATIONS;
  const salt = options.salt ?? secureRandomBytes(16);
  const iv = options.iv ?? secureRandomBytes(12);
  const header: Omit<EncryptedBackup, 'ciphertext'> = {
    app: 'daily-tracker',
    encrypted: true,
    envelope: 2,
    kdf: 'PBKDF2-SHA256',
    iterations,
    salt: toBase64(salt),
    cipher: 'AES-256-GCM',
    iv: toBase64(iv),
    exportedAt: (options.now ?? new Date()).toISOString(),
  };
  const key = deriveKey(password, salt, iterations);
  const ciphertext = gcm(key, iv, utf8ToBytes(headerAad(header))).encrypt(utf8ToBytes(plaintext));
  return { ...header, ciphertext: toBase64(ciphertext) };
}

/**
 * The header string envelope 2 authenticates (GCM additional data, UTF-8): the fields in a fixed
 * order, '|'-separated, so another tool can rebuild it from the JSON. `exportedAt` travels as
 * written (an absent one is the empty string).
 */
export function headerAad(file: Omit<EncryptedBackup, 'ciphertext'>): string {
  return ['daily-tracker', String(file.envelope), file.kdf, String(file.iterations), file.salt, file.cipher, file.iv, file.exportedAt ?? ''].join('|');
}

/** Throws StorageError('Wrong password…') when the tag does not verify (wrong password, or a damaged / edited file). */
export function decryptBackup(file: EncryptedBackup, password: string): string {
  const { salt, iv, ciphertext } = checkEnvelope(file);
  const key = deriveKey(password, salt, file.iterations);
  const aad = file.envelope === 2 ? utf8ToBytes(headerAad(file)) : undefined;
  try {
    return bytesToUtf8(gcm(key, iv, aad).decrypt(ciphertext));
  } catch {
    throw new StorageError(file.envelope === 2 ? 'Wrong password, or the file is damaged or was edited.' : 'Wrong password, or the file is damaged.');
  }
}

/** True when the parsed JSON is a password-protected backup (shape-checked, not trusted beyond that). */
export function isEncryptedBackup(raw: unknown): raw is EncryptedBackup {
  if (!raw || typeof raw !== 'object') return false;
  const f = raw as Partial<EncryptedBackup>;
  return (
    f.app === 'daily-tracker' &&
    f.encrypted === true &&
    (f.envelope === 1 || f.envelope === 2) &&
    f.kdf === 'PBKDF2-SHA256' &&
    f.cipher === 'AES-256-GCM' &&
    typeof f.iterations === 'number' &&
    Number.isInteger(f.iterations) &&
    typeof f.salt === 'string' &&
    typeof f.iv === 'string' &&
    typeof f.ciphertext === 'string' &&
    (f.exportedAt === undefined || typeof f.exportedAt === 'string')
  );
}

/**
 * Bounds and decodes the envelope before any key derivation runs: the
 * iteration count, salt / IV lengths and ciphertext size all come from the
 * file, and a hostile file must not be able to hang the app or exhaust memory.
 * Throws StorageError with a user-readable message.
 */
export function checkEnvelope(file: EncryptedBackup): { salt: Uint8Array; iv: Uint8Array; ciphertext: Uint8Array } {
  if (!Number.isInteger(file.iterations) || file.iterations < 1000 || file.iterations > MAX_PBKDF2_ITERATIONS) {
    throw new StorageError('The file is damaged (unusual password settings).');
  }
  if (file.ciphertext.length > MAX_CIPHERTEXT_CHARS) throw new StorageError('The file is too large to open on this phone.');
  const salt = fromBase64(file.salt);
  const iv = fromBase64(file.iv);
  const ciphertext = fromBase64(file.ciphertext);
  if (salt.length !== SALT_BYTES || iv.length !== IV_BYTES || ciphertext.length < GCM_TAG_BYTES) throw new StorageError('The file is damaged (bad header).');
  return { salt, iv, ciphertext };
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
