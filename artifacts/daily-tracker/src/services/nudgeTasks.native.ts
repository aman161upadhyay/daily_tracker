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
import { applyAll, isNudgePayload, nudgeResponseActions, type CommandContext } from '@/src/state/commands';
import type { NudgeActionKind } from '@/src/domain/nudges/planner';
import type { TrackerState } from '@/src/state/types';
import { performBodySync } from './bodySync';
import { HEALTH_CONNECT_SUPPORTED } from './healthConnect';
import { withHeadlessLock } from './headlessLock';
import { BACKGROUND_REPLAN_TASK, NUDGE_RESPONSE_TASK, beginHandling, endHandling } from './notifications';
import { contextFor, markHeadlessWrite, replanHeadless } from './replan';
import { maybeSnapshot } from './snapshotSync';
import { refreshWidgets } from './widget';

/** A headless write changed what the home-screen widget shows (and what Android should back up). */
async function afterHeadlessWrite(next: TrackerState, ctx: CommandContext): Promise<void> {
  await markHeadlessWrite();
  await refreshWidgets(next, ctx.today, ctx.nowMs, ctx.zone).catch((err) => console.warn('Widget refresh failed', err));
  await maybeSnapshot(next, ctx.nowMs).catch((err) => console.warn('Snapshot after headless write failed', err));
}

interface ResponseData {
  actionIdentifier?: string;
  notification?: { request?: { identifier?: string; content?: { data?: unknown } }; date?: number };
}

async function handleHeadlessResponse(data: ResponseData): Promise<void> {
  const payload = data.notification?.request?.content?.data;
  if (!isNudgePayload(payload) || !data.actionIdentifier) return;
  const action = data.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER ? 'TAP' : (data.actionIdentifier as NudgeActionKind);
  const key = `${data.notification?.request?.identifier ?? payload.nudgeId}|${action}|${data.notification?.date ?? ''}`;
  // Claim in memory first (the foreground listener may see the same press); the durable mark is
  // written only once the state write committed, so a crash in between replays rather than loses
  // the press — and the nudge-event ledger makes the replay a no-op.
  if (!(await beginHandling(key))) return;
  let committed = false;
  try {
    const written = await withHeadlessLock(async () => {
      const store = await createStore();
      const state = await store.load();
      if (!state) return null;
      const ctx = contextFor(state);
      const applied = applyAll(state, nudgeResponseActions(state, payload, action, ctx), reducer);
      let next = applied;
      try {
        next = await replanHeadless(applied, ctx);
      } catch (err) {
        console.warn('Re-plan after a notification button failed; the log is still saved', err);
      }
      await store.persist(state, next);
      return { next, ctx };
    });
    committed = true;
    if (written) await afterHeadlessWrite(written.next, written.ctx);
  } finally {
    await endHandling(key, committed).catch(() => undefined);
  }
}

TaskManager.defineTask(NUDGE_RESPONSE_TASK, async ({ data, error }) => {
  if (error || !data) return;
  const d = data as ResponseData;
  if (!('actionIdentifier' in d)) return; // a received notification, not a button press
  try {
    await handleHeadlessResponse(d);
  } catch (err) {
    console.error('Headless nudge response failed', err);
  }
});

TaskManager.defineTask(BACKGROUND_REPLAN_TASK, async () => {
  try {
    const written = await withHeadlessLock(async () => {
      const store = await createStore();
      const state = await store.load();
      if (!state) return null;
      const ctx = contextFor(state);
      let next = await replanHeadless(state, ctx);
      // Pull Health Connect while we are awake anyway, when background reads were granted.
      if (HEALTH_CONNECT_SUPPORTED && next.settings.healthConnectEnabled && next.body.sync.background) {
        try {
          const { actions } = await performBodySync(next, ctx);
          next = applyAll(next, actions, reducer);
        } catch (err) {
          console.warn('Background Health Connect sync failed', err);
        }
      }
      if (next === state) return { next, ctx, changed: false };
      await store.persist(state, next);
      return { next, ctx, changed: true };
    });
    if (written?.changed) await afterHeadlessWrite(written.next, written.ctx);
    // Even without a change, a stale snapshot gets refreshed here: widget-only use never foregrounds the app.
    else if (written) await maybeSnapshot(written.next, written.ctx.nowMs).catch((err) => console.warn('Snapshot in background re-plan failed', err));
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
