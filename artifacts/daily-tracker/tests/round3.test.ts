/// <reference types="node" />
/**
 * Council round 3 regressions: the raw Android notification bundle
 * (`dataString`), the WATER ledger kind on a merged nudge, paused slots and the
 * daily budget, clock-time validation, step totals cleared by a complete read,
 * heart rows replaced by a complete read, sync metadata from a file, and the
 * monthly quota in short months.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validateRecords, ValidationError } from '../src/data/validate';
import { mergeBody, normalizeBody } from '../src/domain/body/merge';
import { EMPTY_BODY } from '../src/domain/body/types';
import { evaluateStreak, periodQuota } from '../src/domain/habits/streaks';
import { latestEvents, planNudges } from '../src/domain/nudges/planner';
import { addDays, instantOf } from '../src/domain/time/trackingDay';
import { PRESET_BY_ID } from '../src/library/presets';
import { contentData, parseResponse } from '../src/services/notificationPayload';
import { autoTickActions } from '../src/state/bodyCommands';
import { applyAll, nudgeResponseActions, type CommandContext, type NudgePayload } from '../src/state/commands';
import { reducer } from '../src/state/reducer';
import { buildEmptyState, buildSampleState, habitFromPreset } from '../src/state/seed';
import { habitView, planInputFor } from '../src/state/selectors';
import type { TrackerState } from '../src/state/types';

const ZONE = 'America/New_York';
const TODAY = '2026-10-25';
const NOW = instantOf(TODAY, 15 * 60, ZONE);
let seq = 0;
const ctx: CommandContext = { nowMs: NOW, zone: ZONE, today: TODAY, newId: () => `r3-${++seq}` };

const sample = () => buildSampleState(TODAY, ZONE, NOW);

function withHabits(ids: string[]): TrackerState {
  let state = buildEmptyState(TODAY, undefined, { withWater: true });
  for (const presetId of ids) {
    const built = habitFromPreset(PRESET_BY_ID[presetId]!, `h-${presetId}`, addDays(TODAY, -40));
    state = reducer(state, { type: 'ADD_HABIT', ...built });
  }
  return state;
}

describe('notification response payloads', () => {
  const payload: NudgePayload = { nudgeId: 'rot:2026-10-25:900', kind: 'ROTATION', habitIds: ['h-1'], day: TODAY, snackType: 'SQUATS' };

  it('reads the raw Android bundle, where the data travels as a JSON string', () => {
    const raw = {
      actionIdentifier: 'DONE',
      notification: { date: 1_761_400_000_000, request: { identifier: payload.nudgeId, content: { title: 'Movement snack', dataString: JSON.stringify(payload) } } },
    };
    const parsed = parseResponse(raw)!;
    assert.deepEqual(parsed.payload, payload);
    assert.equal(parsed.action, 'DONE');
    assert.equal(parsed.key, 'rot:2026-10-25:900|DONE|1761400000000');
  });

  it('reads the mapped shape the foreground listener gets, and maps the default action to TAP', () => {
    const mapped = { actionIdentifier: 'expo.modules.notifications.actions.DEFAULT', notification: { date: 5, request: { identifier: 'x', content: { data: payload } } } };
    const parsed = parseResponse(mapped)!;
    assert.deepEqual(parsed.payload, payload);
    assert.equal(parsed.action, 'TAP');
    assert.equal(parsed.key, 'x|TAP|5');
  });

  it('prefers data over dataString and ignores anything that is not a nudge', () => {
    assert.deepEqual(contentData({ data: payload, dataString: '{"nudgeId":"other"}' }), payload);
    assert.equal(contentData({ dataString: 'not json' }), undefined);
    assert.equal(contentData(undefined), undefined);
    assert.equal(parseResponse(null), null);
    assert.equal(parseResponse({ actionIdentifier: 'DONE' }), null);
    assert.equal(parseResponse({ notification: { request: { content: { data: payload } } } }), null); // no action: a delivery, not a press
    assert.equal(parseResponse({ actionIdentifier: 'DONE', notification: { request: { content: { dataString: JSON.stringify({ hello: 1 }) } } } }), null);
  });
});

describe('WATER on a merged water + movement nudge', () => {
  it('logs the drink once, keeps the movement half open, and ignores a replay', () => {
    const state = sample();
    const water = state.habits.find((h) => h.presetId === 'water')!;
    const squats = state.habits.find((h) => h.snackType === 'SQUATS' && h.presetId !== 'sugar-shield')!;
    const merged: NudgePayload = { nudgeId: 'rot:2026-10-25:900', kind: 'ROTATION', habitIds: [squats.id, water.id], day: TODAY, snackType: 'SQUATS', waterMl: 250 };
    const once = applyAll(state, nudgeResponseActions(state, merged, 'WATER', ctx), reducer);
    assert.equal(once.water.length, state.water.length + 1);
    const kinds = once.nudgeEvents.filter((e) => e.nudgeId === merged.nudgeId).map((e) => e.kind);
    assert.deepEqual(kinds, ['WATER', 'SNOOZED']);
    // The snooze stays the latest word on the slot, so the planner re-offers the squats.
    assert.equal(latestEvents(once.nudgeEvents).get(merged.nudgeId)!.kind, 'SNOOZED');
    // A second delivery of the same press (headless task and foreground listener, or a replay) adds nothing.
    assert.deepEqual(nudgeResponseActions(once, merged, 'WATER', ctx), []);
    assert.equal(applyAll(once, nudgeResponseActions(once, merged, 'WATER', ctx), reducer).water.length, once.water.length);
    // A plain snooze on another slot never blocks a later drink there.
    const other = { ...merged, nudgeId: 'rot:2026-10-25:960' };
    const snoozed = applyAll(state, nudgeResponseActions(state, other, 'SNOOZE', ctx), reducer);
    assert.equal(applyAll(snoozed, nudgeResponseActions(snoozed, other, 'WATER', ctx), reducer).water.length, state.water.length + 1);
    assert.doesNotThrow(() => validateRecords(once));
  });

  it('a water-only nudge records WATER and DONE', () => {
    const state = sample();
    const water = state.habits.find((h) => h.presetId === 'water')!;
    const drink: NudgePayload = { nudgeId: 'water:2026-10-25:900', kind: 'WATER', habitIds: [water.id], day: TODAY, waterMl: 250 };
    const drank = applyAll(state, nudgeResponseActions(state, drink, 'WATER', ctx), reducer);
    assert.deepEqual(
      drank.nudgeEvents.filter((e) => e.nudgeId === drink.nudgeId).map((e) => e.kind),
      ['WATER', 'DONE'],
    );
    assert.deepEqual(nudgeResponseActions(drank, drink, 'WATER', ctx), []);
  });
});

describe('planner: pauses, budgets and clock times', () => {
  it('slots inside a pause do not spend the daily budget', () => {
    let state = withHabits(['squat-snack']);
    const squat = state.habits.find((h) => h.presetId === 'squat-snack')!;
    state = reducer(state, { type: 'SET_POLICY', policy: { habitId: squat.id, kind: 'ROTATION', onlyWhenBehind: false, maxPerDay: 2, enabled: true } });
    state = reducer(state, { type: 'UPDATE_SETTINGS', patch: { activeStartMin: 8 * 60, activeEndMin: 22 * 60, nudgeIntervalMin: 60 } });
    const morning = instantOf(TODAY, 8 * 60, ZONE);
    const plain = planNudges(planInputFor(state, TODAY, morning, ZONE)).filter((n) => n.day === TODAY && n.habitIds.includes(squat.id));
    assert.equal(plain.length, 2);
    // Paused until 15:00: the slots before it are never offered — and the two allowed ones come after it.
    const paused = reducer(state, { type: 'UPDATE_SETTINGS', patch: { offUntil: instantOf(TODAY, 15 * 60, ZONE) } });
    const after = planNudges(planInputFor(paused, TODAY, morning, ZONE)).filter((n) => n.day === TODAY && n.habitIds.includes(squat.id));
    assert.equal(after.length, 2);
    for (const n of after) assert.ok(n.at >= instantOf(TODAY, 15 * 60, ZONE));
  });

  it('an interval habit keeps its budget through a pause too', () => {
    let state = withHabits(['meditate']);
    const med = state.habits.find((h) => h.presetId === 'meditate')!;
    state = reducer(state, { type: 'SET_POLICY', policy: { habitId: med.id, kind: 'INTERVAL', intervalMin: 120, onlyWhenBehind: false, maxPerDay: 3, enabled: true } });
    state = reducer(state, { type: 'UPDATE_SETTINGS', patch: { activeStartMin: 8 * 60, activeEndMin: 22 * 60 } });
    const morning = instantOf(TODAY, 8 * 60, ZONE);
    const paused = reducer(state, { type: 'UPDATE_SETTINGS', patch: { offUntil: instantOf(TODAY, 15 * 60, ZONE) } });
    const slots = planNudges(planInputFor(paused, TODAY, morning, ZONE)).filter((n) => n.day === TODAY && n.habitIds.includes(med.id));
    assert.equal(slots.length, 3);
    for (const n of slots) assert.ok(n.at >= instantOf(TODAY, 15 * 60, ZONE));
  });

  it('rejects clock times that are not HH:MM on import and skips them when planning', () => {
    const state = sample();
    const policy = state.policies[0]!;
    const fixed = { ...policy, kind: 'FIXED' as const, times: ['07:30', '21:00'] };
    assert.doesNotThrow(() => validateRecords({ ...state, policies: [fixed, ...state.policies.slice(1)] }));
    for (const bad of ['25:99', '7:30', '07:3', 'noon', '', '07:30:00']) {
      assert.throws(() => validateRecords({ ...state, policies: [{ ...fixed, times: [bad] }, ...state.policies.slice(1)] } as never), (e: unknown) => e instanceof ValidationError && /times/.test(e.message));
    }
    // A bad time that slipped in from an old file is skipped, never placed at NaN.
    let s = withHabits(['meditate']);
    const med = s.habits.find((h) => h.presetId === 'meditate')!;
    s = reducer(s, { type: 'SET_POLICY', policy: { habitId: med.id, kind: 'FIXED', times: ['25:99', 'noon', '18:00'], onlyWhenBehind: false, maxPerDay: 3, enabled: true } });
    const plan = planNudges(planInputFor(s, TODAY, instantOf(TODAY, 8 * 60, ZONE), ZONE)).filter((n) => n.habitIds.includes(med.id) && n.day === TODAY);
    assert.equal(plan.length, 1);
    assert.equal(plan[0]!.at, instantOf(TODAY, 18 * 60, ZONE));
    for (const n of plan) assert.ok(Number.isFinite(n.at));
  });
});

describe('Health Connect: complete reads answer for every day', () => {
  const window = { fromDay: addDays(TODAY, -6), toDay: TODAY };

  it('clears an automatic step total for a window day the read returned nothing for', () => {
    let state = withHabits(['steps']);
    const steps = state.habits.find((h) => h.presetId === 'steps')!;
    const day = addDays(TODAY, -2);
    state = applyAll(state, autoTickActions(state, { habitSteps: [{ day, steps: 6000 }], window }, ctx), reducer);
    assert.equal(state.entries.filter((e) => e.habitId === steps.id && e.day === day).length, 1);
    // Partial read (no window) that lacks the day: the total stays.
    const partial = applyAll(state, autoTickActions(state, { habitSteps: [{ day: TODAY, steps: 100 }] }, ctx), reducer);
    assert.equal(partial.entries.filter((e) => e.habitId === steps.id && e.day === day).length, 1);
    // Complete read that lacks the day: the records are gone upstream, so is the mirror.
    const complete = applyAll(state, autoTickActions(state, { habitSteps: [{ day: TODAY, steps: 100 }], window }, ctx), reducer);
    assert.equal(complete.entries.filter((e) => e.habitId === steps.id && e.day === day).length, 0);
    // A total typed by hand is never touched.
    const manual = reducer(state, { type: 'ADD_ENTRY', entry: { id: 'm1', habitId: steps.id, day: addDays(TODAY, -3), at: NOW, zone: ZONE, value: 4000, source: 'MANUAL' } });
    const kept = applyAll(manual, autoTickActions(manual, { habitSteps: [], window }, ctx), reducer);
    assert.ok(kept.entries.some((e) => e.id === 'm1'));
  });

  it('a workout moved to another day takes its strength tick with it', () => {
    let state = withHabits(['strength-session']);
    const oldDay = addDays(TODAY, -5);
    const gym = { id: 'gym', startAt: instantOf(oldDay, 7 * 60, ZONE), endAt: instantOf(oldDay, 8 * 60, ZONE), day: oldDay, type: 0, minutes: 60, hidden: false };
    state = applyAll(state, [{ type: 'IMPORT_BODY', batch: { workouts: [gym] } }, ...autoTickActions(state, { workouts: [gym], window }, ctx)], reducer);
    assert.deepEqual(state.entries.map((e) => e.day), [oldDay]);
    // The source app corrects the date; the read only covers the last two days.
    const moved = { ...gym, startAt: instantOf(TODAY, 7 * 60, ZONE), endAt: instantOf(TODAY, 8 * 60, ZONE), day: TODAY };
    const narrow = { fromDay: addDays(TODAY, -1), toDay: TODAY };
    const next = applyAll(state, [{ type: 'IMPORT_BODY', batch: { workouts: [moved], window: narrow } }, ...autoTickActions(state, { workouts: [moved], window: narrow }, ctx)], reducer);
    assert.deepEqual(next.entries.map((e) => e.day), [TODAY]);
    // Another qualifying session on the old day keeps that day's tick.
    const other = { id: 'gym2', startAt: instantOf(oldDay, 18 * 60, ZONE), endAt: instantOf(oldDay, 19 * 60, ZONE), day: oldDay, type: 0, minutes: 45, hidden: false };
    const two = applyAll(state, [{ type: 'IMPORT_BODY', batch: { workouts: [other] } }], reducer);
    const kept = applyAll(two, [{ type: 'IMPORT_BODY', batch: { workouts: [moved], window: narrow } }, ...autoTickActions(two, { workouts: [moved], window: narrow }, ctx)], reducer);
    assert.deepEqual(kept.entries.map((e) => e.day).sort(), [oldDay, TODAY].sort());
  });

  it('a complete read replaces a heart day; a partial read only fills in', () => {
    const stored = { ...EMPTY_BODY, heart: [{ day: TODAY, restingBpm: 55, minBpm: 50, avgBpm: 70, maxBpm: 140 }] };
    // Both heart reads give one row each for the day; they are folded into one.
    const complete = mergeBody(stored, { heart: [{ day: TODAY, minBpm: 52, avgBpm: 72, maxBpm: 150 }, { day: TODAY, restingBpm: 56 }], window });
    assert.deepEqual(complete.heart, [{ day: TODAY, minBpm: 52, avgBpm: 72, maxBpm: 150, restingBpm: 56 }]);
    // Resting value deleted upstream: a complete read without it drops it.
    const dropped = mergeBody(stored, { heart: [{ day: TODAY, minBpm: 52, avgBpm: 72, maxBpm: 150 }], window });
    assert.deepEqual(dropped.heart, [{ day: TODAY, minBpm: 52, avgBpm: 72, maxBpm: 150 }]);
    // Partial read: the resting value from before survives.
    const partial = mergeBody(stored, { heart: [{ day: TODAY, minBpm: 52, avgBpm: 72, maxBpm: 150 }] });
    assert.deepEqual(partial.heart, [{ day: TODAY, restingBpm: 55, minBpm: 52, avgBpm: 72, maxBpm: 150 }]);
    // Unchanged data returns the same object.
    assert.equal(mergeBody(complete, { heart: [{ day: TODAY, minBpm: 52, avgBpm: 72, maxBpm: 150 }, { day: TODAY, restingBpm: 56 }], window }), complete);
  });

  it('keeps only sane sync metadata from a file', () => {
    const odd = normalizeBody({ sync: { lastSyncAt: 'yesterday', lastError: 'x'.repeat(5000), granted: ['Steps', 'Nope'], background: 'yes' } });
    assert.equal(odd.sync.lastSyncAt, undefined);
    assert.equal(odd.sync.lastError!.length, 500);
    assert.deepEqual(odd.sync.granted, ['Steps']);
    assert.equal(odd.sync.background, false);
    assert.equal(normalizeBody({ sync: { lastSyncAt: Number.POSITIVE_INFINITY } }).sync.lastSyncAt, undefined);
    assert.equal(normalizeBody({ sync: { lastSyncAt: 9e15 } }).sync.lastSyncAt, undefined);
    assert.equal(normalizeBody({ sync: { lastSyncAt: NOW, lastError: '' } }).sync.lastSyncAt, NOW);
    assert.equal(normalizeBody({ sync: { lastError: '' } }).sync.lastError, undefined);
  });
});

describe('monthly quota in short months', () => {
  it('asks for at most the days the month has', () => {
    assert.equal(periodQuota({ cadence: 'MONTHLY', timesPerPeriod: 31 }, '2026-02-10'), 28);
    assert.equal(periodQuota({ cadence: 'MONTHLY', timesPerPeriod: 31 }, '2026-03-10'), 31);
    assert.equal(periodQuota({ cadence: 'MONTHLY', timesPerPeriod: 10 }, '2026-02-10'), 10);
    assert.equal(periodQuota({ cadence: 'WEEKLY', timesPerPeriod: 7 }, '2026-02-10'), 7);
    assert.equal(periodQuota({ cadence: 'DAILY', timesPerPeriod: 1 }, '2026-02-10'), 1);
  });

  it('a "31 days a month" rhythm is met by doing every day of February', () => {
    const rule = { habitId: 'h', effectiveFrom: '2026-01-01', cadence: 'MONTHLY' as const, timesPerPeriod: 31, target: 1, freezesPerMonth: 0 };
    const result = evaluateStreak({
      rules: [rule],
      createdDay: '2026-01-01',
      today: '2026-03-01',
      valueOf: (day) => (day.startsWith('2026-02') ? 1 : 0),
    });
    const feb = result.periods.find((p) => p.start === '2026-02-01')!;
    assert.equal(feb.status, 'MET');
    const jan = result.periods.find((p) => p.start === '2026-01-01')!;
    assert.notEqual(jan.status, 'MET');
  });

  it('the Today card counts against the capped quota', () => {
    let state = buildEmptyState('2026-02-10');
    const built = habitFromPreset(PRESET_BY_ID['meditate']!, 'h-med', '2026-01-01');
    state = reducer(state, { type: 'ADD_HABIT', ...built });
    state = reducer(state, { type: 'SET_RULE', rule: { habitId: 'h-med', effectiveFrom: '2026-01-01', cadence: 'MONTHLY', timesPerPeriod: 31, target: 1, freezesPerMonth: 0 } });
    const view = habitView(state, state.habits.find((h) => h.id === 'h-med')!, '2026-02-10');
    assert.equal(view.periodQuota, 28);
  });
});
