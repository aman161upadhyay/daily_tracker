/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { StorageError } from '../src/data/store';
import { describeImport, exportFileName, parseExport, serializeExport } from '../src/data/transfer';
import { buildEmptyState, buildSampleState } from '../src/state/seed';

const NOW = new Date('2026-10-25T15:04:05Z');

describe('export / import', () => {
  it('round-trips the sample state through the export text', () => {
    const state = buildSampleState('2026-10-25', 'America/New_York', NOW.getTime());
    const text = serializeExport(state, NOW);
    const parsed = JSON.parse(text) as Record<string, unknown>;
    assert.equal(parsed.app, 'daily-tracker');
    assert.equal(parsed.exportedAt, NOW.toISOString());
    const back = parseExport(text);
    assert.deepEqual(JSON.parse(JSON.stringify(back)), JSON.parse(JSON.stringify(state)));
  });

  it('names the file by date', () => {
    assert.equal(exportFileName(NOW), 'daily-tracker-2026-10-25.json');
  });

  it('rejects non-JSON and foreign files with readable errors', () => {
    assert.throws(() => parseExport('{not json'), (e: unknown) => e instanceof StorageError && /valid JSON/.test(e.message));
    assert.throws(() => parseExport('{"hello":1}'), (e: unknown) => e instanceof StorageError && /version/.test(e.message));
    assert.throws(() => parseExport(JSON.stringify({ version: 1, habits: [] })), (e: unknown) => e instanceof StorageError && /Missing "rules"/.test(e.message));
  });

  it('fills missing settings with defaults on import', () => {
    const state = buildEmptyState('2026-10-25');
    const stripped = { ...state, settings: { name: 'A' } };
    const back = parseExport(JSON.stringify(stripped));
    assert.equal(back.settings.name, 'A');
    assert.equal(back.settings.tapSizeMl, 250);
    assert.equal(back.settings.onboardingDone, false);
  });

  it('describes what an import holds', () => {
    const state = buildEmptyState('2026-10-25');
    assert.equal(describeImport(state), '1 active habit and 0 log entries');
  });
});
