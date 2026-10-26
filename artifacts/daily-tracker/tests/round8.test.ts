/// <reference types="node" />
/**
 * Council round 8 regressions: damaged containers in a backup file, cycle reminders under birth
 * control and before a period is logged, a future-dated period start, mean symptom burden, a
 * weekly habit's "done today", the week summary's quotas, the widget's rotation tap, a drink
 * logged by hand after its import, one night counted once across sources, the rolling sync
 * window and the per-type backfill.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseState, StorageError } from '../src/data/store';
import { distinctSleep, distinctWorkouts, countedWorkouts, sleepByDay, workoutsThisWeek } from '../src/domain/body/stats';
import { EXERCISE_TYPE } from '../src/domain/body/exerciseTypes';

/** Health Connect exercise type constants not named in exerciseTypes.ts (running, yoga). */
const RUNNING = 56;
const YOGA = 83;
import { EMPTY_BODY, type BodyBatch, type SleepNight, type Workout } from '../src/domain/body/types';
import { cycleAlerts } from '../src/domain/cycle/alerts';
import { MIN_LOGGED_DAYS_PER_CYCLE, symptomBurden } from '../src/domain/cycle/insights';
import { isOvulationBased, nextFire, upcomingReminders } from '../src/domain/cycle/reminders';
import { buildTimeline, historyUpTo, predictCycle } from '../src/domain/cycle/timeline';
import type { CycleDayLog, CycleReminder } from '../src/domain/models';
import { addDays, instantOf } from '../src/domain/time/trackingDay';
import { PRESET_BY_ID } from '../src/library/presets';
import { autoTickActions } from '../src/state/bodyCommands';
import { applyAll, widgetTapActions, type CommandContext } from '../src/state/commands';
import { reducer } from '../src/state/reducer';
import { buildEmptyState, buildSampleState, habitFromPreset } from '../src/state/seed';
import { cycleReminderFires, habitView, planInputFor, rotationHabit, streakUnit, weekSummaryText } from '../src/state/selectors';
import type { TrackerState } from '../src/state/types';

const ZONE = 'America/New_York';
const TODAY = '2026-10-25';
const NOW = instantOf(TODAY, 15 * 60, ZONE);
let seq = 0;
const ctx: CommandContext = { nowMs: NOW, zone: ZONE, today: TODAY, newId: () => `r8-${++seq}` };
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

describe('damaged containers in a backup file', () => {
  const sample = () => clone(buildSampleState(TODAY, ZONE, NOW));

  it('a list that is present but not a list is a damaged file, not an empty list', () => {
    for (const key of ['nudgeEvents', 'events', 'cycleLogs'] as const) {
      const raw = { ...sample(), [key]: { 0: 'x' } };
      assert.throws(() => parseState(raw), StorageError, key);
    }
    assert.throws(() => parseState({ ...sample(), body: [] }), StorageError, 'body as a list');
    assert.throws(() => parseState({ ...sample(), body: { ...EMPTY_BODY, sleep: 'none' } }), StorageError, 'body.sleep as a string');
    assert.throws(() => parseState({ ...sample(), cycleLogs: [{ symptoms: {} }] }), StorageError, 'a day log without a day');
  });

  it('absent lists still read as empty (older files)', () => {
    const raw = sample() as Partial<TrackerState>;
    delete raw.nudgeEvents;
    delete raw.events;
    delete raw.cycleLogs;
    delete raw.body;
    const state = parseState(raw);
    assert.deepEqual([state.nudgeEvents, state.events, state.cycleLogs], [[], [], []]);
    assert.deepEqual(state.body, EMPTY_BODY);
  });
});

