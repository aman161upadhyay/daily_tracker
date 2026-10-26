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
import type { FiredRecord } from '@/src/services/notifications';
import { acknowledgeDeliveries, contextFor, markHeadlessWrite, replanHeadless, replanLive } from '@/src/services/replan';
import { committedSource, maybeSnapshot } from '@/src/services/snapshotSync';
import { applyAll, widgetTapActions } from '@/src/state/commands';
import { liveStore, type LiveStore } from '@/src/state/liveStore';
import { reducer } from '@/src/state/reducer';
import type { TrackerState } from '@/src/state/types';
import { WIDGET_NAME, widgetModel, type WidgetModel, type WidgetTile } from './model';

type TileKind = WidgetTile['kind'];

function tileKindOf(raw: unknown): TileKind {
  return raw === 'water' || raw === 'rotation' ? raw : 'habit';
}
import { CLICK_LOG, TrackerWidget } from './TrackerWidget';

const EMPTY: WidgetModel = { day: '', tiles: [] };

function modelOf(state: TrackerState | null, notice?: string): WidgetModel {
  if (!state) return notice ? { ...EMPTY, notice } : EMPTY;
  const ctx = contextFor(state);
  const model = widgetModel(state, ctx.today, ctx.nowMs, ctx.zone);
  return notice ? { ...model, notice } : model;
}

const TAP_FAILED = 'That tap could not be saved. Open Daily Tracker and log it there.';
const LOAD_FAILED = 'Could not read your data. Open Daily Tracker.';

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
async function tapThroughApp(live: LiveStore, habitId: string, kind: TileKind, tap: boolean): Promise<{ state: TrackerState; persisted: boolean }> {
  const { applied, persisted } = await live.apply((current) => (tap ? widgetTapActions(current, habitId, contextFor(current), kind) : []));
  // The store gave up saving (this tap, or an earlier change this tap waited for): the app holds
  // the change in memory and shows its storage error, but the widget must show only what is on
  // disk — a second failed tap must not draw the first unsaved one — nor snapshot anything else.
  if (!persisted) return { state: live.committed(), persisted: false };
  if (!applied) return { state: live.current(), persisted: true };
  const ctx = contextFor(live.current());
  try {
    await replanLive(live, ctx);
  } catch (err) {
    console.warn('Widget re-plan failed; the log is still saved', err);
  }
  await maybeSnapshot(committedSource(live), ctx.nowMs).catch((err) => console.warn('Snapshot after widget tap failed', err));
  return { state: live.current(), persisted: true };
}

export async function widgetTaskHandler(props: WidgetTaskHandlerProps): Promise<void> {
  if (props.widgetAction === 'WIDGET_DELETED') return;

  const tap = props.widgetAction === 'WIDGET_CLICK' && props.clickAction === CLICK_LOG;
  const habitId = typeof props.clickActionData?.habitId === 'string' ? props.clickActionData.habitId : '';
  const kind = tileKindOf(props.clickActionData?.kind);

  let state: TrackerState | null = null;
  // What is known to be on disk: a tap that could not be saved still redraws real numbers, and a
  // tap that was saved before a later step failed is drawn as saved.
  let loaded: TrackerState | null = null;
  let tapSaved = false;
  let notice: string | undefined;
  try {
    const live = liveStore();
    if (live) {
      loaded = live.committed();
      const result = await tapThroughApp(live, habitId, kind, tap);
      state = result.state;
      if (!result.persisted) notice = TAP_FAILED;
    } else {
      // One load → apply → persist at a time: a notification button pressed at the same moment runs
      // on this runtime too, and must see this tap before computing its own.
      type Written = { live: LiveStore } | { state: TrackerState | null; snapshot: boolean; nowMs?: number };
      const written = await withHeadlessLock(async (): Promise<Written> => {
        const store = await createStore();
        const current = await store.load();
        loaded = current;
        if (!current || !tap) return { state: current, snapshot: false };
        // The app came alive while we were loading: it is the writer now.
        const alive = liveStore();
        if (alive) return { live: alive };
        const ctx = contextFor(current);
        const actions = widgetTapActions(current, habitId, ctx, kind);
        if (actions.length === 0) return { state: current, snapshot: false };
        const applied = applyAll(current, actions, reducer);
        // The tap goes to disk before the re-plan, not after it: the widget library gives this task
        // 30 seconds, and once they are up the OS may drop the process whenever it likes. A tap has
        // no identity to replay by (a second drink is a real second drink), so it is made durable
        // early instead; the schedule is the slow part and is rebuilt from the saved rows below.
        await store.persist(current, applied);
        // From here on the tap is on disk: whatever fails below (the revision, the re-plan, the
        // fold's persist) must not redraw the old number or tell the person to log it again.
        loaded = applied;
        tapSaved = true;
        await markHeadlessWrite();
        let next = applied;
        let delivered: FiredRecord[] = [];
        try {
          ({ next, delivered } = await replanHeadless(applied, ctx));
        } catch (err) {
          console.warn('Widget re-plan failed; the log is still saved', err);
        }
        // After the await: a provider that registered meanwhile reloads the tap (the revision above)
        // and plans for itself; the deliveries folded here stay in the journal for it to fold.
        if (liveStore() || next === applied) return { state: applied, snapshot: true, nowMs: ctx.nowMs };
        await store.persist(applied, next);
        loaded = next;
        // The deliveries folded above are on disk now; nothing needs to replay them.
        await acknowledgeDeliveries(delivered).catch((err) => console.warn('Delivery journal update failed', err));
        await markHeadlessWrite();
        return { state: next, snapshot: true, nowMs: ctx.nowMs };
      });
      if ('live' in written) {
        loaded = written.live.committed();
        const result = await tapThroughApp(written.live, habitId, kind, tap);
        state = result.state;
        if (!result.persisted) notice = TAP_FAILED;
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
    // Not "choose habits": the person did nothing wrong, and a tap they made may not be saved.
    // A tap already on disk draws as saved: the schedule is rebuilt by the next re-plan anyway.
    state = loaded;
    notice = tap ? (tapSaved ? undefined : TAP_FAILED) : LOAD_FAILED;
  }

  const model = modelOf(state, notice);
  const { width, height } = props.widgetInfo;
  props.renderWidget(<TrackerWidget model={model} width={width} height={height} />);
  if (props.widgetAction === 'WIDGET_CLICK') {
    // Other instances of the widget show the same numbers.
    await drawAllWidgets(model).catch((err) => console.warn('Widget redraw failed', err));
  }
}
