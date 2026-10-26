/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { checkEnvelope, encryptBackup, toBase64, type EncryptedBackup } from '../src/data/backupCrypto';
import { hasUserData, shouldSnapshot } from '../src/data/backupPolicy';
import { DATA_VERSION, parseState, StorageError } from '../src/data/store';
import { sanitizeSettings, validateRecords, ValidationError } from '../src/data/validate';
import { DEFAULT_SETTINGS } from '../src/domain/models';
import { instantOf } from '../src/domain/time/trackingDay';
import { PRESET_BY_ID } from '../src/library/presets';
import { applyAll, completeFromNudge, nudgeResponseActions, type CommandContext, type NudgePayload } from '../src/state/commands';
import { reducer } from '../src/state/reducer';
import { buildEmptyState, buildSampleState, habitFromPreset } from '../src/state/seed';
import { habitView, periodDoneOn } from '../src/state/selectors';
import type { TrackerState } from '../src/state/types';

const ZONE = 'America/New_York';
const TODAY = '2026-10-25';
const NOW = instantOf(TODAY, 15 * 60, ZONE);
let seq = 0;
const ctx: CommandContext = { nowMs: NOW, zone: ZONE, today: TODAY, newId: () => `h${++seq}` };

function sample() {
  return buildSampleState(TODAY, ZONE, NOW);
}

function withPreset(state: TrackerState, presetId: string, createdDay = '2026-10-01') {
  const built = habitFromPreset(PRESET_BY_ID[presetId]!, `p-${presetId}`, createdDay);
  return { state: reducer(state, { type: 'ADD_HABIT', ...built }), habit: built.habit };
}

describe('import validation', () => {
  it('rejects a record missing a required field, naming the list', () => {
    const state = sample();
    const broken = { ...state, water: [...state.water, { id: 'w', at: NOW, zone: ZONE, day: TODAY }] };
    assert.throws(() => validateRecords(broken as never), (err: unknown) => err instanceof ValidationError && /water/.test(err.message));
  });

  it('rejects a day string that is not YYYY-MM-DD and non-finite numbers', () => {
    const state = sample();
    assert.throws(() => validateRecords({ ...state, entries: [{ id: 'e', habitId: 'x', day: '25/10/2026', at: NOW, zone: ZONE, value: 1, source: 'MANUAL' }] } as never), ValidationError);
    // The rotation offset indexes a list: a fraction or a negative would have the planner read past it.
    assert.throws(() => validateRecords({ ...state, nudgeSwap: { day: '2026-10-26', offset: 0.5 } } as never), ValidationError);
    assert.throws(() => validateRecords({ ...state, nudgeSwap: { day: '2026-10-26', offset: -1 } } as never), ValidationError);
    assert.throws(() => validateRecords({ ...state, nudgeSwap: { day: 'today', offset: 1 } } as never), ValidationError);
    assert.doesNotThrow(() => validateRecords({ ...state, nudgeSwap: { day: '2026-10-26', offset: 2 } } as never));
    assert.throws(() => validateRecords({ ...state, entries: [{ id: 'e', habitId: 'x', day: TODAY, at: Number.NaN, zone: ZONE, value: 1, source: 'MANUAL' }] } as never), ValidationError);
  });

  it('parseState turns a validation failure into a readable StorageError', () => {
    const state = sample();
    const raw = JSON.parse(JSON.stringify({ ...state, snacks: [{ id: 's' }] }));
    assert.throws(() => parseState(raw), (err: unknown) => err instanceof StorageError && /cannot read/.test(err.message));
  });

  it('parseState refuses files from a newer data version with an "update the app" message', () => {
    const raw = { ...JSON.parse(JSON.stringify(sample())), version: DATA_VERSION + 1 };
    assert.throws(() => parseState(raw), (err: unknown) => err instanceof StorageError && /newer version/.test(err.message));
  });

  it('sanitizeSettings keeps known keys of the right type and drops the rest', () => {
    const out = sanitizeSettings({
      waterGoalMl: 3000,
      units: 'oz',
      dayBoundaryHour: 'four', // wrong type → default
      activeStartMin: Number.POSITIVE_INFINITY, // non-finite → default
      mysteryFlag: true, // unknown → dropped
      cycle: { birthControl: true, nonsense: 1, history: [{ start: '2026-10-01' }] },
    });
    assert.equal(out.waterGoalMl, 3000);
    assert.equal(out.units, 'oz');
    assert.equal(out.dayBoundaryHour, undefined);
    assert.equal(out.activeStartMin, undefined);
    assert.equal((out as Record<string, unknown>).mysteryFlag, undefined);
    assert.equal(out.cycle?.birthControl, true);
    assert.equal((out.cycle as unknown as Record<string, unknown>).nonsense, undefined);
    assert.deepEqual(sanitizeSettings('not an object'), {});
    assert.deepEqual(sanitizeSettings([1, 2]), {});
  });
});

