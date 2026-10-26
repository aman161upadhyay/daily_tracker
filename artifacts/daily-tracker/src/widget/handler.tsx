/**
 * Headless widget task (Android): the OS calls it when a widget is added,
 * resized, due for its periodic update, or tapped — with or without the app
 * running. A tap logs through the same commands as a notification button,
 * persists, flags the running app to reload, then redraws every widget.
 */
import React from 'react';
import { requestWidgetUpdate, type WidgetTaskHandlerProps } from 'react-native-android-widget';
import { createStore } from '@/src/data/createStore';
import { contextFor, markHeadlessWrite, replanHeadless } from '@/src/services/replan';
import { applyAll, widgetTapActions } from '@/src/state/commands';
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

  let state: TrackerState | null = null;
  try {
    const store = await createStore();
    state = await store.load();

    if (state && props.widgetAction === 'WIDGET_CLICK' && props.clickAction === CLICK_LOG) {
      const habitId = typeof props.clickActionData?.habitId === 'string' ? props.clickActionData.habitId : '';
      const ctx = contextFor(state);
      const actions = widgetTapActions(state, habitId, ctx);
      if (actions.length > 0) {
        const applied = applyAll(state, actions, reducer);
        let next = applied;
        try {
          next = await replanHeadless(applied, ctx);
        } catch (err) {
          console.warn('Widget re-plan failed; the log is still saved', err);
        }
        await store.persist(state, next);
        await markHeadlessWrite();
        state = next;
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
