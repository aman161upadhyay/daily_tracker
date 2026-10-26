/// <reference types="node" />
import assert from 'node:assert/strict';
import { createCipheriv, createDecipheriv, pbkdf2Sync } from 'node:crypto';
import { describe, it } from 'node:test';
import { decryptBackup, encryptBackup, fromBase64, headerAad, isEncryptedBackup, PBKDF2_ITERATIONS, toBase64, type EncryptedBackup } from '../src/data/backupCrypto';
import { StorageError } from '../src/data/store';
import { inspectExport, parseExport, serializeExport, unlockExport } from '../src/data/transfer';
import { buildSampleState } from '../src/state/seed';

const NOW = new Date('2026-10-26T09:00:00Z');
const FAST = { iterations: 2_000 }; // the production count is 200k; tests only need the format exercised

describe('password-protected backups', () => {
  it('round-trips through the envelope and refuses the wrong password', () => {
    const file = encryptBackup('{"hello":"world"}', 'correct horse', FAST);
    assert.equal(file.app, 'daily-tracker');
    assert.equal(file.encrypted, true);
    assert.equal(file.kdf, 'PBKDF2-SHA256');
    assert.equal(file.cipher, 'AES-256-GCM');
    assert.equal(fromBase64(file.salt).length, 16);
    assert.equal(fromBase64(file.iv).length, 12);
    assert.equal(decryptBackup(file, 'correct horse'), '{"hello":"world"}');
    assert.throws(() => decryptBackup(file, 'correct horsf'), (err: unknown) => err instanceof StorageError && /Wrong password/.test(err.message));
  });

  it('uses the documented production parameters by default', () => {
    const file = encryptBackup('x', 'secret-1', { salt: new Uint8Array(16), iv: new Uint8Array(12), iterations: 1_000 });
    assert.equal(file.envelope, 2);
    assert.equal(PBKDF2_ITERATIONS, 200_000);
    assert.equal(file.iterations, 1_000);
  });

  it('refuses short passwords', () => {
    assert.throws(() => encryptBackup('x', 'abc', FAST), StorageError);
  });

  it('detects tampering (GCM tag)', () => {
    const file = encryptBackup('payload', 'correct horse', FAST);
    const bytes = fromBase64(file.ciphertext);
    bytes[0] ^= 0x01;
    assert.throws(() => decryptBackup({ ...file, ciphertext: toBase64(bytes) }, 'correct horse'), StorageError);
  });

  it('can be opened with standard tools (Node crypto cross-check, header as AAD)', () => {
    const file = encryptBackup('open me elsewhere', 'pässword ok', FAST);
    const key = pbkdf2Sync(Buffer.from('pässword ok'.normalize('NFKC'), 'utf8'), Buffer.from(file.salt, 'base64'), file.iterations, 32, 'sha256');
    const data = Buffer.from(file.ciphertext, 'base64');
    const body = data.subarray(0, data.length - 16);
    const tag = data.subarray(data.length - 16);
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(file.iv, 'base64'));
    // The documented recipe: the AAD is the '|'-joined header, rebuilt from the JSON fields.
    decipher.setAAD(Buffer.from(['daily-tracker', file.envelope, file.kdf, file.iterations, file.salt, file.cipher, file.iv, file.exportedAt].join('|'), 'utf8'));
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
    assert.equal(plain, 'open me elsewhere');
  });

  it('envelope 2 refuses an edited header (the date shown before unlocking included)', () => {
    const file = encryptBackup('payload', 'correct horse', { ...FAST, now: new Date('2026-10-26T09:00:00Z') });
    assert.equal(file.envelope, 2);
    assert.equal(headerAad(file).split('|').length, 8);
    assert.throws(() => decryptBackup({ ...file, exportedAt: '2020-01-01T00:00:00.000Z' }, 'correct horse'), (err: unknown) => err instanceof StorageError && /edited/.test(err.message));
    assert.throws(() => decryptBackup({ ...file, iterations: 1_500 }, 'correct horse'), StorageError);
    assert.equal(decryptBackup(file, 'correct horse'), 'payload');
  });

  it('still opens envelope 1 files (no AAD) written by earlier versions', () => {
    const salt = Buffer.alloc(16, 7);
    const iv = Buffer.alloc(12, 9);
    const key = pbkdf2Sync(Buffer.from('correct horse', 'utf8'), salt, 2_000, 32, 'sha256');
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const body = Buffer.concat([cipher.update('from version 0.6', 'utf8'), cipher.final()]);
    const file: EncryptedBackup = {
      app: 'daily-tracker',
      encrypted: true,
      envelope: 1,
      kdf: 'PBKDF2-SHA256',
      iterations: 2_000,
      salt: salt.toString('base64'),
      cipher: 'AES-256-GCM',
      iv: iv.toString('base64'),
      ciphertext: Buffer.concat([body, cipher.getAuthTag()]).toString('base64'),
      exportedAt: '2026-06-01T00:00:00.000Z',
    };
    assert.equal(isEncryptedBackup(file), true);
    assert.equal(decryptBackup(file, 'correct horse'), 'from version 0.6');
    // Envelope 1 never authenticated its date; an edited one still opens (which is why envelope 2 exists).
    assert.equal(decryptBackup({ ...file, exportedAt: '2020-01-01T00:00:00.000Z' }, 'correct horse'), 'from version 0.6');
  });

  it('shape-checks the envelope', () => {
    assert.equal(isEncryptedBackup(null), false);
    assert.equal(isEncryptedBackup({ app: 'daily-tracker', encrypted: true }), false);
    assert.equal(isEncryptedBackup(encryptBackup('x', 'secret-1', FAST)), true);
  });

  it('base64 survives large payloads', () => {
    const big = new Uint8Array(200_000).map((_, i) => i % 251);
    assert.deepEqual(fromBase64(toBase64(big)), big);
  });
});

describe('export / import with a password', () => {
  it('serializes an encrypted file that inspect/unlock bring back as the same state', () => {
    const state = buildSampleState('2026-10-26', 'America/New_York', NOW.getTime());
    const text = serializeExport(state, NOW, 'my backup pw');
    const parsed = JSON.parse(text) as Record<string, unknown>;
    assert.equal(parsed.encrypted, true);
    assert.equal(parsed.exportedAt, NOW.toISOString());
    assert.equal('habits' in parsed, false, 'nothing readable outside the ciphertext');
    assert.ok(!text.includes('Squats'), 'habit names must not leak');

    const inspected = inspectExport(text);
    assert.equal(inspected.kind, 'encrypted');
    if (inspected.kind !== 'encrypted') return;
    const back = unlockExport(inspected.file, 'my backup pw');
    assert.deepEqual(JSON.parse(JSON.stringify(back)), JSON.parse(JSON.stringify(state)));
    assert.throws(() => unlockExport(inspected.file, 'nope nope'), StorageError);
    assert.throws(() => parseExport(text), (err: unknown) => err instanceof StorageError && /password-protected/.test(err.message));
  });

  it('still reads plain files', () => {
    const state = buildSampleState('2026-10-26', 'America/New_York', NOW.getTime());
    const inspected = inspectExport(serializeExport(state, NOW));
    assert.equal(inspected.kind, 'plain');
  });
});
