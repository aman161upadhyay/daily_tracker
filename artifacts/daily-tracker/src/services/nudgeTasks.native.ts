/**
 * Headless entry points (Android): notification buttons pressed while the app
 * is in the background or closed, and the periodic re-plan. Imported once from
 * the root layout so the tasks are defined before anything else runs.
 */
import * as BackgroundTask from 'expo-background-task';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { createStore } from '@/src/data/createStore';
import { reducer } from '@/src/state/reducer';
import { applyAll, isNudgePayload, nudgeResponseActions } from '@/src/state/commands';
import type { NudgeActionKind } from '@/src/domain/nudges/planner';
import { BACKGROUND_REPLAN_TASK, NUDGE_RESPONSE_TASK, markHandled } from './notifications';
import { contextFor, markHeadlessWrite, replanHeadless } from './replan';

interface ResponseData {
  actionIdentifier?: string;
  notification?: { request?: { identifier?: string; content?: { data?: unknown } }; date?: number };
}

async function handleHeadlessResponse(data: ResponseData): Promise<void> {
  const payload = data.notification?.request?.content?.data;
  if (!isNudgePayload(payload) || !data.actionIdentifier) return;
  const action = data.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER ? 'TAP' : (data.actionIdentifier as NudgeActionKind);
  const key = `${data.notification?.request?.identifier ?? payload.nudgeId}|${action}|${data.notification?.date ?? ''}`;
  if (!(await markHandled(key))) return;

  const store = await createStore();
  const state = await store.load();
  if (!state) return;
  const ctx = contextFor(state);
  const applied = applyAll(state, nudgeResponseActions(state, payload, action, ctx), reducer);
  const next = await replanHeadless(applied, ctx);
  await store.persist(state, next);
  await markHeadlessWrite();
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
    const store = await createStore();
    const state = await store.load();
    if (!state) return BackgroundTask.BackgroundTaskResult.Success;
    const ctx = contextFor(state);
    const next = await replanHeadless(state, ctx);
    if (next !== state) {
      await store.persist(state, next);
      await markHeadlessWrite();
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