describe('cycle reminders', () => {
  const RULES = { avgCycleDays: 28, periodDays: 5, lutealDays: 14 };
  const history = [{ start: '2026-08-02', end: '2026-08-06' }, { start: '2026-08-30', end: '2026-09-03' }, { start: '2026-09-28', end: '2026-10-02' }];
  const prediction = predictCycle(history, RULES, '2026-10-10')!;
  const fertile: CycleReminder = { id: 'f', label: 'Fertile window', anchor: 'PHASE_START', phase: 'fertile', offsetDays: 0, minute: 9 * 60, enabled: true };
  const luteal: CycleReminder = { id: 'l', label: 'Luteal', anchor: 'PHASE_START', phase: 'luteal', offsetDays: 0, minute: 9 * 60, enabled: true };
  const periodDay3: CycleReminder = { id: 'p3', label: 'Iron', anchor: 'PHASE_START', phase: 'period', offsetDays: 2, minute: 9 * 60, enabled: true };
  const vitaminC: CycleReminder = { id: 'c', label: 'Vitamin C', anchor: 'BEFORE_PERIOD', offsetDays: 5, minute: 9 * 60, enabled: true };

  it('hormonal birth control pauses the rules that count from ovulation, not the period ones', () => {
    assert.ok(isOvulationBased(fertile));
    assert.ok(isOvulationBased(luteal));
    assert.equal(isOvulationBased(periodDay3), false);
    assert.equal(isOvulationBased(vitaminC), false);
    assert.ok(nextFire(fertile, prediction, '2026-10-10'));
    assert.equal(nextFire(fertile, prediction, '2026-10-10', { birthControl: true }), null);
    assert.equal(nextFire(luteal, prediction, '2026-10-10', { birthControl: true }), null);
    assert.deepEqual(nextFire(vitaminC, prediction, '2026-10-10', { birthControl: true }), { day: '2026-10-21', confirmed: true });
    assert.deepEqual(
      upcomingReminders([fertile, luteal, periodDay3, vitaminC], prediction, '2026-10-10', { birthControl: true }).map((f) => f.reminder.id),
      ['c', 'p3'],
    );
  });

  it('a period-day rule counts from the logged start while that day is ahead, else from the predicted one — unconfirmed', () => {
    // Day 3 of the period that started 09-28 is 09-30: ahead on 09-29, confirmed.
    assert.deepEqual(nextFire(periodDay3, predictCycle(history, RULES, '2026-09-29')!, '2026-09-29'), { day: '2026-09-30', confirmed: true });
    // Past it: day 3 of the *predicted* next period (10-26 + 2), shown but not confirmed.
    assert.deepEqual(nextFire(periodDay3, prediction, '2026-10-10'), { day: '2026-10-28', confirmed: false });
  });

  it('only confirmed fires reach the planner; the speculative one still shows on the Cycle tab', () => {
    let s = buildEmptyState('2026-10-10');
    s = reducer(s, { type: 'UPDATE_SETTINGS', patch: { cycleEnabled: true, cycle: { ...s.settings.cycle, reminders: [periodDay3, vitaminC] } } });
    for (const p of history) s = reducer(s, { type: 'PERIOD_START', day: p.start, today: '2026-10-10' });
    const fires = cycleReminderFires(s, '2026-10-10');
    assert.deepEqual(
      fires.map((f) => [f.reminder.id, f.day, f.confirmed]),
      [
        ['c', '2026-10-21', true],
        ['p3', '2026-10-28', false],
      ],
    );
    const input = planInputFor(s, '2026-10-10', instantOf('2026-10-10', 7 * 60, ZONE), ZONE);
    assert.deepEqual(
      input.cycleReminders?.map((r) => r.id),
      ['c'],
      'a day counted from an unlogged period is never scheduled',
    );
  });

  it('a future-dated start is kept in the record, left out of predictions and flagged', () => {
    const withFuture = [...history, { start: '2026-11-20' }];
    assert.deepEqual(historyUpTo(withFuture, '2026-10-10').map((p) => p.start), history.map((p) => p.start));
    const t = buildTimeline(withFuture, RULES, '2026-10-10');
    assert.equal(t.prediction!.lastStart, '2026-09-28');
    assert.equal(t.prediction!.nextStart, '2026-10-26');
    assert.ok(t.periodContaining('2026-11-20'), 'the calendar still shows the logged (future) start so it can be removed');
    assert.equal(t.infoOn('2026-11-20')!.phase, 'menstrual');
    assert.ok(t.history.some((p) => p.start === '2026-11-20'));
    const alerts = cycleAlerts(withFuture, '2026-10-10');
    assert.equal(alerts[0]?.kind, 'future-start');
    assert.match(alerts[0]!.body, /2026-11-20/);
    assert.equal(cycleAlerts(history, '2026-10-10').some((a) => a.kind === 'future-start'), false);
    assert.equal(cycleAlerts(withFuture).some((a) => a.kind === 'future-start'), false, 'without a today there is no future');
  });

  it('day info says when a phase is estimated, separately from the predicted styling', () => {
    const t = buildTimeline(history, RULES, '2026-10-10');
    const logged = t.infoOn('2026-09-29')!;
    assert.deepEqual([logged.phase, logged.predicted, logged.estimated], ['menstrual', false, false]);
    for (const day of ['2026-10-03', '2026-10-10', '2026-10-13']) assert.equal(t.infoOn(day)!.estimated, true, `${day}: a phase between periods is always an estimate`);
    const next = t.infoOn('2026-10-27')!;
    assert.deepEqual([next.phase, next.predicted, next.estimated], ['menstrual', true, true]);
  });

  it('symptom burden is the mean severity per logged day, and needs three logged days in a cycle', () => {
    const cycles = [
      { start: '2026-08-02', nextStart: '2026-08-30' },
      { start: '2026-08-30', nextStart: '2026-09-28' },
    ];
    const log = (day: string, cramps: 1 | 2 | 3): CycleDayLog => ({ day, symptoms: { cramps } });
    // Cycle 1: five days logged at severity 1 (well logged, mild). Cycle 2: three days at 3 (badly off).
    const logs = [log('2026-08-02', 1), log('2026-08-03', 1), log('2026-08-04', 1), log('2026-08-05', 1), log('2026-08-06', 1), log('2026-08-30', 3), log('2026-08-31', 3), log('2026-09-01', 3)];
    const burden = symptomBurden(logs, cycles);
    assert.deepEqual(burden.get('cramps'), [1, 3], 'a sum would have called the well-logged mild cycle the worse one');
    assert.equal(MIN_LOGGED_DAYS_PER_CYCLE, 3);
    const sparse = symptomBurden(logs.slice(0, 7), cycles).get('cramps')!;
    assert.equal(sparse[0], 1);
    assert.ok(Number.isNaN(sparse[1]), 'two logged days say nothing about a cycle');
  });
});

