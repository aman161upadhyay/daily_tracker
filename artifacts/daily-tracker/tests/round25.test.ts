/**
 * Round 25: what the council's diff, fresh-install simulation and error-path lenses turned up.
 *
 * - A widget ring's click action and its spoken label follow one rule, the tap handler's: a ring that
 *   would log nothing (Steps, a met daily target) opens the habit and says so.
 * - "On last week" is only said once last week was lived with the habit: a partial first week made
 *   day eight read "Up 175%".
 * - Background failures the person was never told about (the phone-backup copy, the screenshot
 *   protection) have a place to be shown, with the clearing rules that keep the notice honest.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { MovementSnack } from '../src/domain/models';
import { instantOf } from '../src/domain/time/trackingDay';
import { ringsCentre } from '../src/domain/today/ringsCentre';
import { backupFailure, reportBackup, setBackupFailure } from '../src/services/backupHealth';
import { protectionStatus, setProtectionStatus } from '../src/services/protectionState';
import { completeFromNudge, newHabitAction, type CommandContext, type HabitDraft } from '../src/state/commands';
import { reducer } from '../src/state/reducer';
import { buildEmptyState, buildSampleState } from '../src/state/seed';
import { highlights } from '../src/state/selectors';
import type { TrackerState } from '../src/state/types';
import { ringLabel, widgetModel } from '../src/widget/model';

const NY = 'America/New_York';
const MON = '2026-10-26';
const TUE = '2026-10-27';
const SUN = '2026-11-01';
const DAY8 = '2026-11-02';
const DAY14 = '2026-11-08';

const addDaysIso = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
let seq = 0;
const ctxAt = (today: string, minute = 12 * 60): CommandContext => ({ nowMs: instantOf(today, minute, NY), zone: NY, today, newId: () => `r25-${++seq}` });
const onboarded = (s: TrackerState) => reducer(s, { type: 'UPDATE_SETTINGS', patch: { onboardingDone: true } });
const snack = (id: string, day: string, minute: number): MovementSnack => ({ id, at: instantOf(day, minute, NY), zone: NY, day, type: 'WALK', seconds: 300, trigger: 'MANUAL' });

function habitOf(cadence: 'WEEKLY' | 'DAILY', type: 'YES_NO' | 'COUNT', extra: Partial<HabitDraft> = {}): TrackerState {
  const empty = buildEmptyState(MON, undefined, { withWater: false });
  const draft: HabitDraft = { name: 'Stretch', category: 'movement', type, unit: type === 'COUNT' ? 'sets' : '', icon: 'walk', cadence, timesPerPeriod: 1, target: type === 'COUNT' ? 3 : 1, freezesPerMonth: 0, pinned: false, ...extra };
  return onboarded(reducer(empty, newHabitAction(draft, 'h', MON)));
}

describe('a widget ring does what its label says (R25-A1 / R25-A2)', () => {
  it('every tile in the sample state logs exactly when the tap handler would log', () => {
    const state = buildSampleState(MON, NY, instantOf(MON, 15 * 60, NY));
    const ctx = ctxAt(MON, 15 * 60);
    for (const habit of state.habits.filter((h) => !h.archived)) {
      const chosen = reducer(state, { type: 'UPDATE_SETTINGS', patch: { widgetHabitIds: [habit.id] } });
      const tile = widgetModel(chosen, MON, ctx.nowMs, NY).tiles[0];
      assert.ok(tile, habit.name);
      const wouldLog = completeFromNudge(state, habit, ctx, 'AUTO_WIDGET', 'WIDGET').length > 0;
      assert.equal(tile.logs, wouldLog, `${habit.name}: logs=${tile.logs} but the handler would ${wouldLog ? '' : 'not '}log`);
      const label = ringLabel(tile);
      if (wouldLog) assert.match(label, /Double-tap to log/, `${habit.name}: ${label}`);
      else assert.match(label, /Opens the habit\.$/, `${habit.name}: ${label}`);
    }
  });
  it('the Steps ring opens the habit and never promises a log', () => {
    const state = buildSampleState(MON, NY, instantOf(MON, 15 * 60, NY));
    const steps = state.habits.find((h) => h.presetId === 'steps');
    assert.ok(steps, 'the sample state has a Steps habit');
    const chosen = reducer(state, { type: 'UPDATE_SETTINGS', patch: { widgetHabitIds: [steps.id] } });
    const tile = widgetModel(chosen, MON, instantOf(MON, 15 * 60, NY), NY).tiles[0]!;
    assert.equal(tile.steps, true);
    assert.equal(tile.logs, false);
    assert.match(ringLabel(tile), /\. Opens the habit\.$/);
    assert.doesNotMatch(ringLabel(tile), /Done for today/);
  });
  it('a met daily yes/no habit says "Done for today. Opens the habit."; open, it logs', () => {
    const open = reducer(habitOf('DAILY', 'YES_NO'), { type: 'UPDATE_SETTINGS', patch: { widgetHabitIds: ['h'] } });
    const before = widgetModel(open, MON, instantOf(MON, 9 * 60, NY), NY).tiles[0]!;
    assert.equal(before.logs, true);
    assert.equal(ringLabel(before), 'Stretch: – Tap to log. Double-tap to log it.');
    const met = reducer(open, { type: 'ADD_ENTRY', entry: { id: 'e1', habitId: 'h', day: MON, at: instantOf(MON, 8 * 60, NY), zone: NY, value: 1, source: 'MANUAL' } });
    const after = widgetModel(met, MON, instantOf(MON, 9 * 60, NY), NY).tiles[0]!;
    assert.equal(after.done, true);
    assert.equal(after.logs, false);
    assert.equal(ringLabel(after), 'Stretch: ✓ Done. Done for today. Opens the habit.');
    assert.equal(completeFromNudge(met, met.habits[0]!, ctxAt(MON, 9 * 60)).length, 0, 'the handler agrees');
  });
  it('a weekly habit met for the week with today open still logs — and the label says so', () => {
    const weekly = reducer(habitOf('WEEKLY', 'YES_NO'), { type: 'UPDATE_SETTINGS', patch: { widgetHabitIds: ['h'] } });
    const metMonday = reducer(weekly, { type: 'ADD_ENTRY', entry: { id: 'e1', habitId: 'h', day: MON, at: instantOf(MON, 8 * 60, NY), zone: NY, value: 1, source: 'MANUAL' } });
    const tile = widgetModel(metMonday, TUE, instantOf(TUE, 9 * 60, NY), NY).tiles[0]!;
    assert.equal(tile.done, true, 'the week is met');
    assert.equal(tile.logs, true, 'today is open, so a tap logs (the handler would)');
    assert.ok(completeFromNudge(metMonday, metMonday.habits[0]!, ctxAt(TUE, 9 * 60)).length > 0);
    assert.equal(ringLabel(tile), 'Stretch: – 1 of 1 days. Double-tap to log another.');
  });
  it('a chosen snack habit at its daily target still logs another (the handler does)', () => {
    const daily = reducer(habitOf('DAILY', 'COUNT', { name: 'Walk break' }), { type: 'UPDATE_SETTINGS', patch: { widgetHabitIds: ['h'] } });
    const withSnack = { ...daily, habits: daily.habits.map((h) => ({ ...h, snackType: 'WALK' as const })) };
    const met = reducer(withSnack, { type: 'LOG_SNACKS', snacks: [snack('s1', MON, 9 * 60), snack('s2', MON, 10 * 60), snack('s3', MON, 11 * 60)] });
    const tile = widgetModel(met, MON, instantOf(MON, 12 * 60, NY), NY).tiles[0]!;
    assert.equal(tile.done, true);
    assert.equal(tile.logs, true);
    assert.equal(ringLabel(tile), 'Walk break: 3 of 3 sets. Double-tap to log another.');
    assert.ok(completeFromNudge(met, met.habits[0]!, ctxAt(MON)).length > 0);
  });
  it('water and the automatic movement tile always log', () => {
    const state = buildSampleState(MON, NY, instantOf(MON, 15 * 60, NY));
    const tiles = widgetModel(state, MON, instantOf(MON, 15 * 60, NY), NY).tiles;
    const water = tiles.find((t) => t.kind === 'water');
    const rotation = tiles.find((t) => t.kind === 'rotation');
    assert.equal(water?.logs, true);
    assert.equal(rotation?.logs, true);
  });
});

describe('"on last week" needs two lived weeks (F25-01)', () => {
  const drink = (s: TrackerState, day: string, ml: number) => reducer(s, { type: 'ADD_WATER', entry: { id: `w${day}`, at: instantOf(day, 10 * 60, NY), zone: NY, day, ml, source: 'MANUAL' } });
  it('water: day eight compares nothing; day fourteen compares the two weeks', () => {
    let state = onboarded(buildEmptyState(MON, undefined, { withWater: true }));
    for (let i = 0; i < 7; i++) state = drink(state, addDaysIso(MON, i), 500);
    for (let i = 7; i < 14; i++) state = drink(state, addDaysIso(MON, i), 600);
    const day8 = highlights(state, DAY8).find((h) => h.id === 'water-week');
    assert.equal(day8?.title, 'You logged water 7 of the last 7 days');
    assert.equal(day8?.body, '514 ml a day on average.', 'no "Up 600%" against a one-day "last week"');
    const day14 = highlights(state, DAY14).find((h) => h.id === 'water-week');
    assert.equal(day14?.body, '600 ml a day on average. Up 20% on last week.');
  });
  it('a dropped week is still named once both weeks were lived', () => {
    let state = onboarded(buildEmptyState(MON, undefined, { withWater: true }));
    for (let i = 0; i < 7; i++) state = drink(state, addDaysIso(MON, i), 1000);
    for (let i = 7; i < 14; i++) state = drink(state, addDaysIso(MON, i), 500);
    assert.equal(highlights(state, DAY14).find((h) => h.id === 'water-week')?.body, '500 ml a day on average. Down 50% on last week.');
  });
  it('movement snacks: the same rule', () => {
    const base = habitOf('DAILY', 'COUNT', { name: 'Walk break' });
    const withSnack = { ...base, habits: base.habits.map((h) => ({ ...h, snackType: 'WALK' as const })) };
    const snacks: MovementSnack[] = [];
    for (let i = 0; i < 14; i++) snacks.push(snack(`s${i}`, addDaysIso(MON, i), 11 * 60), ...(i >= 7 ? [snack(`t${i}`, addDaysIso(MON, i), 15 * 60)] : []));
    const state = reducer(withSnack, { type: 'LOG_SNACKS', snacks });
    const day8 = highlights(state, DAY8).find((h) => h.id === 'snacks-week');
    assert.equal(day8?.title, '8 movement snacks this week');
    assert.equal(day8?.body, 'Every one of them counts as a sitting break.', 'no comparison against a week the habit did not exist for');
    const sunday = highlights(state, SUN).find((h) => h.id === 'snacks-week');
    assert.equal(sunday?.body, 'Every one of them counts as a sitting break.');
    const day14 = highlights(state, DAY14).find((h) => h.id === 'snacks-week');
    assert.equal(day14?.title, '14 movement snacks this week');
    assert.equal(day14?.body, 'Up 100% on last week.');
  });
});

describe("Today's centre names what the person tracks (F25-03)", () => {
  const base = { remaining: { value: '2,000', unit: 'ml' }, snacksDone: 0, mindMinutes: '0', habitCount: 0 };
  it('water in the morning, snacks after noon — for someone who tracks them', () => {
    const all = { ...base, tracksWater: true, tracksMovement: true, tracksMind: true, habitCount: 3 };
    assert.deepEqual(ringsCentre({ ...all, beforeNoon: true }), { value: '2,000', label: 'ml to go' });
    assert.deepEqual(ringsCentre({ ...all, beforeNoon: false, snacksDone: 1 }), { value: '1', label: 'snack' });
  });
  it('"Start empty" (Water archived) is not owed 2,000 ml; a vitamins-only person is not owed snacks', () => {
    assert.deepEqual(ringsCentre({ ...base, beforeNoon: true, tracksWater: false, tracksMovement: false, tracksMind: false }), { value: '–', label: 'nothing tracked' });
    assert.deepEqual(ringsCentre({ ...base, beforeNoon: true, tracksWater: false, tracksMovement: false, tracksMind: false, habitCount: 1 }), { value: '1', label: 'habit' });
    assert.deepEqual(ringsCentre({ ...base, beforeNoon: false, tracksWater: true, tracksMovement: false, tracksMind: false, habitCount: 1 }), { value: '2,000', label: 'ml to go' }, 'water-only: the afternoon still shows water');
    assert.deepEqual(ringsCentre({ ...base, beforeNoon: true, tracksWater: false, tracksMovement: false, tracksMind: true, mindMinutes: '13', habitCount: 1 }), { value: '13', label: 'min of mind' });
  });
});

describe('background failures have a place to be shown (E25-02 / E25-06)', () => {
  it('a backup failure stands until the same kind of job succeeds', () => {
    setBackupFailure(null);
    reportBackup('write', new Error('ENOSPC'));
    assert.equal(backupFailure()?.what, 'write');
    assert.equal(backupFailure()?.message, 'ENOSPC');
    reportBackup('delete', null);
    assert.equal(backupFailure()?.what, 'write', 'a delete going through says nothing about the copy being written');
    reportBackup('write', null);
    assert.equal(backupFailure(), null);
    reportBackup('delete', 'EBUSY');
    assert.equal(backupFailure()?.message, 'EBUSY');
    reportBackup('delete', null);
    assert.equal(backupFailure(), null);
  });
  it('the screenshot-protection status records what was asked and what the phone did', () => {
    setProtectionStatus(null);
    assert.equal(protectionStatus(), null);
    setProtectionStatus({ enabled: true, ok: false, reason: 'window not attached' });
    assert.deepEqual(protectionStatus(), { enabled: true, ok: false, reason: 'window not attached' });
    setProtectionStatus(null);
  });
});
