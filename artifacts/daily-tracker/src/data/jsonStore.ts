/**
 * Whole-state JSON blob store. Used on web (and in tests); native uses SQLite.
 */
import { STORAGE_KEY, type TrackerState } from '@/src/state/types';
import { parseState, StorageError, type TrackerStore } from './store';

export interface KeyValueBackend {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export class JsonStore implements TrackerStore {
  constructor(
    private readonly backend: KeyValueBackend,
    private readonly key: string = STORAGE_KEY,
  ) {}

  async load(): Promise<TrackerState | null> {
    const raw = await this.backend.getItem(this.key);
    if (!raw) return null;
    try {
      return parseState(JSON.parse(raw));
    } catch (err) {
      throw new StorageError('Saved data could not be read.', err);
    }
  }

  async persist(_prev: TrackerState, next: TrackerState): Promise<void> {
    await this.backend.setItem(this.key, JSON.stringify(next));
  }

  async replace(state: TrackerState): Promise<void> {
    await this.backend.setItem(this.key, JSON.stringify(state));
    await this.backend.setItem(this.recordsKey, '{}');
  }

  // Service records: one JSON object beside the state blob, replaced with it.
  private get recordsKey(): string {
    return this.key + '.records';
  }

  private async records(): Promise<Record<string, string>> {
    const raw = await this.backend.getItem(this.recordsKey);
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw) as unknown;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, string>) : {};
    } catch {
      return {};
    }
  }

  async readRecord(key: string): Promise<string | null> {
    const all = await this.records();
    return typeof all[key] === 'string' ? all[key]! : null;
  }

  async writeRecord(key: string, value: string | null, expected: string | null): Promise<boolean> {
    const all = await this.records();
    const current = typeof all[key] === 'string' ? all[key]! : null;
    if (current !== expected) return false;
    if (value === null) delete all[key];
    else all[key] = value;
    await this.backend.setItem(this.recordsKey, JSON.stringify(all));
    return true;
  }
}

/** In-memory backend for tests. */
export class MemoryBackend implements KeyValueBackend {
  private items = new Map<string, string>();
  async getItem(key: string): Promise<string | null> {
    return this.items.get(key) ?? null;
  }
  async setItem(key: string, value: string): Promise<void> {
    this.items.set(key, value);
  }
}