describe('journey', () => {
  function withStrength(): { state: TrackerState; id: string } {
    let state = buildEmptyState(TODAY, undefined, { withWater: true });
    const { habit, rule, policy } = habitFromPreset(PRESET_BY_ID['strength-session']!, 'h-strength', addDays(TODAY, -40));
    state = reducer(state, { type: 'ADD_HABIT', habit, rule, policy });
    return { state, id: habit.id };
  }

  it('a weekly habit done earlier this week is not "done today"', () => {
    const { state, id } = withStrength();
    const habit = state.habits.find((h) => h.id === id)!;
    assert.equal(habit.type, 'YES_NO');
    const twoDaysAgo = addDays(TODAY, -2);
    const s1 = reducer(state, { type: 'ADD_ENTRY', entry: { id: 'e1', habitId: id, day: twoDaysAgo, at: instantOf(twoDaysAgo, 9 * 60, ZONE), zone: ZONE, value: 1, source: 'MANUAL' } });
    const v1 = habitView(s1, habit, TODAY);
    assert.equal(v1.doneToday, false);
    assert.equal(v1.dayRatio, 0);
    assert.equal(v1.periodDone, 1);
    const s2 = reducer(s1, { type: 'ADD_ENTRY', entry: { id: 'e2', habitId: id, day: TODAY, at: NOW, zone: ZONE, value: 1, source: 'MANUAL' } });
    const v2 = habitView(s2, habit, TODAY);
    assert.equal(v2.doneToday, true);
    assert.equal(v2.dayRatio, 1);
    assert.deepEqual([streakUnit('DAILY'), streakUnit('WEEKLY'), streakUnit('MONTHLY')], ['day', 'week', 'month']);
  });

  it('the week summary counts a weekly habit against its quota, not seven daily misses', () => {
    let state = buildEmptyState(TODAY);
    const { habit, rule, policy } = habitFromPreset(PRESET_BY_ID['strength-session']!, 'h-strength', addDays(TODAY, -40));
    state = reducer(state, { type: 'ADD_HABIT', habit, rule, policy });
    const twoDaysAgo = addDays(TODAY, -2);
    const s = reducer(state, { type: 'ADD_ENTRY', entry: { id: 'e1', habitId: habit.id, day: twoDaysAgo, at: instantOf(twoDaysAgo, 9 * 60, ZONE), zone: ZONE, value: 1, source: 'MANUAL' } });
    // Strength: 1 of its 2 sessions; the water habit (created today) adds one daily target, unmet.
    const text = weekSummaryText(s, TODAY).body;
    assert.match(text, /^1 of 3 targets hit \(33%\)/, text);
    const met = reducer(s, { type: 'ADD_WATER', entry: { id: 'w1', at: NOW, zone: ZONE, day: TODAY, ml: s.settings.waterGoalMl, source: 'MANUAL' } });
    assert.match(weekSummaryText(met, TODAY).body, /^2 of 3 targets hit \(67%\)/);
  });
});

