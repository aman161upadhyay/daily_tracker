/**
 * Pure command builders shared by the in-app actions and the headless
 * notification handler. Each returns reducer actions; nothing here touches
 * React, the OS or the store.
 */
import type { Cadence, EntrySource, Habit, HabitRule, MindKind, NudgeEvent, NudgeEventKind, SnackTrigger, SnackType } from '@/src/domain/models';
import { SNACK_LABELS } from '@/src/domain/models';
import type { NudgeActionKind } from '@/src/domain/nudges/planner';
import { SNOOZE_MINUTES } from '@/src/domain/nudges/planner';
import { addDays, trackingDayOf, weekStartOf } from '@/src/domain/time/trackingDay';
import type { Action } from './reducer';
import { habitView, latestRule, ruleFor } from './selectors';
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

/** Payload kinds a notification can carry (planned nudges plus the timer bell). */
const PAYLOAD_KINDS = new Set(['ROTATION', 'INTERVAL', 'FIXED', 'WATER', 'EVENT', 'SUMMARY', 'CYCLE', 'MIND_END']);
const MIND_KINDS = new Set<MindKind>(['MEDITATION', 'BREATHING']);
const MAX_ID = 200;
const MAX_HABIT_IDS = 50;
/** The largest drink a button may log (the Water target's own ceiling). */
const MAX_PAYLOAD_WATER_ML = 20_000;
const MAX_MIND_MINUTES = 24 * 60;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

const isId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= MAX_ID;
const isInt = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

/**
 * Read a notification's data as a payload we wrote. The bundle comes back from the OS (and on
 * Android through a JSON string), so every field is checked on its own: the required ones must
 * be right or the press is dropped; an optional one that is wrong is left out, so a drink with a
 * broken size still logs the tap size instead of a negative amount. Only own properties count
 * (`'constructor' in SNACK_LABELS` would be true).
 */
export function parsePayload(data: unknown): NudgePayload | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  if (!isId(d.nudgeId) || typeof d.kind !== 'string' || !PAYLOAD_KINDS.has(d.kind)) return null;
  // The timer bell carries no day: its logger derives the day from the instant the session ended.
  if (typeof d.day !== 'string' || !(DAY_RE.test(d.day) || (d.kind === 'MIND_END' && d.day === ''))) return null;
  if (!Array.isArray(d.habitIds) || d.habitIds.length > MAX_HABIT_IDS || !d.habitIds.every(isId)) return null;
  const out: NudgePayload = { nudgeId: d.nudgeId, kind: d.kind, habitIds: d.habitIds as string[], day: d.day };
  if (typeof d.snackType === 'string' && Object.prototype.hasOwnProperty.call(SNACK_LABELS, d.snackType)) out.snackType = d.snackType;
  if (isInt(d.waterMl, 1, MAX_PAYLOAD_WATER_ML)) out.waterMl = d.waterMl;
  if (d.mind && typeof d.mind === 'object') {
    const m = d.mind as Record<string, unknown>;
    if (typeof m.kind === 'string' && MIND_KINDS.has(m.kind as MindKind) && isInt(m.minutes, 1, MAX_MIND_MINUTES) && typeof m.startAt === 'number' && Number.isFinite(m.startAt) && m.startAt > 0) {
      out.mind = { kind: m.kind as MindKind, minutes: m.minutes, startAt: m.startAt };
    }
  }
  return out;
}

export function isNudgePayload(data: unknown): data is NudgePayload {
  return parsePayload(data) !== null;
}

/** Identifier of the one scheduled timer bell. */
export const MIND_END_ID = 'mind-end';

/** What the timer's end bell carries: enough to log the session if the app was gone when it rang. */
export function mindEndPayload(endAtMs: number, minutes: number, kind: MindKind): NudgePayload {
  return { nudgeId: MIND_END_ID, kind: 'MIND_END', habitIds: [], day: '', mind: { kind, minutes, startAt: endAtMs - minutes * 60_000 } };
}

/**
 * The same session seen from both ends — the timer screen when its clock runs out and the end
 * bell when it is tapped — within a minute of each other. Two real sessions are always further
 * apart than that (the second starts after the first ended).
 */
export function mindSessionExists(state: TrackerState, kind: MindKind, startAt: number): boolean {
  return state.mind.some((x) => x.kind === kind && Math.abs(x.startAt - startAt) < 60_000);
}

