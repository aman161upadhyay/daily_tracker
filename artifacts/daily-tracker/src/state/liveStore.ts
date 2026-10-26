/**
 * While the app's store is alive in this JavaScript runtime it is the only
 * writer. Headless entry points (a widget tap, a notification button, the
 * background re-plan) that happen to run on the same runtime hand their
 * commands to it instead of doing their own load → apply → persist, which
 * could otherwise race the screen's own writes (a tap on Today and a widget
 * tap landing in the same second would each persist from a state that did not
 * include the other).
 *
 * When no store is registered (the app is not running) the headless path
 * persists on its own, behind the headless lock.
 */
import type { Action } from './reducer';
import type { TrackerState } from './types';

export interface LiveStore {
  /**
   * Compute actions from the newest state (every earlier command folded in,
   * rendered or not) and apply them as one change. Resolves once everything so
   * far is in the database; `persisted` is false when that save failed (the
   * change is still on screen and retried by the app). `applied` is false when
   * the actions changed nothing.
   */
  apply(build: (state: TrackerState) => Action[]): Promise<{ next: TrackerState; applied: boolean; persisted: boolean }>;
  /** The newest state. */
  current(): TrackerState;
  /** What the database holds, as far as the app knows: the newest state minus the saves still pending or failed. */
  committed(): TrackerState;
  /** How many whole-state replaces so far (erase, restore, sample data): a fence for work that spans awaits. */
  replaceSeq(): number;
  /** True while a replace is applied on screen but not yet in the database (see TrackerContextValue.replacePending). */
  replacePending(): boolean;
  /**
   * False once the provider behind this store is retired (unmounted, or reset by the error
   * boundary): `apply` then saves nothing, and work that spans awaits — a headless re-plan that
   * captured this store before the retirement — must stop short of the OS (see replanLive).
   */
  alive(): boolean;
}

let live: LiveStore | null = null;

export function setLiveStore(store: LiveStore | null): void {
  live = store;
}

export function liveStore(): LiveStore | null {
  return live;
}
