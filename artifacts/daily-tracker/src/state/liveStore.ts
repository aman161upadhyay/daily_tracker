/**
 * While the app's store is alive in this JavaScript runtime it is the only
 * writer. Headless entry points (a widget tap, a notification button) that
 * happen to run on the same runtime hand their commands to it instead of doing
 * their own load → apply → persist, which could otherwise race the screen's
 * own writes (a tap on Today and a widget tap landing in the same second would
 * each persist from a state that did not include the other).
 *
 * When no store is registered (the app is not running) the headless path
 * persists on its own, behind the headless lock.
 */
import type { Action } from './reducer';
import type { TrackerState } from './types';

export interface LiveStore {
  /**
   * Compute actions from the newest state and apply them. Resolves once they
   * are in the database; `persisted` is false when that save failed (the
   * change is still on screen and retried by the app).
   */
  apply(build: (state: TrackerState) => Action[]): Promise<{ next: TrackerState; applied: boolean; persisted: boolean }>;
}

let live: LiveStore | null = null;

export function setLiveStore(store: LiveStore | null): void {
  live = store;
}

export function liveStore(): LiveStore | null {
  return live;
}
