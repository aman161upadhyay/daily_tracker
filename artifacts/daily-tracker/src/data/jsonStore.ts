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
    await this.replace(next);
  }

  async replace(state: TrackerState): Promise<void> {
    await this.backend.setItem(this.key, JSON.stringify(state));
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