describe('widget', () => {
  it('a rotation tap logs the snack that is up next in the state being written, whatever the tile showed', () => {
    const state = buildSampleState(TODAY, ZONE, NOW);
    const first = rotationHabit(state, TODAY)!;
    const stale = state.habits.find((h) => h.snackType && h.id !== first.id)!;
    const actions = widgetTapActions(state, stale.id, ctx, 'rotation');
    assert.equal(actions.length, 1);
    assert.equal(actions[0]!.type, 'LOG_SNACK');
    assert.equal((actions[0] as { snack: { type: string } }).snack.type, first.snackType);
    const after = applyAll(state, actions, reducer);
    const second = rotationHabit(after, TODAY)!;
    const again = widgetTapActions(after, stale.id, ctx, 'rotation');
    assert.equal((again[0] as { snack: { type: string } }).snack.type, second.snackType, 'two quick taps log two different snacks');
    assert.notEqual(second.id, first.id);
    // A plain tile tap still logs the habit the tile named.
    const plain = widgetTapActions(state, stale.id, ctx, 'habit');
    assert.equal((plain[0] as { snack: { type: string } }).snack.type, stale.snackType);
  });
});

describe('health: a drink logged by hand after its import', () => {
  it('the imported copy goes on the next sync; unrelated drinks stay', () => {
    const state = buildEmptyState(TODAY, undefined, { withWater: true });
    const earlier = NOW - 2 * 60_000;
    const batch: BodyBatch = { hydration: [{ id: 'hc-1', at: earlier, ml: 250 }, { id: 'hc-2', at: NOW - 3 * 3600_000, ml: 330 }], window: { fromDay: addDays(TODAY, -6), toDay: TODAY } };
    const imported = applyAll(state, autoTickActions(state, batch, ctx), reducer);
    assert.deepEqual(imported.water.map((w) => [w.ml, w.source]).sort(), [[250, 'AUTO_HC'], [330, 'AUTO_HC']]);
    // A glass tapped in the app two minutes after the other app's entry: the same drink.
    const tapped = reducer(imported, { type: 'ADD_WATER', entry: { id: 'm1', at: NOW, zone: ZONE, day: TODAY, ml: 250, source: 'MANUAL' } });
    assert.equal(tapped.water.reduce((a, w) => a + w.ml, 0), 830, 'until the next sync both stand');
    const resynced = applyAll(tapped, autoTickActions(tapped, batch, ctx), reducer);
    assert.deepEqual(
      resynced.water.map((w) => [w.ml, w.source]).sort(),
      [
        [250, 'MANUAL'],
        [330, 'AUTO_HC'],
      ],
    );
    // And it stays that way: the import is not brought back by the sync after that.
    const again = applyAll(resynced, autoTickActions(resynced, batch, ctx), reducer);
    assert.equal(again.water.length, 2);
  });

  it('a different amount or a drink more than five minutes away is a second drink', () => {
    const state = buildEmptyState(TODAY, undefined, { withWater: true });
    const batch: BodyBatch = { hydration: [{ id: 'hc-1', at: NOW - 2 * 60_000, ml: 250 }], window: { fromDay: addDays(TODAY, -6), toDay: TODAY } };
    const imported = applyAll(state, autoTickActions(state, batch, ctx), reducer);
    const bigger = reducer(imported, { type: 'ADD_WATER', entry: { id: 'm1', at: NOW, zone: ZONE, day: TODAY, ml: 500, source: 'MANUAL' } });
    assert.equal(applyAll(bigger, autoTickActions(bigger, batch, ctx), reducer).water.length, 2);
    const later = reducer(imported, { type: 'ADD_WATER', entry: { id: 'm2', at: NOW + 10 * 60_000, zone: ZONE, day: TODAY, ml: 250, source: 'MANUAL' } });
    assert.equal(applyAll(later, autoTickActions(later, batch, ctx), reducer).water.length, 2);
  });
});

