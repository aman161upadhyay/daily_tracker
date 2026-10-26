import type { TrackerState } from './types';

/** The two ways a state reaches the database (see data/store). */
export interface SaveStore {
  /** Write what changed between `base` (what the database holds) and `target`. */
  persist(base: TrackerState, target: TrackerState): Promise<void>;
  /** Make `target` the whole state, service records included (erase, restore, sample data). */
  replace(target: TrackerState): Promise<void>;
}

export interface SaveQueueHooks {
  /** A write landed (an error about saving can go). */
  onSaved?(): void;
  /** A write failed; `retrying` says whether another attempt is scheduled. */
  onFailed?(err: unknown, retrying: boolean): void;
  /** The replacement (erase, restore, sample data) is in the database. */
  onReplaceCommitted?(): void;
}

export interface SaveQueueOptions {
  /** Attempts after the first before the queue gives up on a change (a later change, or a caller waiting, tries again). */
  maxRetries?: number;
  retryMs?: number;
  /** Timer injection for tests; `setTimeout` / `clearTimeout` otherwise. */
  schedule?: (fn: () => void, ms: number) => unknown;
  cancel?: (handle: unknown) => void;
}

export const MAX_SAVE_RETRIES = 5;
export const SAVE_RETRY_MS = 2000;

interface Waiter {
  gen: number;
  resolve: (ok: boolean) => void;
}

/**
 * The provider's save loop as a plain object: what the database holds (`committed`), the newest
 * state that should end up there (`target`), the change counter each is at, and the writes that
 * move one to the other. One pass writes one diff; the base only moves once a write succeeded,
 * so a failed write is retried from the same base rather than leaving a hole between what the
 * screen shows and what the database holds. Pulled out of the React component so the retry and
 * ownership rules can be tested without a renderer.
 *
 * Ownership: a queue belongs to one provider for one life. `dispose()` retires it for good — no
 * retry fires, no further pass starts, callers waiting for a commit get false. A retired
 * provider (unmounted by the error boundary's reset, or loading again) must never write over
 * the state of the provider that replaced it, or across an erase that happened in between.
 */
export class SaveQueue {
  committed: TrackerState | null = null;
  target: TrackerState | null = null;
  /** Change counter (the provider's dispatch generation) of `committed` / `target`. */
  committedGen = 0;
  targetGen = 0;
  /** The change that replaced the whole state, if the database does not hold it yet (0: none). */
  replaceGen = 0;
  replacePending = false;
  failures = 0;
  disposed = false;

  private store: SaveStore | null = null;
  private flushing = false;
  private last: Promise<boolean> = Promise.resolve(false);
  private retry: unknown = null;
  private waiters: Waiter[] = [];
  private readonly maxRetries: number;
  private readonly retryMs: number;
  private readonly schedule: (fn: () => void, ms: number) => unknown;
  private readonly cancel: (handle: unknown) => void;

  constructor(
    private readonly hooks: SaveQueueHooks = {},
    options: SaveQueueOptions = {},
  ) {
    this.maxRetries = options.maxRetries ?? MAX_SAVE_RETRIES;
    this.retryMs = options.retryMs ?? SAVE_RETRY_MS;
    this.schedule = options.schedule ?? ((fn, ms) => setTimeout(fn, ms));
    this.cancel = options.cancel ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  }

  get attached(): boolean {
    return this.store !== null && !this.disposed;
  }

  get isFlushing(): boolean {
    return this.flushing;
  }

  /** Hydration: the database holds `state`, written at change `gen`. */
  attach(store: SaveStore, state: TrackerState, gen: number): void {
    this.store = store;
    this.rebase(state, gen);
  }

  /** A reload: the database now holds `state` (a headless writer's rows folded in), as of change `gen`. */
  rebase(state: TrackerState, gen: number): void {
    this.committed = state;
    this.target = state;
    this.committedGen = gen;
    this.targetGen = gen;
  }

  /** The newest state to write, from change `gen` (never moves the generation backwards). */
  setTarget(state: TrackerState, gen: number): void {
    this.target = state;
    this.targetGen = Math.max(this.targetGen, gen);
  }

  /** Change `gen` replaced the whole state: it (and anything after it) goes to the database with `replace`. */
  markReplace(gen: number): void {
    this.replaceGen = gen;
    this.replacePending = true;
  }

  /**
   * Write everything between the committed state and the newest state, in one diff per pass.
   * Resolves true only when everything the screen shows is in the database.
   */
  flush(): Promise<boolean> {
    if (this.flushing) return this.last;
    const store = this.store;
    if (!store || this.disposed) return Promise.resolve(false);
    this.flushing = true;
    const run = (async (): Promise<boolean> => {
      try {
        while (!this.disposed && this.committed && this.target && this.target !== this.committed) {
          const base = this.committed;
          const target = this.target;
          const targetGen = this.targetGen;
          try {
            if (this.replaceGen > this.committedGen && targetGen >= this.replaceGen) await store.replace(target);
            else await store.persist(base, target);
            this.committed = target;
            this.committedGen = Math.max(this.committedGen, targetGen);
            if (this.committedGen >= this.replaceGen && this.replacePending) {
              this.replacePending = false;
              this.hooks.onReplaceCommitted?.();
            }
            this.failures = 0;
            this.hooks.onSaved?.();
            this.settleWaiters(true);
          } catch (err) {
            this.failures += 1;
            if (this.disposed) {
              // Retired while saving: no retry, and nobody waits on a write that is not coming.
              this.settleWaiters(false);
              break;
            }
            const retrying = this.failures <= this.maxRetries;
            this.hooks.onFailed?.(err, retrying);
            if (retrying && this.retry === null) {
              this.retry = this.schedule(() => {
                this.retry = null;
                void this.flush();
              }, this.retryMs);
            } else if (!retrying) {
              this.settleWaiters(false); // out of retries: nobody should wait for a save that is not coming
            }
            break;
          }
        }
        return this.committed === this.target;
      } finally {
        this.flushing = false;
      }
    })();
    this.last = run;
    return run;
  }

  /**
   * True once change `gen` (and everything before it) is in the database; false when the save
   * gave up or the queue is retired. The wait always ends: every change is written or given up on.
   */
  commitPending(gen: number): Promise<boolean> {
    if (this.committedGen >= gen) return Promise.resolve(true);
    if (!this.store || this.disposed) return Promise.resolve(false);
    const wait = new Promise<boolean>((resolve) => this.waiters.push({ gen, resolve }));
    // The save gave up earlier and no retry is coming: try once more for this caller, so the wait
    // ends with that attempt (either way) instead of lasting until the next real change.
    if (this.failures > this.maxRetries && !this.flushing && this.retry === null && this.target !== this.committed) void this.flush();
    return wait;
  }

  /** Waiters whose change is committed get true; with `ok` false, everyone gets false. */
  settleWaiters(ok: boolean): void {
    const rest: Waiter[] = [];
    for (const w of this.waiters) {
      if (!ok || w.gen <= this.committedGen) w.resolve(ok);
      else rest.push(w);
    }
    this.waiters = rest;
  }

  /** Retire the queue: no retry fires, no pass starts, waiters get false. A write already in flight finishes on its own. */
  dispose(): void {
    this.disposed = true;
    this.store = null;
    if (this.retry !== null) {
      this.cancel(this.retry);
      this.retry = null;
    }
    this.settleWaiters(false);
  }
}
