/**
 * Pure command builders shared by the in-app actions and the headless
 * notification handler. Each returns reducer actions; nothing here touches
 * React, the OS or the store.
 */
import type { EntrySource, Habit, MindKind, NudgeEvent, NudgeEventKind, SnackTrigger } from '@/src/domain/models';
import { SNACK_LABELS } from '@/src/domain/models';
import type { NudgeActionKind } from '@/src/domain/nudges/planner';
import { SNOOZE_MINUTES } from '@/src/domain/nudges/planner';
import { addDays } from '@/src/domain/time/trackingDay';
import type { Action } from './reducer';
import { habitView } from './selectors';
import type { TrackerState } from './types';

export interface CommandContext {
  nowMs: number;
  zone: string;
  /** Tracking day for "now". */
  today: string;
  newId: () => string;
}

/** Days of nudge history to keep. */
export const NUDGE_EVENT_RETENTION_DAYS = 7;

/** What a notification carries so a response can be handled without the plan. */
export interface NudgePayload {
  nudgeId: string;
  kind: string;
  habitIds: string[];
  day: string;
  snackType?: string;
  waterMl?: number;
  /** Timer bell: enough to log the session if the app was killed before the timer finished. */
  mind?: { kind: MindKind; minutes: number; startAt: number };
}

export function isNudgePayload(data: unknown): data is NudgePayload {
  if (!data || typeof data !== 'object') return false;
  const d = data as Partial<NudgePayload>;
  return typeof d.nudgeId === 'string' && Array.isArray(d.habitIds) && typeof d.day === 'string';
}

/** Log "the natural unit" for a habit from a notification: one snack, one tap of water, today's target otherwise. */
export function completeFromNudge(state: TrackerState, habit: Habit, ctx: CommandContext, source: EntrySource = 'MANUAL'): Action[] {
  const { nowMs: at, zone, today: day } = ctx;
  if (habit.presetId === 'water') {
    return [{ type: 'ADD_WATER', entry: { id: ctx.newId(), at, zone, day, ml: state.settings.tapSizeMl, source } }];
  }
  if (habit.snackType) {
    const meta = SNACK_LABELS[habit.snackType];
    const trigger: SnackTrigger = habit.presetId === 'sugar-shield' ? 'SUGAR_SHIELD' : 'NUDGE';
    return [{ type: 'LOG_SNACK', snack: { id: ctx.newId(), at, zone, day, type: habit.snackType, reps: meta.defaultReps, seconds: meta.defaultSeconds, trigger } }];
  }
  const view = habitView(state, habit, day);
  if (view.todayRatio >= 1) return [];
  if (habit.type === 'YES_NO') {
    return [{ type: 'TOGGLE_ENTRY', entry: { id: ctx.newId(), habitId: habit.id, day, at, zone, value: 1, source } }];
  }
  const remaining = Math.max(1, Math.round(view.target - view.todayValue));
  if (habit.mindKind) {
    return [{ type: 'LOG_MIND', session: { id: ctx.newId(), startAt: at - remaining * 60_000, endAt: at, zone, day, kind: habit.mindKind, minutes: remaining } }];
  }
  return [{ type: 'ADD_ENTRY', entry: { id: ctx.newId(), habitId: habit.id, day, at, zone, value: remaining, source } }];
}

export function nudgeEventAction(payload: Pick<NudgePayload, 'nudgeId' | 'habitIds'>, kind: NudgeEventKind, ctx: CommandContext, untilMs?: number): Action {
  const event: NudgeEvent = {
    id: ctx.newId(),
    nudgeId: payload.nudgeId,
    habitIds: payload.habitIds,
    at: ctx.nowMs,
    zone: ctx.zone,
    day: ctx.today,
    kind,
    ...(untilMs !== undefined ? { untilMs } : {}),
  };
  return { type: 'NUDGE_EVENT', event, keepFromDay: addDays(ctx.today, -NUDGE_EVENT_RETENTION_DAYS) };
}

