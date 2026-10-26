/**
 * Headless entry points (Android): notification buttons pressed while the app
 * is in the background or closed, and the periodic re-plan. Imported once from
 * the entry file (`index.js`) so the tasks are defined whenever the bundle
 * loads, including when Android starts it without rendering the app.
 */
import * as BackgroundTask from 'expo-background-task';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { createStore } from '@/src/data/createStore';
import { reducer } from '@/src/state/reducer';
import { applyAll, nudgeResponseActions, type CommandContext } from '@/src/state/commands';
import type { NudgeActionKind } from '@/src/domain/nudges/planner';
import { bodyEpoch } from '@/src/state/epochs';
import { liveStore, type LiveStore } from '@/src/state/liveStore';
import type { TrackerState } from '@/src/state/types';
import { describeSyncError, performBodySync } from './bodySync';
import { HEALTH_CONNECT_SUPPORTED } from './healthConnect';
import { withHeadlessLock } from './headlessLock';
import { parseResponse } from './notificationPayload';
import { BACKGROUND_REPLAN_TASK, NUDGE_RESPONSE_TASK, beginHandling, endHandling, pendingResponses, type FiredRecord, type NudgeResponse } from './notifications';
import { acknowledgeDeliveries, contextFor, markHeadlessWrite, replanHeadless, replanLive } from './replan';
import { maybeSnapshot } from './snapshotSync';
import { refreshWidgets } from './widget';

/**
 * A headless write changed what the home-screen widget shows (and what Android should back up).
 * The snapshot reads its state when its turn comes: if the app came alive meanwhile (and may have
 * erased or restored since), it stands down and leaves the snapshot to the app.
 */
async function afterHeadlessWrite(next: TrackerState, ctx: CommandContext): Promise<void> {
  await markHeadlessWrite();
  await refreshWidgets(next, ctx.today, ctx.nowMs, ctx.zone).catch((err) => console.warn('Widget refresh failed', err));
  await maybeSnapshot(() => (liveStore() ? null : next), ctx.nowMs).catch((err) => console.warn('Snapshot after headless write failed', err));
}

/**
 * The same follow-up when the write went through the running app's store: re-plan, redraw,
 * snapshot — awaited, because Android may freeze the app as soon as the task resolves, before
 * the in-app components' debounced timers run.
 */
async function afterLiveWrite(live: LiveStore, ctx: CommandContext, persisted: boolean): Promise<void> {
  // The store gave up saving (this press, or an earlier change it waited for): the app holds the
  // change in memory and shows its storage error; the widget draws only what is on disk and
  // nothing is snapshotted — the press stays in the inbox for a later replay.
  if (!persisted) {
    await refreshWidgets(live.committed(), ctx.today, ctx.nowMs, ctx.zone).catch((err) => console.warn('Widget refresh failed', err));
    return;
  }
  let next = live.current();
  try {
    next = await replanLive(live, ctx);
  } catch (err) {
    console.warn('Re-plan after a live headless write failed', err);
  }
  await refreshWidgets(next, ctx.today, ctx.nowMs, ctx.zone).catch((err) => console.warn('Widget refresh failed', err));
  await maybeSnapshot(() => live.current(), ctx.nowMs).catch((err) => console.warn('Snapshot after live headless write failed', err));
}

async function handleHeadlessResponse(raw: unknown): Promise<void> {
  // Android hands a background task the raw bundle: the payload sits in `content.dataString`,
  // not `content.data` (see notificationPayload). Reading only `data` here would drop every
  // button pressed while the app is closed.
  const parsed = parseResponse(raw);
  if (!parsed) return;
  await handleResponse({ payload: parsed.payload, action: parsed.action, key: parsed.key, receivedAt: Date.now() });
}

/**
 * Apply a notification button press (a fresh one, or one replayed from the inbox), through the
 * running app's store when there is one, else straight to the database under the headless lock.
 */
