/// <reference types="node" />
/**
 * Council round 7 regressions: responses forged through a push-shaped launch intent, instants and
 * days an import file can carry that no formatter can place, unknown fields riding along with
 * imported rows, a single-drink ceiling shared by every path, the headless mutex, the live-store
 * handoff, a body-sync patch that changes nothing, and snack ownership shared by count and undo.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseState, StorageError } from '../src/data/store';
import { MAX_WATER_LOG_ML, projectRecords, sanitizePeriodHistory, sanitizeSettings, validateRecords, ValidationError } from '../src/data/validate';
import { snackCountsFor } from '../src/domain/habits/snackMatch';
import type { Habit, MovementSnack } from '../src/domain/models';
import { instantOf, isCalendarDay, isInstantMs, MAX_INSTANT_MS } from '../src/domain/time/trackingDay';
import { withHeadlessLock } from '../src/services/headlessLock';
import { isOwnTrigger, parseResponse } from '../src/services/notificationPayload';
import { applyAll, parsePayload, type CommandContext, type NudgePayload } from '../src/state/commands';
import { liveStore, setLiveStore, type LiveStore } from '../src/state/liveStore';
import { reducer } from '../src/state/reducer';
import { buildSampleState } from '../src/state/seed';
import { habitView } from '../src/state/selectors';
import type { TrackerState } from '../src/state/types';

const ZONE = 'America/New_York';
const TODAY = '2026-10-25';
const NOW = instantOf(TODAY, 15 * 60, ZONE);
let seq = 0;
const ctx: CommandContext = { nowMs: NOW, zone: ZONE, today: TODAY, newId: () => `r7-${++seq}` };

const sample = () => buildSampleState(TODAY, ZONE, NOW);
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

describe('forged notification responses', () => {
  const payload: NudgePayload = { nudgeId: 'rot:2026-10-25:900', kind: 'ROTATION', habitIds: ['h-1'], day: TODAY };
  const response = (trigger: unknown) => ({ actionIdentifier: 'DONE', notification: { date: 1, request: { identifier: payload.nudgeId, content: { data: payload }, trigger } } });

  it('acts only on date-triggered (our own) notifications; a push-shaped one is dropped', () => {
    assert.ok(isOwnTrigger(undefined));
    assert.ok(isOwnTrigger({ type: 'date', repeats: false, value: NOW, channelId: 'nudges' }));
    assert.equal(isOwnTrigger({ type: 'push' }), false);
    assert.equal(isOwnTrigger('push'), false);
    assert.ok(parseResponse(response(undefined)));
    assert.ok(parseResponse(response({ type: 'date', value: NOW })));
    assert.equal(parseResponse(response({ type: 'push', remoteMessage: { data: {} } })), null);
    assert.equal(parseResponse(response({ type: 'timeInterval', seconds: 1 })), null);
  });

  it('a timer-bell payload must describe a session the formatters can place', () => {
    const bell = { nudgeId: 'mind-end', kind: 'MIND_END', habitIds: [], day: '' };
    assert.deepEqual(parsePayload({ ...bell, mind: { kind: 'MEDITATION', minutes: 13, startAt: NOW } })!.mind, { kind: 'MEDITATION', minutes: 13, startAt: NOW });
    assert.equal(parsePayload({ ...bell, mind: { kind: 'MEDITATION', minutes: 13, startAt: 1e300 } })!.mind, undefined);
    assert.equal(parsePayload({ ...bell, mind: { kind: 'MEDITATION', minutes: 13, startAt: -5 } })!.mind, undefined);
    assert.equal(parsePayload({ ...bell, mind: { kind: 'MEDITATION', minutes: 2, startAt: MAX_INSTANT_MS - 60_000 } })!.mind, undefined);
  });
});

describe('instants and days from outside', () => {
  it('isInstantMs and isCalendarDay accept only what Date and Intl can represent', () => {
    assert.ok(isInstantMs(0));
    assert.ok(isInstantMs(NOW));
    assert.ok(isInstantMs(MAX_INSTANT_MS));
    assert.equal(isInstantMs(MAX_INSTANT_MS + 1), false);
    assert.equal(isInstantMs(1e300), false);
    assert.equal(isInstantMs(-1), false);
    assert.equal(isInstantMs(Number.NaN), false);
    assert.equal(isInstantMs('1'), false);
    assert.ok(isCalendarDay('2026-02-28'));
    assert.ok(isCalendarDay('2024-02-29'));
    assert.equal(isCalendarDay('2026-02-30'), false);
    assert.equal(isCalendarDay('2026-99-99'), false);
    assert.equal(isCalendarDay('2026-00-10'), false);
    assert.equal(isCalendarDay('1969-12-31'), false);
    assert.equal(isCalendarDay('2026-1-5'), false);
    assert.equal(isCalendarDay(20260101), false);
  });

  it('an import with a finite but unplaceable timestamp or a non-date day is refused, naming the field', () => {
    const state = sample();
    const entry = { id: 'e-x', habitId: state.habits[0]!.id, day: TODAY, at: NOW, zone: ZONE, value: 1, source: 'MANUAL' as const };
    assert.throws(() => validateRecords({ ...state, entries: [{ ...entry, at: 1e300 }] }), (err: unknown) => err instanceof ValidationError && /entries\[0\]\.at/.test(err.message));
    assert.throws(() => validateRecords({ ...state, entries: [{ ...entry, day: '2026-02-30' }] }), (err: unknown) => err instanceof ValidationError && /entries\[0\]\.day/.test(err.message));
    assert.throws(() => validateRecords({ ...state, nudgeSnoozedUntil: 1e300 }), (err: unknown) => err instanceof ValidationError && /nudgeSnoozedUntil/.test(err.message));
    const session = { id: 'm-x', startAt: NOW, endAt: NOW - 60_000, zone: ZONE, day: TODAY, kind: 'MEDITATION' as const, minutes: 1 };
    assert.throws(() => validateRecords({ ...state, mind: [session] }), (err: unknown) => err instanceof ValidationError && /mind\[0\]\.endAt/.test(err.message));
    assert.throws(() => validateRecords({ ...state, body: { ...state.body, workouts: [{ id: 'w', startAt: NOW, endAt: NOW - 1, day: TODAY, type: 1, minutes: 1 }] } }), ValidationError);
    assert.doesNotThrow(() => validateRecords({ ...state, mind: [{ ...session, endAt: NOW }] }));
  });

  it('settings and period history drop unplaceable values instead of carrying them', () => {
    assert.equal(sanitizeSettings({ offUntil: 1e300 }).offUntil, undefined);
    assert.equal(sanitizeSettings({ offUntil: NOW }).offUntil, NOW);
    assert.deepEqual(sanitizePeriodHistory([{ start: '2026-02-30' }, { start: '2026-02-01', end: '2026-01-20' }, { start: '2026-03-01', end: '2026-03-05' }]), [
      { start: '2026-02-01' },
      { start: '2026-03-01', end: '2026-03-05' },
    ]);
  });
});

describe('imported rows carry only known fields', () => {
  it('projectRecords strips unknown keys from every list (and nested junk with them)', () => {
    const state = clone(sample());
    let deep: unknown[] = [];
    for (let i = 0; i < 2_000; i++) deep = [deep];
    (state.habits[0] as unknown as Record<string, unknown>).legacyField = deep;
    (state.water[0] as unknown as Record<string, unknown>).__proto__ = { polluted: true };
    (state.cycleLogs as unknown[]).push({ day: '2026-10-20', flow: 2, symptoms: { cramps: 2, extra: 1 }, unknown: 'x' });
    validateRecords(state);
    const out = projectRecords(state);
    assert.equal('legacyField' in (out.habits[0] as object), false);
    assert.equal(Object.keys(out.habits[0]!).includes('legacyField'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(out.water[0], '__proto__'), false);
    const log = out.cycleLogs.find((l) => l.day === '2026-10-20')!;
    assert.deepEqual(log, { day: '2026-10-20', flow: 2, symptoms: { cramps: 2, extra: 1 } });
    // The known fields are untouched, lists keep their length, and the result serialises.
    assert.equal(out.habits.length, state.habits.length);
    assert.equal(out.habits[0]!.id, state.habits[0]!.id);
    assert.ok(JSON.stringify(out).length < JSON.stringify(state).length);
  });

  it('parseState hands the reducer a projected state', () => {
    const raw = clone(sample()) as unknown as Record<string, unknown>;
    (raw.entries as Record<string, unknown>[])[0]!.someday = 'maybe';
    const parsed = parseState(raw);
    assert.equal('someday' in (parsed.entries[0] as object), false);
    assert.throws(() => parseState({ ...raw, entries: [{ ...(raw.entries as object[])[0], at: 1e300 }] }), StorageError);
  });
});

describe('one drink ceiling', () => {
  it('the notification button, the sheets and the import agree on the largest drink', () => {
    assert.equal(MAX_WATER_LOG_ML, 20_000);
    const base: NudgePayload = { nudgeId: 'wat:1', kind: 'WATER', habitIds: [], day: TODAY };
    assert.equal(parsePayload({ ...base, waterMl: MAX_WATER_LOG_ML })!.waterMl, MAX_WATER_LOG_ML);
    assert.equal(parsePayload({ ...base, waterMl: MAX_WATER_LOG_ML + 1 })!.waterMl, undefined);
  });
});

describe('headless mutex', () => {
  it('runs jobs one after another, in order, and keeps going after a failure', async () => {
    const log: string[] = [];
    const slow = withHeadlessLock(async () => {
      log.push('a:start');
      await new Promise((r) => setTimeout(r, 20));
      log.push('a:end');
      return 'a';
    });
    const failing = withHeadlessLock(async () => {
      log.push('b');
      throw new Error('boom');
    });
    const last = withHeadlessLock(async () => {
      log.push('c');
      return 'c';
    });
    assert.equal(await slow, 'a');
    await assert.rejects(failing, /boom/);
    assert.equal(await last, 'c');
    assert.deepEqual(log, ['a:start', 'a:end', 'b', 'c']);
  });
});

describe('live store handoff', () => {
  it('is absent until the app registers one, and the registered one receives the commands', async () => {
    assert.equal(liveStore(), null);
    let state = sample();
    const applied: number[] = [];
    const store: LiveStore = {
      current: () => state,
      committed: () => state,
      replaceSeq: () => 0,
      replacePending: () => false,
      alive: () => true,
      apply: async (build) => {
        const actions = build(state);
        const next = applyAll(state, actions, reducer);
        const changed = next !== state;
        state = next;
        applied.push(actions.length);
        return { next, applied: changed, persisted: true };
      },
    };
    setLiveStore(store);
    try {
      assert.equal(liveStore(), store);
      const before = state.water.length;
      const result = await liveStore()!.apply((s) => [{ type: 'ADD_WATER', entry: { id: 'lw', at: NOW, zone: ZONE, day: TODAY, ml: 250, source: 'MANUAL' } }].filter(() => s.water.length === before) as never);
      assert.equal(result.applied, true);
      assert.equal(state.water.length, before + 1);
      assert.deepEqual(applied, [1]);
    } finally {
      setLiveStore(null);
    }
    assert.equal(liveStore(), null);
  });
});

describe('body sync patches', () => {
  it('a patch that changes nothing returns the same state (no write every three hours)', () => {
    const state = reducer(sample(), { type: 'BODY_SYNC', patch: { granted: ['Steps'], background: true, lastError: 'Health Connect is not available.' } });
    assert.equal(reducer(state, { type: 'BODY_SYNC', patch: { lastError: 'Health Connect is not available.' } }), state);
    assert.equal(reducer(state, { type: 'BODY_SYNC', patch: { granted: ['Steps'] } }), state);
    assert.notEqual(reducer(state, { type: 'BODY_SYNC', patch: { lastError: undefined } }), state);
    assert.notEqual(reducer(state, { type: 'BODY_SYNC', patch: { granted: ['Steps', 'SleepSession'] } }), state);
    assert.equal(reducer(state, { type: 'BODY_SYNC', patch: { lastError: undefined } }).body.sync.lastError, undefined);
  });
});

describe('snack ownership', () => {
  const movement = { presetId: 'squat-snack', snackType: 'SQUATS' } as Pick<Habit, 'presetId' | 'snackType'>;
  const shield = { presetId: 'sugar-shield', snackType: 'SQUATS' } as Pick<Habit, 'presetId' | 'snackType'>;
  const snack = (type: MovementSnack['type'], trigger: MovementSnack['trigger']): Pick<MovementSnack, 'type' | 'trigger'> => ({ type, trigger });

  it('a movement habit owns its type outside Sugar Shield rounds; the shield owns every shield round', () => {
    assert.ok(snackCountsFor(movement, snack('SQUATS', 'NUDGE')));
    assert.ok(snackCountsFor(movement, snack('SQUATS', 'WIDGET')));
    assert.equal(snackCountsFor(movement, snack('SQUATS', 'SUGAR_SHIELD')), false);
    assert.equal(snackCountsFor(movement, snack('WALK', 'NUDGE')), false);
    assert.ok(snackCountsFor(shield, snack('WALK', 'SUGAR_SHIELD')));
    assert.equal(snackCountsFor(shield, snack('SQUATS', 'MANUAL')), false);
    assert.equal(snackCountsFor({ presetId: 'water', snackType: undefined }, snack('SQUATS', 'NUDGE')), false);
  });

  it('undo removes exactly what the count included', () => {
    let state: TrackerState = sample();
    const habit = state.habits.find((h) => h.snackType === 'SQUATS' && h.presetId !== 'sugar-shield')!;
    const start = habitView(state, habit, TODAY).todayValue;
    const shieldRow: MovementSnack = { id: 'sh', at: NOW + 1, zone: ZONE, day: TODAY, type: 'SQUATS', reps: 10, trigger: 'SUGAR_SHIELD' };
    const own: MovementSnack = { id: 'own', at: NOW, zone: ZONE, day: TODAY, type: 'SQUATS', reps: 10, trigger: 'MANUAL' };
    state = applyAll(state, [{ type: 'LOG_SNACK', snack: own }, { type: 'LOG_SNACK', snack: shieldRow }], reducer);
    assert.equal(habitView(state, habit, TODAY).todayValue, start + 1);
    state = reducer(state, { type: 'UNDO_SNACK', day: TODAY, habit });
    assert.equal(habitView(state, habit, TODAY).todayValue, start);
    assert.ok(state.snacks.some((s) => s.id === 'sh'), 'the newer Sugar Shield row is not the habit\'s to undo');
    assert.equal(state.snacks.some((s) => s.id === 'own'), false);
    const cleared = reducer(state, { type: 'CLEAR_DAY', habit, day: TODAY });
    assert.ok(cleared.snacks.some((s) => s.id === 'sh'));
    void ctx;
  });
});