/** Translate a notification button press (or tap) into state changes. */
export function nudgeResponseActions(state: TrackerState, payload: NudgePayload, action: NudgeActionKind | 'TAP', ctx: CommandContext): Action[] {
  const out: Action[] = [];
  if (payload.kind === 'MIND_END') {
    const m = payload.mind;
    if (!m) return out;
    const already = state.mind.some((x) => x.kind === m.kind && Math.abs(x.startAt - m.startAt) < 2 * 60_000);
    if (!already) {
      const endAt = m.startAt + m.minutes * 60_000;
      out.push({ type: 'LOG_MIND', session: { id: ctx.newId(), startAt: m.startAt, endAt, zone: ctx.zone, day: ctx.today, kind: m.kind, minutes: m.minutes } });
    }
    return out;
  }
  const habits = payload.habitIds.map((id) => state.habits.find((h) => h.id === id)).filter((h): h is Habit => !!h && !h.archived);
  switch (action) {
    case 'DONE': {
      for (const h of habits) out.push(...completeFromNudge(state, h, ctx));
      if (payload.kind === 'EVENT' && habits.every((h) => !h.snackType)) {
        // Sugar Shield follow-up: the walk counts as a walk snack even without a walk habit.
        out.push({ type: 'LOG_SNACK', snack: { id: ctx.newId(), at: ctx.nowMs, zone: ctx.zone, day: ctx.today, type: 'WALK', seconds: 120, trigger: 'NUDGE' } });
      }
      if (payload.kind === 'EVENT') out.push({ type: 'REMOVE_EVENT', id: payload.nudgeId.replace(/^event:/, '') });
      out.push(nudgeEventAction(payload, 'DONE', ctx));
      break;
    }
    case 'WATER': {
      const ml = payload.waterMl ?? state.settings.tapSizeMl;
      out.push({ type: 'ADD_WATER', entry: { id: ctx.newId(), at: ctx.nowMs, zone: ctx.zone, day: ctx.today, ml, source: 'MANUAL' } });
      // Only the water half is done; the movement half (if merged) stays open via a short snooze.
      if (habits.some((h) => h.snackType)) out.push(nudgeEventAction(payload, 'SNOOZED', ctx, ctx.nowMs + SNOOZE_MINUTES * 60_000));
      else out.push(nudgeEventAction(payload, 'DONE', ctx));
      break;
    }
    case 'SNOOZE':
      out.push(nudgeEventAction(payload, 'SNOOZED', ctx, ctx.nowMs + SNOOZE_MINUTES * 60_000));
      break;
    case 'SWAP':
      out.push({ type: 'SWAP', day: ctx.today });
      out.push(nudgeEventAction(payload, 'SWAPPED', ctx));
      break;
    case 'OPEN':
    case 'TAP':
      out.push(nudgeEventAction(payload, 'FIRED', ctx));
      break;
  }
  return out;
}

/** Record delivered nudges the OS fired while we were not watching (see nudgeScheduler). */
export function firedActions(state: TrackerState, fired: { id: string; habitIds: string[]; day: string; at: number }[], ctx: CommandContext): Action[] {
  const known = new Set(state.nudgeEvents.map((e) => e.nudgeId));
  return fired
    .filter((f) => !known.has(f.id))
    .map((f) => ({
      type: 'NUDGE_EVENT' as const,
      event: { id: ctx.newId(), nudgeId: f.id, habitIds: f.habitIds, at: f.at, zone: ctx.zone, day: f.day, kind: 'FIRED' as const },
      keepFromDay: addDays(ctx.today, -NUDGE_EVENT_RETENTION_DAYS),
    }));
}

export function applyAll(state: TrackerState, actions: Action[], reduce: (s: TrackerState, a: Action) => TrackerState): TrackerState {
  let next = state;
  for (const a of actions) next = reduce(next, a);
  return next;
}