export async function handleResponse(r: NudgeResponse): Promise<void> {
  const { payload, key } = r;
  const action = r.action as NudgeActionKind | 'TAP';
  // Written to the inbox and claimed in memory first (the foreground listener may see the same
  // press); the durable "handled" mark is written only once the state write committed, so a crash
  // in between replays rather than loses the press — the press is applied with the instant it was
  // received, so the replay computes what the first attempt did and the command layer's dedupe
  // (the nudge events written with the log) makes it a no-op.
  if (!(await beginHandling(r))) return;
  let committed = false;
  try {
    // The app's own store is alive on this runtime: it is the only writer, and its components
    // re-plan, redraw the widget and refresh the snapshot themselves.
    const build = (state: TrackerState) => nudgeResponseActions(state, payload, action, contextFor(state, r.receivedAt));
    const live = liveStore();
    if (live) {
      const { applied, persisted } = await live.apply(build);
      committed = persisted;
      if (applied) await afterLiveWrite(live, contextFor(live.current()), persisted);
      return;
    }
    type Written = { live: LiveStore } | { next: TrackerState; ctx: CommandContext } | null;
    const written = await withHeadlessLock(async (): Promise<Written> => {
      const store = await createStore();
      const state = await store.load();
      if (!state) return null;
      // The app came alive while we were loading: it is the writer now, and it loaded the same
      // rows we did. Persisting here would overwrite whatever it saves in the meantime.
      const alive = liveStore();
      if (alive) return { live: alive };
      const applied = applyAll(state, build(state), reducer);
      // The re-plan runs at the time it is now, not the press's instant: a replayed press may be hours old.
      const ctx = contextFor(applied);
      let next = applied;
      let delivered: FiredRecord[] = [];
      try {
        ({ next, delivered } = await replanHeadless(applied, ctx));
      } catch (err) {
        console.warn('Re-plan after a notification button failed; the log is still saved', err);
      }
      // Once more after the await: the app's start-up waits for this lock, but a store registered
      // by a provider that was already loaded must get the press instead of a write under it.
      const aliveNow = liveStore();
      if (aliveNow) return { live: aliveNow };
      await store.persist(state, next);
      // The deliveries folded above are on disk now; nothing needs to replay them.
      await acknowledgeDeliveries(delivered).catch((err) => console.warn('Delivery journal update failed', err));
      return { next, ctx };
    });
    if (written && 'live' in written) {
      const { applied, persisted } = await written.live.apply(build);
      committed = persisted;
      if (applied) await afterLiveWrite(written.live, contextFor(written.live.current()), persisted);
      return;
    }
    committed = true;
    if (written) await afterHeadlessWrite(written.next, written.ctx);
  } finally {
    await endHandling(key, committed).catch(() => undefined);
  }
}

/**
 * Apply the presses an earlier process wrote down and never confirmed (see responseInbox). Called
 * whenever a runtime starts work — the app's scheduler once hydrated, the periodic re-plan — so a
 * press lost to a process death lands within hours, before its day is over.
 */
export async function replayPendingResponses(): Promise<void> {
  let queued: NudgeResponse[];
  try {
    queued = await pendingResponses();
  } catch (err) {
    console.warn('Could not read the press inbox', err);
    return;
  }
  for (const r of queued) {
    try {
      await handleResponse(r);
    } catch (err) {
      console.warn('Replaying a notification press failed', err);
    }
  }
}

TaskManager.defineTask(NUDGE_RESPONSE_TASK, async ({ data, error }) => {
  if (error || !data || typeof data !== 'object') return;
  if (!('actionIdentifier' in data)) return; // a received notification, not a button press
  try {
    await handleHeadlessResponse(data);
  } catch (err) {
    console.error('Headless nudge response failed', err);
  }
});

