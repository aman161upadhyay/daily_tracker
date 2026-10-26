/**
 * Headless widget task (Android): the OS calls it when a widget is added,
 * resized, due for its periodic update, or tapped — with or without the app
 * running. A tap logs through the same commands as a notification button,
 * persists, flags the running app to reload, then redraws every widget.
 */
import React from 'react';
import { requestWidgetUpdate, type WidgetTaskHandlerProps } from 'react-native-android-widget';
import { createStore } from '@/src/data/createStore';
import { withHeadlessLock } from '@/src/services/headlessLock';
import { contextFor, markHeadlessWrite, replanHeadless, replanLive } from '@/src/services/replan';
import { maybeSnapshot } from '@/src/services/snapshotSync';
import { applyAll, widgetTapActions } from '@/src/state/commands';
import { liveStore, type LiveStore } from '@/src/state/liveStore';
import { reducer } from '@/src/state/reducer';
import type { TrackerState } from '@/src/state/types';
import { WIDGET_NAME, widgetModel, type WidgetModel } from './model';
import { CLICK_LOG, TrackerWidget } from './TrackerWidget';

const EMPTY: WidgetModel = { day: '', tiles: [] };

function modelOf(state: TrackerState | null): WidgetModel {
  if (!state) return EMPTY;
  const ctx = contextFor(state);
  return widgetModel(state, ctx.today, ctx.nowMs, ctx.zone);
}

/** Redraw every placed widget (all sizes) from one model. */
export async function drawAllWidgets(model: WidgetModel): Promise<void> {
  await requestWidgetUpdate({
    widgetName: WIDGET_NAME,
    renderWidget: (info) => <TrackerWidget model={model} width={info.width} height={info.height} />,
  });
}

/**
 * A tap while the app is alive on this runtime: its store is the only writer, so the tap goes
 * through it instead of racing its saves. The re-plan and the snapshot are awaited here rather
 * than left to the app's debounced timers: Android may freeze the app as soon as the task ends.
 */
async function tapThroughApp(live: LiveStore, habitId: string, tap: boolean): Promise<TrackerState> {
  const { applied } = await live.apply((current) => (tap ? widgetTapActions(current, habitId, contextFor(current)) : []));
  if (!applied) return live.current();
  const ctx = contextFor(live.current());
  try {
    await replanLive(live, ctx);
  } catch (err) {
    console.warn('Widget re-plan failed; the log is still saved', err);
  }
  await maybeSnapshot(() => live.current(), ctx.nowMs).catch((err) => console.warn('Snapshot after widget tap failed', err));
  return live.current();
}

export async function widgetTaskHandler(props: WidgetTaskHandlerProps): Promise<void> {
  if (props.widgetAction === 'WIDGET_DELETED') return;

  const tap = props.widgetAction === 'WIDGET_CLICK' && props.clickAction === CLICK_LOG;
  const habitId = typeof props.clickActionData?.habitId === 'string' ? props.clickActionData.habitId : '';

  let state: TrackerState | null = null;
  try {
    const live = liveStore();
    if (live) {
      state = await tapThroughApp(live, habitId, tap);
    } else {
      // One load → apply → persist at a time: a notification button pressed at the same moment runs
      // on this runtime too, and must see this tap before computing its own.
      type Written = { live: LiveStore } | { state: TrackerState | null; snapshot: boolean; nowMs?: number };
      const written = await withHeadlessLock(async (): Promise<Written> => {
        const store = await createStore();
        const current = await store.load();
        if (!current || !tap) return { state: current, snapshot: false };
        // The app came alive while we were loading: it is the writer now.
        const alive = liveStore();
        if (alive) return { live: alive };
        const ctx = contextFor(current);
        const actions = widgetTapActions(current, habitId, ctx);
        if (actions.length === 0) return { state: current, snapshot: false };
        const applied = applyAll(current, actions, reducer);
        let next = applied;
        try {
          next = await replanHeadless(applied, ctx);
        } catch (err) {
          console.warn('Widget re-plan failed; the log is still saved', err);
        }
        // Once more after the await: a provider that registered meanwhile gets the tap instead.
        const aliveNow = liveStore();
        if (aliveNow) return { live: aliveNow };
        await store.persist(current, next);
        await markHeadlessWrite();
        return { state: next, snapshot: true, nowMs: ctx.nowMs };
      });
      if ('live' in written) {
        state = await tapThroughApp(written.live, habitId, tap);
      } else {
        state = written.state;
        // Outside the lock (the snapshot queue must never hold up the next headless write) but awaited:
        // Android may release the headless runtime as soon as this task resolves. Stands down if the
        // app came alive by the time its turn comes (it may have erased or restored since).
        const snap = state;
        if (written.snapshot && snap) await maybeSnapshot(() => (liveStore() ? null : snap), written.nowMs).catch((err) => console.warn('Snapshot after widget tap failed', err));
      }
    }
  } catch (err) {
    console.error('Widget task failed', err);
  }

  const model = modelOf(state);
  const { width, height } = props.widgetInfo;
  props.renderWidget(<TrackerWidget model={model} width={width} height={height} />);
  if (props.widgetAction === 'WIDGET_CLICK') {
    // Other instances of the widget show the same numbers.
    await drawAllWidgets(model).catch((err) => console.warn('Widget redraw failed', err));
  }
}
