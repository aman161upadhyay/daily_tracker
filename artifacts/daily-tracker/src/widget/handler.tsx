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
import { contextFor, markHeadlessWrite, replanHeadless } from '@/src/services/replan';
import { maybeSnapshot } from '@/src/services/snapshotSync';
import { applyAll, widgetTapActions } from '@/src/state/commands';
import { liveStore } from '@/src/state/liveStore';
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

export async function widgetTaskHandler(props: WidgetTaskHandlerProps): Promise<void> {
  if (props.widgetAction === 'WIDGET_DELETED') return;

  const tap = props.widgetAction === 'WIDGET_CLICK' && props.clickAction === CLICK_LOG;
  const habitId = typeof props.clickActionData?.habitId === 'string' ? props.clickActionData.habitId : '';

  let state: TrackerState | null = null;
  try {
    // The app is running on this runtime: its store is the only writer (it re-plans, redraws and
    // snapshots itself), so the tap goes through it instead of racing its saves.
    const live = liveStore();
    if (live) {
      const { next } = await live.apply((current) => (tap ? widgetTapActions(current, habitId, contextFor(current)) : []));
      state = next;
    } else {
      // One load → apply → persist at a time: a notification button pressed at the same moment runs
      // on this runtime too, and must see this tap before computing its own.
      const written = await withHeadlessLock(async () => {
        const store = await createStore();
        const current = await store.load();
        if (!current || !tap) return { state: current, snapshot: false };
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
        await store.persist(current, next);
        await markHeadlessWrite();
        return { state: next, snapshot: true, nowMs: ctx.nowMs };
      });
      state = written.state;
      // Outside the lock (the snapshot queue must never hold up the next headless write) but awaited:
      // Android may release the headless runtime as soon as this task resolves.
      if (written.snapshot && state) await maybeSnapshot(state, written.nowMs).catch((err) => console.warn('Snapshot after widget tap failed', err));
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
