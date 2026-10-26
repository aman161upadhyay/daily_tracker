/// <reference types="node" />
/**
 * Council round 4 regressions: field-by-field notification payloads, a WATER
 * press on a slot that came back after its snooze, symptom severities from a
 * file, heart reads covering one permission, the prorated period quota shared
 * by streak and card, the water goal mirror from the editor side, and the
 * helpers behind the provider's single-writer store.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validateRecords, ValidationError, WATER_GOAL_MAX_ML, WATER_GOAL_MIN_ML } from '../src/data/validate';
import { mergeBody } from '../src/domain/body/merge';
import { EMPTY_BODY } from '../src/domain/body/types';
import { evaluateStreak, periodQuota, periodRequired } from '../src/domain/habits/streaks';
import { SNOOZE_MINUTES } from '../src/domain/nudges/planner';
import { addDays, instantOf } from '../src/domain/time/trackingDay';
import { PRESET_BY_ID } from '../src/library/presets';
import { parseResponse } from '../src/services/notificationPayload';
import { applyAll, isNudgePayload, nudgeResponseActions, parsePayload, type CommandContext, type NudgePayload } from '../src/state/commands';
import { bodyEpoch, bumpBodyEpoch } from '../src/state/epochs';
import { reducer } from '../src/state/reducer';
import { buildEmptyState, buildSampleState, habitFromPreset } from '../src/state/seed';
import { habitView, ruleFor } from '../src/state/selectors';
import type { TrackerState } from '../src/state/types';

const ZONE = 'America/New_York';
const TODAY = '2026-10-25';
const NOW = instantOf(TODAY, 15 * 60, ZONE);
let seq = 0;
const ctx: CommandContext = { nowMs: NOW, zone: ZONE, today: TODAY, newId: () => `r4-${++seq}` };
const sample = () => buildSampleState(TODAY, ZONE, NOW);

describe('notification payloads are checked field by field', () => {
  const good: NudgePayload = { nudgeId: 'rot:2026-10-25:900', kind: 'ROTATION', habitIds: ['h-1'], day: TODAY, snackType: 'SQUATS', waterMl: 250 };

  it('accepts what the planner writes, unchanged', () => {
    assert.deepEqual(parsePayload(good), good);
    assert.deepEqual(parsePayload({ ...good, mind: { kind: 'BREATHING', minutes: 5, startAt: NOW } }), { ...good, mind: { kind: 'BREATHING', minutes: 5, startAt: NOW } });
  });

  it('drops the press when a required field is wrong', () => {
    assert.equal(parsePayload({ ...good, kind: 'ANYTHING' }), null);
    assert.equal(parsePayload({ ...good, day: 'yesterday' }), null);
    assert.equal(parsePayload({ ...good, habitIds: [1, 2] }), null);
    assert.equal(parsePayload({ ...good, habitIds: 'h-1' }), null);
    assert.equal(parsePayload({ ...good, nudgeId: '' }), null);
    assert.equal(parsePayload({ ...good, habitIds: Array.from({ length: 51 }, (_, i) => `h-${i}`) }), null);
    assert.equal(isNudgePayload(null), false);
    assert.equal(isNudgePayload('rot'), false);
  });

  it('leaves out an optional field that is wrong instead of acting on it', () => {
    assert.equal(parsePayload({ ...good, waterMl: -5 })!.waterMl, undefined);
    assert.equal(parsePayload({ ...good, waterMl: 1e9 })!.waterMl, undefined);
    assert.equal(parsePayload({ ...good, waterMl: Number.NaN })!.waterMl, undefined);
    assert.equal(parsePayload({ ...good, waterMl: 250.5 })!.waterMl, undefined);
    // Prototype keys are not snack types.
    assert.equal(parsePayload({ ...good, snackType: 'constructor' })!.snackType, undefined);
    assert.equal(parsePayload({ ...good, snackType: 'toString' })!.snackType, undefined);
    assert.equal(parsePayload({ ...good, mind: { kind: 'NAP', minutes: 5, startAt: NOW } })!.mind, undefined);
    assert.equal(parsePayload({ ...good, mind: { kind: 'BREATHING', minutes: 0, startAt: NOW } })!.mind, undefined);
  });

  it('a damaged optional still logs the tap size, never a negative drink', () => {
    const state = sample();
    const water = state.habits.find((h) => h.presetId === 'water')!;
    const raw = {
      actionIdentifier: 'WATER',
      notification: { date: 1, request: { identifier: 'water:x', content: { dataString: JSON.stringify({ nudgeId: 'water:2026-10-25:900', kind: 'WATER', habitIds: [water.id], day: TODAY, waterMl: -400 }) } } },
    };
    const parsed = parseResponse(raw)!;
    assert.equal(parsed.payload.waterMl, undefined);
    const next = applyAll(state, nudgeResponseActions(state, parsed.payload, 'WATER', ctx), reducer);
    const added = next.water.filter((w) => !state.water.some((o) => o.id === w.id));
    assert.equal(added.length, 1);
    assert.equal(added[0]!.ml, state.settings.tapSizeMl);
  });

  it('an oversized bundle is not ours', () => {
    const raw = { actionIdentifier: 'DONE', notification: { request: { identifier: 'x', content: { dataString: JSON.stringify({ ...good, habitIds: ['h-1'.padEnd(9_000, 'x')] }) } } } };
    assert.equal(parseResponse(raw), null);
  });
});

describe('WATER on a merged slot that came back after its snooze', () => {
  it('ignores the second copy of a press, but logs a new drink once the snooze ran out', () => {
    const state = sample();
    const water = state.habits.find((h) => h.presetId === 'water')!;
    const squats = state.habits.find((h) => h.snackType === 'SQUATS' && h.presetId !== 'sugar-shield')!;
    const merged: NudgePayload = { nudgeId: 'rot:2026-10-25:900', kind: 'ROTATION', habitIds: [squats.id, water.id], day: TODAY, snackType: 'SQUATS', waterMl: 250 };
    const once = applyAll(state, nudgeResponseActions(state, merged, 'WATER', ctx), reducer);
    assert.equal(once.water.length, state.water.length + 1);
    // Same press, delivered twice (headless task and the foreground listener): nothing.
    const soon = { ...ctx, nowMs: NOW + 60_000 };
    assert.deepEqual(nudgeResponseActions(once, merged, 'WATER', soon), []);
    // The snooze is over, the slot is on screen again with the same id: a new drink.
    const later = { ...ctx, nowMs: NOW + SNOOZE_MINUTES * 60_000 + 1_000 };
    const twice = applyAll(once, nudgeResponseActions(once, merged, 'WATER', later), reducer);
    assert.equal(twice.water.length, state.water.length + 2);
    // And that one's replay is ignored too.
    assert.deepEqual(nudgeResponseActions(twice, merged, 'WATER', { ...later, nowMs: later.nowMs + 1 }), []);
    assert.doesNotThrow(() => validateRecords(twice));
  });
});

describe('cycle day logs from a file', () => {
  const base = () => {
    const s = buildEmptyState(TODAY);
    return { ...s, cycleLogs: [{ day: TODAY, flow: 2, mood: 4, symptoms: { cramps: 1, headache: 3 } }] } as TrackerState;
  };

  it('accepts the shapes the day sheet writes', () => {
    assert.doesNotThrow(() => validateRecords(base()));
  });

  it('refuses severities, flows and moods the sheet cannot show', () => {
    const bad = (patch: object) => {
      const s = base();
      return { ...s, cycleLogs: [{ ...s.cycleLogs[0]!, ...patch }] };
    };
    assert.throws(() => validateRecords(bad({ symptoms: { cramps: 4 } })), ValidationError);
    assert.throws(() => validateRecords(bad({ symptoms: { cramps: 'severe' } })), ValidationError);
    assert.throws(() => validateRecords(bad({ symptoms: { cramps: 1.5 } })), ValidationError);
    assert.throws(() => validateRecords(bad({ symptoms: { ['x'.repeat(65)]: 1 } })), ValidationError);
    assert.throws(() => validateRecords(bad({ symptoms: [1, 2] })), ValidationError);
    assert.throws(() => validateRecords(bad({ flow: 4 })), ValidationError);
    assert.throws(() => validateRecords(bad({ mood: 0 })), ValidationError);
    assert.throws(() => validateRecords(bad({ mood: 6 })), ValidationError);
  });
});

describe('heart reads that cover one permission', () => {
  const window = { fromDay: addDays(TODAY, -2), toDay: TODAY };
  const stored = { ...EMPTY_BODY, heart: [{ day: TODAY, restingBpm: 55, minBpm: 50, avgBpm: 70, maxBpm: 140 }, { day: addDays(TODAY, -1), restingBpm: 57 }] };

  it('a complete samples-only read replaces the samples and keeps resting values', () => {
    const next = mergeBody(stored, { heart: [{ day: TODAY, minBpm: 52, avgBpm: 72, maxBpm: 150 }], heartSources: { samples: true, resting: false }, window });
    assert.deepEqual(
      next.heart.sort((a, b) => a.day.localeCompare(b.day)),
      [{ day: addDays(TODAY, -1), restingBpm: 57 }, { day: TODAY, minBpm: 52, avgBpm: 72, maxBpm: 150, restingBpm: 55 }],
    );
  });

  it('a complete resting-only read that returns nothing removes resting values and keeps the samples', () => {
    const next = mergeBody(stored, { heart: [], heartSources: { samples: false, resting: true }, window });
    assert.deepEqual(next.heart, [{ day: TODAY, minBpm: 50, avgBpm: 70, maxBpm: 140 }]);
  });

  it('a read covering both still replaces and removes whole days', () => {
    const next = mergeBody(stored, { heart: [{ day: TODAY, minBpm: 52, avgBpm: 72, maxBpm: 150 }], window });
    assert.deepEqual(next.heart, [{ day: TODAY, minBpm: 52, avgBpm: 72, maxBpm: 150 }]);
  });

  it('a read without a window never removes anything', () => {
    const next = mergeBody(stored, { heart: [], heartSources: { samples: true, resting: true } });
    assert.equal(next, stored);
  });
});

describe('the period quota is prorated the same way everywhere', () => {
  const rule = { habitId: 'h', effectiveFrom: '2026-10-01', cadence: 'WEEKLY' as const, timesPerPeriod: 4, target: 1, freezesPerMonth: 0 };

  it('a habit created on a Thursday owes two of its "four a week" in that week, and all four afterwards', () => {
    const thursday = '2026-10-22';
    assert.equal(periodQuota(rule, thursday), 4);
    assert.equal(periodRequired(rule, thursday, thursday), 2); // Thu–Sun: 4 days of 7 → round(4 × 4 / 7) = 2
    assert.equal(periodRequired(rule, '2026-10-28', thursday), 4);
    assert.equal(periodRequired(rule, '2026-10-18', thursday), 0); // the week before it existed
    assert.equal(periodRequired({ ...rule, cadence: 'DAILY' }, thursday, thursday), 1);
  });

  it('the streak and the card agree on the first, partial week', () => {
    const thursday = '2026-10-22';
    let state = buildEmptyState(TODAY);
    const habit = { id: 'h', name: 'Gym', category: 'movement' as const, type: 'YES_NO' as const, unit: '', icon: 'squat' as const, createdDay: thursday, archived: false, pinned: false };
    state = reducer(state, { type: 'ADD_HABIT', habit, rule: { ...rule, effectiveFrom: thursday }, policy: { habitId: 'h', kind: 'NONE', onlyWhenBehind: false, maxPerDay: 0, enabled: false } });
    for (const d of [thursday, '2026-10-24']) {
      state = reducer(state, { type: 'TOGGLE_ENTRY', entry: { id: `e-${d}`, habitId: 'h', day: d, at: instantOf(d, 12 * 60, ZONE), zone: ZONE, value: 1, source: 'MANUAL' } });
    }
    const view = habitView(state, habit, TODAY); // Sunday of that week
    assert.equal(view.periodDone, 2);
    assert.equal(view.periodQuota, 2);
    assert.equal(view.todayRatio, 1);
    const streak = evaluateStreak({ rules: [{ ...rule, effectiveFrom: thursday }], valueOf: (d) => (d === thursday || d === '2026-10-24' ? 1 : 0), createdDay: thursday, today: TODAY });
    assert.equal(streak.periods[0]!.required, 2);
    assert.equal(streak.periods[0]!.status, 'MET');
    assert.equal(streak.streak, 1);
  });
});

describe('the water goal is one number from either side', () => {
  it('the setting and the Water target share bounds the validator enforces', () => {
    assert.equal(WATER_GOAL_MIN_ML, 100);
    assert.equal(WATER_GOAL_MAX_ML, 20_000);
    const s = buildEmptyState(TODAY, undefined, { withWater: true });
    const water = s.habits.find((h) => h.presetId === 'water')!;
    const built = habitFromPreset(PRESET_BY_ID.water!, 'w2', TODAY);
    assert.equal(ruleFor(s, water.id, TODAY)!.target, s.settings.waterGoalMl);
    assert.equal(built.rule.target, s.settings.waterGoalMl);
  });
});

describe('epochs', () => {
  it('bump moves the counter the readers compare against', () => {
    const before = bodyEpoch();
    assert.equal(bumpBodyEpoch(), before + 1);
    assert.equal(bodyEpoch(), before + 1);
  });
});