/** First day of the period after the one containing `day`, for cadence changes. */
export function nextPeriodStart(cadence: Cadence, day: string): string {
  if (cadence === 'DAILY') return addDays(day, 1);
  if (cadence === 'WEEKLY') return addDays(weekStartOf(day), 7);
  const [y, m] = day.split('-').map(Number);
  const next = new Date(Date.UTC(y!, m!, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

export type RuleDraft = Pick<HabitRule, 'cadence' | 'timesPerPeriod' | 'target' | 'freezesPerMonth'>;

const sameRule = (a: RuleDraft, b: RuleDraft) => a.cadence === b.cadence && a.timesPerPeriod === b.timesPerPeriod && a.target === b.target && a.freezesPerMonth === b.freezesPerMonth;

/** The rule in force on `day` (a habit without one behaves as a daily yes/no with two freezes). */
export function ruleInForce(state: TrackerState, habitId: string, day: string): HabitRule {
  return ruleFor(state, habitId, day) ?? { habitId, effectiveFrom: day, cadence: 'DAILY', timesPerPeriod: 1, target: 1, freezesPerMonth: 2 };
}

/**
 * Save an edited rule. Rule changes are versioned, never retroactive: the same cadence applies
 * from today (this period); a new cadence from the next period, so the period under way is judged
 * by the rhythm it started with. A rhythm already planned for later is replaced by the new one at
 * its own start — or called off when the draft is simply today's rule again.
 */
export function ruleChangeActions(state: TrackerState, habit: Pick<Habit, 'id'>, draft: RuleDraft, day: string): Action[] {
  const today = ruleInForce(state, habit.id, day);
  const latest = latestRule(state, habit.id);
  const pending = latest && latest.effectiveFrom > day ? latest : null;
  if (sameRule(draft, today)) return pending ? [{ type: 'REMOVE_RULE', habitId: habit.id, effectiveFrom: pending.effectiveFrom }] : [];
  if (pending && sameRule(draft, pending)) return [];
  const rule = { habitId: habit.id, ...draft };
  if (draft.cadence === today.cadence) {
    const out: Action[] = [{ type: 'SET_RULE', rule: { ...rule, effectiveFrom: day } }];
    if (pending) out.push({ type: 'REMOVE_RULE', habitId: habit.id, effectiveFrom: pending.effectiveFrom });
    return out;
  }
  return [{ type: 'SET_RULE', rule: { ...rule, effectiveFrom: pending ? pending.effectiveFrom : nextPeriodStart(today.cadence, day) } }];
}

/**
 * Change only the per-day target: today's rule from today, and any rhythm already planned for
 * later keeps its start and takes the new number too, so it neither starts early nor undoes it.
 */
export function targetChangeActions(state: TrackerState, habit: Pick<Habit, 'id'>, target: number, day: string): Action[] {
  const out: Action[] = [];
  const today = ruleInForce(state, habit.id, day);
  if (today.target !== target) out.push({ type: 'SET_RULE', rule: { ...today, effectiveFrom: day, target } });
  for (const pending of state.rules.filter((r) => r.habitId === habit.id && r.effectiveFrom > day && r.target !== target)) out.push({ type: 'SET_RULE', rule: { ...pending, target } });
  return out;
}

/**
 * Log "the natural unit" for a habit from a notification or a widget tap: one snack, one tap of
 * water, today's target otherwise. `trigger` labels the snack row (notification = NUDGE, widget = WIDGET).
 */
export function completeFromNudge(
  state: TrackerState,
  habit: Habit,
  ctx: CommandContext,
  source: EntrySource = 'MANUAL',
  trigger: Exclude<SnackTrigger, 'SUGAR_SHIELD'> = 'NUDGE',
): Action[] {
  const { nowMs: at, zone, today: day } = ctx;
  if (habit.presetId === 'water') {
    return [{ type: 'ADD_WATER', entry: { id: ctx.newId(), at, zone, day, ml: state.settings.tapSizeMl, source } }];
  }
  if (habit.snackType) {
    const meta = SNACK_LABELS[habit.snackType];
    const snackTrigger: SnackTrigger = habit.presetId === 'sugar-shield' ? 'SUGAR_SHIELD' : trigger;
    return [{ type: 'LOG_SNACK', snack: { id: ctx.newId(), at, zone, day, type: habit.snackType, reps: meta.defaultReps, seconds: meta.defaultSeconds, trigger: snackTrigger } }];
  }
  // Steps come from the phone's counter (Health Connect); there is no "natural unit" to log by hand.
  if (habit.presetId === 'steps') return [];
  const view = habitView(state, habit, day);
  // Today's own value against the per-day target — not the period ratio: for a weekly habit the
  // week can be "done" while today is not, and a second press must never undo the first.
  if (view.todayValue >= view.target) return [];
  if (habit.type === 'YES_NO') {
    return [{ type: 'ADD_ENTRY', entry: { id: ctx.newId(), habitId: habit.id, day, at, zone, value: 1, source } }];
  }
  const remaining = Math.max(1, Math.round(view.target - view.todayValue));
  if (habit.mindKind) {
    return [{ type: 'LOG_MIND', session: { id: ctx.newId(), startAt: at - remaining * 60_000, endAt: at, zone, day, kind: habit.mindKind, minutes: remaining } }];
  }
  return [{ type: 'ADD_ENTRY', entry: { id: ctx.newId(), habitId: habit.id, day, at, zone, value: remaining, source } }];
}

/**
 * A tap on a widget tile: the same natural unit as a notification "Done", recorded as a widget
 * write. An unknown or archived habit (stale widget after a change in the app) logs nothing.
 */
export function widgetTapActions(state: TrackerState, habitId: string, ctx: CommandContext): Action[] {
  const habit = state.habits.find((h) => h.id === habitId && !h.archived);
  if (!habit) return [];
  return completeFromNudge(state, habit, ctx, 'AUTO_WIDGET', 'WIDGET');
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
    if (!mindSessionExists(state, m.kind, m.startAt)) {
      // The session belongs to the day it ended on, not the day the bell was tapped (it may be
      // acknowledged the next morning).
      const endAt = m.startAt + m.minutes * 60_000;
      const day = trackingDayOf(endAt, ctx.zone, state.settings.dayBoundaryHour);
      out.push({ type: 'LOG_MIND', session: { id: ctx.newId(), startAt: m.startAt, endAt, zone: ctx.zone, day, kind: m.kind, minutes: m.minutes } });
    }
    return out;
  }
  const habits = payload.habitIds.map((id) => state.habits.find((h) => h.id === id)).filter((h): h is Habit => !!h && !h.archived);
  // The same press can reach us twice (headless task and the foreground listener, or a replay
  // after a crash between the write and the "handled" marker). The ledger is written in the same
  // transaction as the log, so it is the one dedupe that survives a process death.
  const alreadyRecorded = (kind: NudgeEventKind) => state.nudgeEvents.some((e) => e.nudgeId === payload.nudgeId && e.kind === kind);
  switch (action) {
    case 'DONE': {
      if (alreadyRecorded('DONE')) return out;
      if (payload.kind === 'EVENT') {
        // A one-off follow-up (the Sugar Shield walk): "Did it" means the walk itself, never another
        // round of the habit that scheduled it. The payload names the snack; a walk by default.
        // Payloads come from the OS; the snack type is checked against the known set first.
        const type: SnackType = payload.snackType !== undefined && Object.prototype.hasOwnProperty.call(SNACK_LABELS, payload.snackType) ? (payload.snackType as SnackType) : 'WALK';
        const meta = SNACK_LABELS[type];
        out.push({ type: 'LOG_SNACK', snack: { id: ctx.newId(), at: ctx.nowMs, zone: ctx.zone, day: ctx.today, type, reps: meta.defaultReps, seconds: type === 'WALK' ? 120 : meta.defaultSeconds, trigger: 'NUDGE' } });
        out.push({ type: 'REMOVE_EVENT', id: payload.nudgeId.replace(/^event:/, '') });
      } else {
        for (const h of habits) out.push(...completeFromNudge(state, h, ctx));
      }
      out.push(nudgeEventAction(payload, 'DONE', ctx));
      break;
    }
    case 'WATER': {
      // The drink is recorded under its own ledger kind: a merged water + movement nudge ends in a
      // SNOOZED event (so the movement half comes back), which alone could not tell a replay of
      // this press from a plain snooze — and would log the drink again. The slot keeps its id when
      // it comes back, so a WATER is only a replay while the snooze it came with is still running:
      // once that snooze expired, the notification on screen is a new delivery and a new drink.
      if (alreadyRecorded('DONE') || waterStillCurrent(state, payload.nudgeId, ctx.nowMs)) return out;
      const ml = payload.waterMl ?? state.settings.tapSizeMl;
      out.push({ type: 'ADD_WATER', entry: { id: ctx.newId(), at: ctx.nowMs, zone: ctx.zone, day: ctx.today, ml, source: 'MANUAL' } });
      out.push(nudgeEventAction(payload, 'WATER', ctx));
      // Only the water half is done; the movement half (if merged) stays open via a short snooze.
      if (habits.some((h) => h.snackType)) out.push(nudgeEventAction(payload, 'SNOOZED', ctx, ctx.nowMs + SNOOZE_MINUTES * 60_000));
      else out.push(nudgeEventAction(payload, 'DONE', ctx));
      break;
    }
    case 'SNOOZE':
      out.push(nudgeEventAction(payload, 'SNOOZED', ctx, ctx.nowMs + SNOOZE_MINUTES * 60_000));
      break;
    case 'SWAP':
      if (alreadyRecorded('SWAPPED')) return out;
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

/** A WATER press on this slot whose snooze (if any) has not run out yet: a second copy of the same press. */
function waterStillCurrent(state: TrackerState, nudgeId: string, nowMs: number): boolean {
  const events = state.nudgeEvents.filter((e) => e.nudgeId === nudgeId);
  return events.some(
    (w) => w.kind === 'WATER' && !events.some((s) => s.kind === 'SNOOZED' && s.at >= w.at && s.untilMs !== undefined && s.untilMs <= nowMs),
  );
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