describe('encrypted envelope bounds', () => {
  function envelope(): EncryptedBackup {
    return encryptBackup(JSON.stringify({ hello: 'world' }), 'password', { iterations: 1000 });
  }

  it('accepts its own output', () => {
    const file = envelope();
    const parts = checkEnvelope(file);
    assert.equal(parts.salt.length, 16);
    assert.equal(parts.iv.length, 12);
    assert.ok(parts.ciphertext.length > 16);
  });

  it('refuses hostile iteration counts, short salts / IVs and truncated ciphertext before deriving a key', () => {
    const file = envelope();
    assert.throws(() => checkEnvelope({ ...file, iterations: 50_000_000 }), StorageError);
    assert.throws(() => checkEnvelope({ ...file, iterations: 10 }), StorageError);
    assert.throws(() => checkEnvelope({ ...file, iterations: Number.NaN }), StorageError);
    assert.throws(() => checkEnvelope({ ...file, salt: toBase64(new Uint8Array(4)) }), StorageError);
    assert.throws(() => checkEnvelope({ ...file, iv: toBase64(new Uint8Array(3)) }), StorageError);
    assert.throws(() => checkEnvelope({ ...file, ciphertext: toBase64(new Uint8Array(8)) }), StorageError);
    assert.throws(() => checkEnvelope({ ...file, ciphertext: '***not base64***' }), StorageError);
  });
});

describe('completing a habit from a nudge or widget', () => {
  it('never logs steps by hand: the phone counts them', () => {
    const { state, habit } = withPreset(buildEmptyState(TODAY), 'steps');
    assert.deepEqual(completeFromNudge(state, habit, ctx), []);
  });

  it('a weekly habit logs today even when the week is already met, and a second press is a no-op', () => {
    const { state, habit } = withPreset(buildEmptyState(TODAY), 'strength-session');
    // Week already satisfied on earlier days.
    let s = state;
    for (const day of ['2026-10-19', '2026-10-20']) {
      s = reducer(s, { type: 'ADD_ENTRY', entry: { id: `e-${day}`, habitId: habit.id, day, at: instantOf(day, 600, ZONE), zone: ZONE, value: 1, source: 'MANUAL' } });
    }
    assert.ok((habitView(s, habit, TODAY).periodDone ?? 0) >= 2);
    const first = completeFromNudge(s, habit, ctx);
    assert.equal(first.length, 1);
    assert.equal(first[0]!.type, 'ADD_ENTRY');
    const after = applyAll(s, first, reducer);
    assert.deepEqual(completeFromNudge(after, habit, ctx), []);
  });

  it('a yes/no habit gets one entry, not a mark on an entry that does not exist', () => {
    const { state, habit } = withPreset(buildEmptyState(TODAY), 'journal');
    const actions = completeFromNudge(state, habit, ctx, 'AUTO_WIDGET');
    assert.equal(actions.length, 1);
    assert.equal(actions[0]!.type, 'ADD_ENTRY');
    const after = applyAll(state, actions, reducer);
    assert.equal(after.entries.at(-1)!.source, 'AUTO_WIDGET');
    assert.equal(habitView(after, habit, TODAY).todayRatio, 1);
  });
});