describe('health: one session counted once across sources', () => {
  const night = (id: string, startMin: number, endMin: number, extra: Partial<SleepNight> = {}): SleepNight => {
    const startAt = instantOf(addDays(TODAY, -1), startMin, ZONE);
    const endAt = instantOf(TODAY, endMin, ZONE);
    return { id, startAt, endAt, day: TODAY, minutes: Math.round((endAt - startAt) / 60_000), ...extra };
  };

  it('a phone and a watch reporting the same night give one night, the richer copy standing for both', () => {
    const phone = night('phone', 23 * 60, 7 * 60, { origin: 'com.sec.android.app.shealth' });
    const watch = night('watch', 23 * 60 + 10, 6 * 60 + 50, { origin: 'com.fitbit.FitbitMobile', deepMin: 90, remMin: 100, lightMin: 250 });
    const nap = { ...night('nap', 0, 0), startAt: instantOf(TODAY, 14 * 60, ZONE), endAt: instantOf(TODAY, 14 * 60 + 40, ZONE), minutes: 40 };
    const distinct = distinctSleep([phone, watch, nap]);
    assert.deepEqual(distinct.map((n) => n.id), ['watch', 'nap']);
    const body = { ...EMPTY_BODY, sleep: [phone, watch, nap] };
    assert.equal(sleepByDay(body).get(TODAY), watch.minutes + 40, 'not 8h + 7h40 + 40m');
  });

  it('two copies of one workout count once; back-to-back sessions stay two', () => {
    const at = (min: number) => instantOf(TODAY, min, ZONE);
    const w = (id: string, from: number, to: number, type: number, extra: Partial<Workout> = {}): Workout => ({ id, startAt: at(from), endAt: at(to), day: TODAY, type, minutes: to - from, hidden: false, ...extra });
    const strava = w('strava', 18 * 60, 18 * 60 + 45, EXERCISE_TYPE.STRENGTH_TRAINING, { title: 'Evening lift' });
    const watch = w('watch', 18 * 60 + 2, 18 * 60 + 44, 0);
    const run = w('run', 19 * 60, 19 * 60 + 30, RUNNING);
    const yoga = w('yoga', 18 * 60, 18 * 60 + 45, YOGA);
    assert.deepEqual(distinctWorkouts([strava, watch, run]).map((x) => x.id), ['strava', 'run']);
    assert.deepEqual(distinctWorkouts([watch, yoga]).map((x) => x.id), ['yoga'], 'a generic "Workout" matches any type');
    assert.deepEqual(distinctWorkouts([strava, yoga]).map((x) => x.id), ['strava', 'yoga'], 'different typed sessions at the same time are two');
    const body = { ...EMPTY_BODY, workouts: [strava, watch, run] };
    assert.equal(countedWorkouts(body).length, 2);
    assert.equal(workoutsThisWeek(body, TODAY).length, 2);
    // Hiding the copy that stands for both reveals the other (the person decides what counts).
    assert.deepEqual(countedWorkouts({ ...body, workouts: [{ ...strava, hidden: true }, watch, run] }).map((x) => x.id), ['watch', 'run']);
  });
});