TaskManager.defineTask(BACKGROUND_REPLAN_TASK, async () => {
  // Presses an earlier process lost before its write landed go first: the plan below must see them.
  await replayPendingResponses();
  try {
    // The app is alive on this runtime (backgrounded, not closed): work from its newest state and
    // apply through its store, so this never persists over a tap the screen just made.
    const live = liveStore();
    if (live) {
      let ctx = contextFor(live.current());
      const base = await replanLive(live, ctx);
      if (HEALTH_CONNECT_SUPPORTED && base.settings.healthConnectEnabled && base.body.sync.background) {
        // The read takes a while; if the user disconnected or removed the import meanwhile
        // (the epoch moved, or the setting is off by now) its rows must not land.
        const epoch = bodyEpoch();
        try {
          const { build } = await performBodySync(() => live.current(), ctx);
          const { applied } = await live.apply((s) => (bodyEpoch() === epoch && s.settings.healthConnectEnabled ? build(s) : []));
          // Imported steps change what the plan says (a 19:00 check-in that is no longer wanted, a
          // "behind pace" that is not): the schedule pushed a moment ago described the old figures.
          // A fresh context: the read took a while, and a plan stamped with the earlier instant
          // would offer a slot that instant allowed but this one does not (or cross the boundary).
          if (applied) {
            ctx = contextFor(live.current());
            await replanLive(live, ctx);
          }
        } catch (err) {
          // The Body tab shows the last failure inline (no toast): a background read that threw
          // (Health Connect disabled, uninstalled, access withdrawn) must leave the same mark the
          // foreground read would, or the tab keeps claiming the old connection and last success.
          console.warn('Background Health Connect sync failed', err);
          const lastError = describeSyncError(err);
          await live.apply((s) => (bodyEpoch() === epoch && s.settings.healthConnectEnabled ? [{ type: 'BODY_SYNC', patch: { lastError } }] : []));
        }
      }
      const next = live.current();
      await refreshWidgets(next, ctx.today, ctx.nowMs, ctx.zone).catch((err) => console.warn('Widget refresh failed', err));
      await maybeSnapshot(() => live.current(), ctx.nowMs).catch((err) => console.warn('Snapshot in background re-plan failed', err));
      return BackgroundTask.BackgroundTaskResult.Success;
    }
    const written = await withHeadlessLock(async () => {
      const store = await createStore();
      const state = await store.load();
      if (!state) return null;
      let ctx = contextFor(state);
      const first = await replanHeadless(state, ctx);
      let next = first.next;
      let delivered = first.delivered;
      // Pull Health Connect while we are awake anyway, when background reads were granted.
      if (HEALTH_CONNECT_SUPPORTED && next.settings.healthConnectEnabled && next.body.sync.background) {
        try {
          const { build } = await performBodySync(next, ctx);
          const imported = applyAll(next, build(next), reducer);
          if (imported !== next) {
            // The schedule was built from the old figures; plan again from the imported ones, at
            // the time it is now (the read took a while).
            next = imported;
            ctx = contextFor(next);
            const again = await replanHeadless(next, ctx);
            next = again.next;
            delivered = [...delivered, ...again.delivered];
          }
        } catch (err) {
          console.warn('Background Health Connect sync failed', err);
          next = applyAll(next, [{ type: 'BODY_SYNC', patch: { lastError: describeSyncError(err) } }], reducer);
        }
      }
      // The app came alive meanwhile: it is the writer now; its own scheduler and sync take over.
      if (liveStore()) return null;
      if (next === state) return { next, ctx, changed: false, delivered };
      await store.persist(state, next);
      return { next, ctx, changed: true, delivered };
    });
    // Saved (or nothing to save, which means nothing was folded either): the journal can forget them.
    if (written) await acknowledgeDeliveries(written.delivered).catch((err) => console.warn('Delivery journal update failed', err));
    if (written?.changed) await afterHeadlessWrite(written.next, written.ctx);
    else if (written) {
      // Even without a change the widget is redrawn — the tracking day may have turned over with
      // nothing to write, and yesterday's tiles would stay up — and a stale snapshot refreshed:
      // widget-only use never foregrounds the app.
      await refreshWidgets(written.next, written.ctx.today, written.ctx.nowMs, written.ctx.zone).catch((err) => console.warn('Widget refresh failed', err));
      await maybeSnapshot(() => (liveStore() ? null : written.next), written.ctx.nowMs).catch((err) => console.warn('Snapshot in background re-plan failed', err));
    }
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (err) {
    console.error('Background re-plan failed', err);
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

/** Let expo-notifications route background button presses to the task above. */
export async function registerResponseTask(): Promise<boolean> {
  try {
    await Notifications.registerTaskAsync(NUDGE_RESPONSE_TASK);
    return true;
  } catch (err) {
    console.log('Notification response task unavailable:', err instanceof Error ? err.message : String(err));
    return false;
  }
}