describe('automatic step totals', () => {
  it('SET_AUTO_ENTRY evicts every non-manual row for the day so widget and phone counts never add up', () => {
    const { state, habit } = withPreset(buildEmptyState(TODAY), 'steps');
    let s = reducer(state, { type: 'ADD_ENTRY', entry: { id: 'wdg', habitId: habit.id, day: TODAY, at: NOW, zone: ZONE, value: 500, source: 'AUTO_WIDGET' } });
    s = reducer(s, { type: 'ADD_ENTRY', entry: { id: 'man', habitId: habit.id, day: TODAY, at: NOW, zone: ZONE, value: 100, source: 'MANUAL' } });
    s = reducer(s, { type: 'SET_AUTO_ENTRY', habitId: habit.id, day: TODAY, entry: { id: 'hc', habitId: habit.id, day: TODAY, at: NOW, zone: ZONE, value: 7000, source: 'AUTO_HC' } });
    const rows = s.entries.filter((e) => e.habitId === habit.id && e.day === TODAY);
    assert.deepEqual(rows.map((r) => r.id).sort(), ['hc', 'man']);
    // Clearing (no entry) leaves only the manual row.
    const cleared = reducer(s, { type: 'SET_AUTO_ENTRY', habitId: habit.id, day: TODAY, entry: undefined });
    assert.deepEqual(cleared.entries.filter((e) => e.habitId === habit.id).map((r) => r.id), ['man']);
  });
});

describe('timer bell after midnight', () => {
  it('files the session under the day it ended, not the day the bell was tapped', () => {
    const state = buildEmptyState(TODAY);
    // Session 23:50 → 00:03 on the night of the 24th; the bell is tapped the next afternoon (ctx.today = 25th).
    const startAt = instantOf('2026-10-24', 23 * 60 + 50, ZONE);
    const payload: NudgePayload = { nudgeId: 'mind-end', kind: 'MIND_END', habitIds: [], day: '', mind: { kind: 'MEDITATION', minutes: 13, startAt } };
    const next = applyAll(state, nudgeResponseActions(state, payload, 'TAP', ctx), reducer);
    const session = next.mind.at(-1)!;
    assert.equal(session.endAt, startAt + 13 * 60_000);
    // Day boundary defaults to 4 am: 00:03 still belongs to the 24th.
    assert.equal(state.settings.dayBoundaryHour, DEFAULT_SETTINGS.dayBoundaryHour);
    assert.equal(session.day, DEFAULT_SETTINGS.dayBoundaryHour > 0 ? '2026-10-24' : '2026-10-25');
  });
});

describe('period-to-date counting', () => {
  it('a monthly habit counts from the first of the month, not from the start of the chart window', () => {
    const { state, habit } = withPreset(buildEmptyState(TODAY), 'journal', '2026-09-01');
    let s = state;
    const monthly = habit;
    for (const day of ['2026-09-30', '2026-10-02', '2026-10-11', '2026-10-24']) {
      s = reducer(s, { type: 'ADD_ENTRY', entry: { id: `j-${day}`, habitId: habit.id, day, at: instantOf(day, 600, ZONE), zone: ZONE, value: 1, source: 'MANUAL' } });
    }
    assert.equal(periodDoneOn(s, monthly, 'MONTHLY', TODAY), 3);
    assert.equal(periodDoneOn(s, monthly, 'MONTHLY', '2026-10-05'), 1);
    assert.equal(periodDoneOn(s, monthly, 'WEEKLY', TODAY), 1); // week of Oct 19–25
    assert.equal(periodDoneOn(s, monthly, 'DAILY', '2026-10-24'), 1);
    assert.equal(periodDoneOn(s, monthly, 'DAILY', TODAY), 0);
  });
});

describe('cloud backup snapshot rules', () => {
  it('an onboarded user with only the seeded Water habit has nothing worth backing up', () => {
    const empty = buildEmptyState(TODAY);
    assert.equal(hasUserData(empty), false);
    const onboarded: TrackerState = { ...empty, settings: { ...empty.settings, onboardingDone: true, cloudBackup: true } };
    assert.equal(shouldSnapshot(onboarded), false);
  });

  it('one sip of water counts, sample data and a disabled toggle do not', () => {
    const empty = buildEmptyState(TODAY);
    const sipped: TrackerState = {
      ...empty,
      water: [{ id: 'w', at: NOW, zone: ZONE, day: TODAY, ml: 250, source: 'MANUAL' }],
      settings: { ...empty.settings, onboardingDone: true, cloudBackup: true },
    };
    assert.equal(hasUserData(sipped), true);
    assert.equal(shouldSnapshot(sipped), true);
    assert.equal(shouldSnapshot({ ...sipped, settings: { ...sipped.settings, sampleData: true } }), false);
    assert.equal(shouldSnapshot({ ...sipped, settings: { ...sipped.settings, cloudBackup: false } }), false);
    assert.equal(shouldSnapshot({ ...sipped, settings: { ...sipped.settings, onboardingDone: false } }), false);
  });
});
