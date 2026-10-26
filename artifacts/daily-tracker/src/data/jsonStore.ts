/**
 * Whole-state JSON blob store. Used on web (and in tests); native uses SQLite.
 */
import { STORAGE_KEY, type TrackerState } from '@/src/state/types';
import { parseState, recordVersion, StorageError, type RecordRead, type TrackerStore } from './store';

export interface KeyValueBackend {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

interface Records {
  /** Bumped by every replace, so a version read before one never matches after it. */
  generation: number;
  records: Record<string, string>;
}

export class JsonStore implements TrackerStore {
  // One operation at a time: the backend has no transactions, so a compare-and-set that
  // interleaved with another write (or a replace) would compare against a stale picture.
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly backend: KeyValueBackend,
    private readonly key: string = STORAGE_KEY,
  ) {}

  private serialized<T>(job: () => Promise<T>): Promise<T> {
    const run = this.queue.then(job, job);
    this.queue = run.catch(() => undefined);
    return run;
  }

  async load(): Promise<TrackerState | null> {
    const raw = await this.backend.getItem(this.key);
    if (!raw) return null;
    try {
      return parseState(JSON.parse(raw));
    } catch (err) {
      throw new StorageError('Saved data could not be read.', err);
    }
  }

  persist(_prev: TrackerState, next: TrackerState): Promise<void> {
    return this.serialized(() => this.backend.setItem(this.key, JSON.stringify(next)));
  }

  replace(state: TrackerState): Promise<void> {
    return this.serialized(async () => {
      const { generation } = await this.records();
      await this.backend.setItem(this.key, JSON.stringify(state));
      await this.backend.setItem(this.recordsKey, JSON.stringify({ generation: generation + 1, records: {} } satisfies Records));
    });
  }

  // Service records: one JSON object beside the state blob, replaced with it.
  private get recordsKey(): string {
    return this.key + '.records';
  }

  private async records(): Promise<Records> {
    const raw = await this.backend.getItem(this.recordsKey);
    if (!raw) return { generation: 0, records: {} };
    try {
      const parsed = JSON.parse(raw) as Partial<Records> | null;
      const generation = typeof parsed?.generation === 'number' && Number.isFinite(parsed.generation) ? parsed.generation : 0;
      const records = parsed?.records && typeof parsed.records === 'object' && !Array.isArray(parsed.records) ? parsed.records : {};
      return { generation, records };
    } catch {
      return { generation: 0, records: {} };
    }
  }

  readRecord(key: string): Promise<RecordRead> {
    return this.serialized(async () => {
      const { generation, records } = await this.records();
      const value = typeof records[key] === 'string' ? records[key]! : null;
      return { value, version: recordVersion(generation, value) };
    });
  }

  writeRecord(key: string, value: string | null, expected: string): Promise<string | null> {
    return this.serialized(async () => {
      const { generation, records } = await this.records();
      const current = typeof records[key] === 'string' ? records[key]! : null;
      if (recordVersion(generation, current) !== expected) return null;
      if (value === null) delete records[key];
      else records[key] = value;
      await this.backend.setItem(this.recordsKey, JSON.stringify({ generation, records } satisfies Records));
      return recordVersion(generation, value);
    });
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
