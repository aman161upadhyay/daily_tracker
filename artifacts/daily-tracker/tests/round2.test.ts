/// <reference types="node" />
/**
 * Council round 2 regressions: import bounds and duplicates, the EVENT "Did it"
 * branch, double-delivery of a notification press, the planner's slot cap,
 * per-day targets in the streak engine, Health Connect reconciliation of
 * upstream edits, tracking-day step totals, the water pace tolerance and the
 * export file name.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { exportFileName, randomFileTag } from '../src/data/transferFormat';
import { sanitizePeriodHistory, sanitizeSettings, validateRecords, ValidationError } from '../src/data/validate';
import { mergeBody } from '../src/domain/body/merge';
import { EMPTY_BODY, type BodyBatch } from '../src/domain/body/types';
import { evaluateStreak } from '../src/domain/habits/streaks';
import { planNudges } from '../src/domain/nudges/planner';
import { addDays, instantOf } from '../src/domain/time/trackingDay';
import { waterStatus } from '../src/domain/water/pace';
import { PRESET_BY_ID } from '../src/library/presets';
import { autoTickActions } from '../src/state/bodyCommands';
import { applyAll, nudgeResponseActions, type CommandContext, type NudgePayload } from '../src/state/commands';
import { reducer } from '../src/state/reducer';
import { buildEmptyState, buildSampleState, habitFromPreset } from '../src/state/seed';
import { planInputFor } from '../src/state/selectors';
import type { TrackerState } from '../src/state/types';

const ZONE = 'America/New_York';
const TODAY = '2026-10-25';
const NOW = instantOf(TODAY, 15 * 60, ZONE);
let seq = 0;
const ctx: CommandContext = { nowMs: NOW, zone: ZONE, today: TODAY, newId: () => `r2-${++seq}` };

const sample = () => buildSampleState(TODAY, ZONE, NOW);

function withHabits(ids: string[]): TrackerState {
  let state = buildEmptyState(TODAY, undefined, { withWater: true });
  for (const presetId of ids) {
    const built = habitFromPreset(PRESET_BY_ID[presetId]!, `h-${presetId}`, addDays(TODAY, -40));
    state = reducer(state, { type: 'ADD_HABIT', ...built });
  }
  return state;
}

describe('import bounds and duplicates', () => {
  it('rejects rules and policies with out-of-range numbers', () => {
    const state = sample();
    const rule = state.rules[0]!;
    assert.throws(() => validateRecords({ ...state, rules: [{ ...rule, target: -1 }] } as never), (e: unknown) => e instanceof ValidationError && /rules/.test(e.message));
    assert.throws(() => validateRecords({ ...state, rules: [{ ...rule, timesPerPeriod: 40 }] } as never), ValidationError);
    const policy = state.policies[0]!;
    assert.throws(() => validateRecords({ ...state, policies: [{ ...policy, intervalMin: 0 }] } as never), (e: unknown) => e instanceof ValidationError && /policies/.test(e.message));
    assert.throws(() => validateRecords({ ...state, policies: [{ ...policy, intervalMin: 2.5 }] } as never), ValidationError);
    assert.throws(() => validateRecords({ ...state, policies: [{ ...policy, maxPerDay: 500 }] } as never), ValidationError);
    assert.doesNotThrow(() => validateRecords(state));
  });

  it('rejects duplicate keys in every list', () => {
    const state = sample();
    const dupEntry = { ...state.entries[0]! };
    assert.throws(() => validateRecords({ ...state, entries: [...state.entries, dupEntry] } as never), (e: unknown) => e instanceof ValidationError && /entries/.test(e.message));
    const rule = state.rules[0]!;
    assert.throws(() => validateRecords({ ...state, rules: [...state.rules, { ...rule }] } as never), (e: unknown) => e instanceof ValidationError && /rules/.test(e.message));
    const policy = state.policies[0]!;
    assert.throws(() => validateRecords({ ...state, policies: [...state.policies, { ...policy }] } as never), (e: unknown) => e instanceof ValidationError && /policies/.test(e.message));
    const step = { day: TODAY, steps: 100 };
    assert.throws(() => validateRecords({ ...state, body: { ...state.body, steps: [step, { ...step }] } } as never), (e: unknown) => e instanceof ValidationError && /body\.steps/.test(e.message));
  });

  it('settings outside their ranges fall back to the default', () => {
    const out = sanitizeSettings({ nudgeIntervalMin: 1, dailyNudgeCap: 1000, waterGoalMl: 2500, dayBoundaryHour: 25, tapSizeMl: 250 });
    assert.equal(out.nudgeIntervalMin, undefined);
    assert.equal(out.dailyNudgeCap, undefined);
    assert.equal(out.dayBoundaryHour, undefined);
    assert.equal(out.waterGoalMl, 2500);
    assert.equal(out.tapSizeMl, 250);
    const nested = sanitizeSettings({ cycle: { avgCycleDays: 400, periodDays: 5 } });
    assert.equal(nested.cycle?.avgCycleDays, undefined);
    assert.equal(nested.cycle?.periodDays, 5);
  });

  it('an excluded period stays excluded through a round trip', () => {
    const spans = sanitizePeriodHistory([
      { start: '2026-08-01', end: '2026-08-05', excluded: true },
      { start: '2026-09-01', excluded: 'yes' },
      { start: 'nope' },
    ]);
    assert.deepEqual(spans, [{ start: '2026-08-01', end: '2026-08-05', excluded: true }, { start: '2026-09-01' }]);
  });
});

describe('notification presses that arrive twice', () => {
  it('"Did it" on a one-off event logs the walk, removes the event, and never completes the source habit', () => {
    let state = sample();
    // The walk-break habit stands in for whatever scheduled the event; a source habit must never be completed by it.
    const shield = state.habits.find((h) => h.presetId === 'walk-break')!;
    state = reducer(state, { type: 'SCHEDULE_EVENT', event: { id: 'ev1', habitId: shield.id, at: NOW - 60_000, zone: ZONE, day: TODAY, title: 'Walk', body: 'Two minutes' } });
    const payload: NudgePayload = { nudgeId: 'event:ev1', kind: 'EVENT', habitIds: [shield.id], day: TODAY, snackType: 'WALK' };
    const next = applyAll(state, nudgeResponseActions(state, payload, 'DONE', ctx), reducer);
    const added = next.snacks.filter((s) => !state.snacks.includes(s));
    assert.equal(added.length, 1);
    assert.equal(added[0]!.type, 'WALK');
    assert.equal(added[0]!.seconds, 120);
    assert.equal(next.events.some((e) => e.id === 'ev1'), false);
    assert.equal(next.entries.length, state.entries.length);
    // An unknown snack type in the payload falls back to a walk rather than crashing.
    const odd = applyAll(state, nudgeResponseActions(state, { ...payload, nudgeId: 'event:ev2', snackType: 'HANDSTAND' }, 'DONE', ctx), reducer);
    assert.equal(odd.snacks.filter((s) => !state.snacks.includes(s))[0]!.type, 'WALK');
  });

  it('a second delivery of the same press is a no-op once the event is in the ledger', () => {
    const state = sample();
    const squats = state.habits.find((h) => h.snackType === 'SQUATS' && h.presetId !== 'sugar-shield')!;
    const payload: NudgePayload = { nudgeId: 'rot:2026-10-25:900', kind: 'ROTATION', habitIds: [squats.id], day: TODAY, snackType: 'SQUATS' };
    const once = applyAll(state, nudgeResponseActions(state, payload, 'DONE', ctx), reducer);
    assert.equal(once.snacks.length, state.snacks.length + 1);
    assert.deepEqual(nudgeResponseActions(once, payload, 'DONE', ctx), []);
    const water = state.habits.find((h) => h.presetId === 'water')!;
    const drink: NudgePayload = { nudgeId: 'water:2026-10-25:900', kind: 'WATER', habitIds: [water.id], day: TODAY, waterMl: 250 };
    const drank = applyAll(state, nudgeResponseActions(state, drink, 'WATER', ctx), reducer);
    assert.deepEqual(nudgeResponseActions(drank, drink, 'WATER', ctx), []);
    assert.deepEqual(nudgeResponseActions(applyAll(state, nudgeResponseActions(state, payload, 'SWAP', ctx), reducer), payload, 'SWAP', ctx), []);
  });
});

describe('planner guards', () => {
  it('a one-minute interval with a wide window stays bounded', () => {
    let state = withHabits(['pushup-snack']);
    const policy = state.policies.find((p) => p.habitId === 'h-pushup-snack')!;
    state = reducer(state, { type: 'SET_POLICY', policy: { ...policy, kind: 'INTERVAL', intervalMin: 1, maxPerDay: 100, onlyWhenBehind: false, enabled: true } });
    state = reducer(state, { type: 'UPDATE_SETTINGS', patch: { activeStartMin: 0, activeEndMin: 24 * 60, dailyNudgeCap: 100 } });
    const plan = planNudges(planInputFor(state, TODAY, instantOf(TODAY, 0, ZONE), ZONE));
    assert.ok(plan.length > 0);
    assert.ok(plan.length <= 2_000, `planned ${plan.length} nudges`);
  });
});

describe('streaks judge each day by the rule in force that day', () => {
  it('a weekly target raised mid-week does not retroactively undo Monday', () => {
    const rules = [
      { habitId: 'h', effectiveFrom: '2026-10-01', cadence: 'WEEKLY' as const, timesPerPeriod: 3, target: 10, freezesPerMonth: 0 },
      { habitId: 'h', effectiveFrom: '2026-10-22', cadence: 'WEEKLY' as const, timesPerPeriod: 3, target: 50, freezesPerMonth: 0 },
    ];
    // Week of Mon 2026-10-19: 10 on Mon and Tue (old target), 50 on Thu (new target).
    const values: Record<string, number> = { '2026-10-19': 10, '2026-10-20': 10, '2026-10-22': 50 };
    const result = evaluateStreak({ rules, valueOf: (d) => values[d] ?? 0, createdDay: '2026-10-19', today: TODAY });
    const week = result.periods.find((p) => p.start === '2026-10-19')!;
    assert.equal(week.done, 3);
    assert.equal(week.status, 'MET');
  });
});

describe('Health Connect reconciliation', () => {
  const window = { fromDay: addDays(TODAY, -6), toDay: TODAY };

  it('drops a strength tick whose workout was deleted upstream, but only for a complete read', () => {
    const state = withHabits(['strength-session']);
    const gym = { id: 'gym', startAt: instantOf(addDays(TODAY, -2), 7 * 60, ZONE), endAt: instantOf(addDays(TODAY, -2), 8 * 60, ZONE), day: addDays(TODAY, -2), type: 0, minutes: 60, hidden: false };
    const ticked = applyAll(state, autoTickActions(state, { workouts: [gym], window }, ctx), reducer);
    assert.equal(ticked.entries.filter((e) => e.habitId === 'h-strength-session').length, 1);
    // Partial read (no window): nothing is removed.
    assert.deepEqual(autoTickActions(ticked, { workouts: [] }, ctx), []);
    // Complete read without the workout: the automatic tick goes.
    const gone = applyAll(ticked, autoTickActions(ticked, { workouts: [], window }, ctx), reducer);
    assert.equal(gone.entries.filter((e) => e.habitId === 'h-strength-session').length, 0);
    // A manual tick is never touched.
    const manual = reducer(ticked, { type: 'ADD_ENTRY', entry: { id: 'm', habitId: 'h-strength-session', day: addDays(TODAY, -1), at: NOW, zone: ZONE, value: 1, source: 'MANUAL' } });
    const after = applyAll(manual, autoTickActions(manual, { workouts: [], window }, ctx), reducer);
    assert.deepEqual(after.entries.filter((e) => e.habitId === 'h-strength-session').map((e) => e.id), ['m']);
  });

  it('a workout hidden in the app loses its tick on the next read', () => {
    let state = withHabits(['strength-session']);
    const gym = { id: 'gym', startAt: instantOf(TODAY, 7 * 60, ZONE), endAt: instantOf(TODAY, 8 * 60, ZONE), day: TODAY, type: 0, minutes: 60, hidden: false };
    state = applyAll(state, [{ type: 'IMPORT_BODY', batch: { workouts: [gym] } }, ...autoTickActions(state, { workouts: [gym] }, ctx)], reducer);
    assert.equal(state.entries.length, 1);
    state = reducer(state, { type: 'SET_WORKOUT_HIDDEN', id: 'gym', hidden: true });
    const next = applyAll(state, autoTickActions(state, { workouts: [gym], window }, ctx), reducer);
    assert.equal(next.entries.length, 0);
  });

  it('imported drinks follow upstream edits and deletions; the user’s own drinks do not', () => {
    let state = withHabits([]);
    const at = instantOf(TODAY, 9 * 60, ZONE);
    state = reducer(state, { type: 'ADD_WATER', entry: { id: 'mine', at, zone: ZONE, day: TODAY, ml: 300, source: 'MANUAL' } });
    const first: BodyBatch = { hydration: [{ id: 'hc-1', at: at + 3_600_000, ml: 250 }, { id: 'hc-2', at: at + 7_200_000, ml: 500 }], window };
    state = applyAll(state, autoTickActions(state, first, ctx), reducer);
    assert.equal(state.water.length, 3);
    // hc-1 edited to 400 ml, hc-2 deleted upstream.
    const second: BodyBatch = { hydration: [{ id: 'hc-1', at: at + 3_600_000, ml: 400 }], window };
    const next = applyAll(state, autoTickActions(state, second, ctx), reducer);
    assert.deepEqual(
      next.water.map((w) => [w.externalId ?? w.id, w.ml]).sort(),
      [
        ['hc-1', 400],
        ['mine', 300],
      ],
    );
    // Same read again: nothing to do.
    assert.deepEqual(autoTickActions(next, second, ctx), []);
    // Without the window, a missing drink is not treated as deleted.
    assert.deepEqual(autoTickActions(next, { hydration: [{ id: 'hc-1', at: at + 3_600_000, ml: 400 }] }, ctx), []);
  });

  it('the Steps habit prefers tracking-day totals when the read provides them', () => {
    const state = withHabits(['steps']);
    const batch: BodyBatch = { steps: [{ day: TODAY, steps: 8_000 }], habitSteps: [{ day: TODAY, steps: 7_400 }] };
    const next = applyAll(state, [{ type: 'IMPORT_BODY', batch }, ...autoTickActions(state, batch, ctx)], reducer);
    assert.equal(next.body.steps.find((s) => s.day === TODAY)?.steps, 8_000);
    assert.equal(next.entries.find((e) => e.habitId === 'h-steps' && e.day === TODAY)?.value, 7_400);
  });

  it('mergeBody prunes mirror rows inside a complete read’s window that the read no longer returned', () => {
    const old = addDays(TODAY, -20);
    const body = mergeBody(EMPTY_BODY, {
      steps: [{ day: old, steps: 1 }, { day: addDays(TODAY, -1), steps: 2 }, { day: TODAY, steps: 3 }],
      weight: [{ id: 'w-old', at: 1, day: old, kg: 80 }, { id: 'w-new', at: 2, day: TODAY, kg: 79 }],
    });
    const next = mergeBody(body, { steps: [{ day: TODAY, steps: 3 }], weight: [], window });
    assert.deepEqual(next.steps.map((s) => s.day).sort(), [old, TODAY]);
    assert.deepEqual(next.weight.map((w) => w.id), ['w-old']);
    // No window → nothing pruned; same data → same object.
    assert.equal(mergeBody(body, { steps: [{ day: TODAY, steps: 3 }] }), body);
  });
});

describe('small fixes', () => {
  it('the water card uses the planner’s tolerance (half a tap)', () => {
    const start = 9 * 60;
    const end = 21 * 60;
    const noon = 15 * 60;
    const goal = 2400;
    // Half-way through the day 1200 ml is expected; 1100 logged is on pace with a 250 ml tap, not with a 100 ml tap.
    assert.equal(waterStatus(1100, goal, noon, start, end, 250).onPace, true);
    assert.equal(waterStatus(1100, goal, noon, start, end, 100).onPace, false);
  });

  it('export file names carry an optional random tag', () => {
    const now = new Date('2026-10-25T12:00:00Z');
    assert.equal(exportFileName(now), 'daily-tracker-2026-10-25.json');
    assert.equal(exportFileName(now, 'k3f9'), 'daily-tracker-2026-10-25-k3f9.json');
    assert.equal(exportFileName(now, '../x'), 'daily-tracker-2026-10-25-x.json');
    const tag = randomFileTag(new Uint8Array([0, 35, 36, 255]));
    assert.match(tag, /^[a-z0-9]{4}$/);
    assert.equal(tag, '0z03');
  });
});
