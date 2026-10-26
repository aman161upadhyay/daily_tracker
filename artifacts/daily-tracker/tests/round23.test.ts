/**
 * Round 23: what the council's diff, Android-platform and documentation lenses turned up.
 *
 * - An export file carries its own "last exported" stamp, so a restore of someone's first backup
 *   does not say "No backup exported yet" and a later restore does not carry the export before it.
 * - A category whose week or month is met asks nothing today and says so: a full ring and
 *   "Nothing due today", not an empty 0 / 0 ring that reads as an untouched day.
 * - The reminder self-test's checks name the channel as Android shows it.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseExport, serializeExport } from '../src/data/transfer';
import { backupAge, withExportStamp } from '../src/domain/backup/backupAge';
import type { MovementSnack } from '../src/domain/models';
import { REMINDER_TEST_CHECKS } from '../src/domain/nudges/reminderTest';
import { settledLegend } from '../src/domain/time/format';
import { instantOf } from '../src/domain/time/trackingDay';
import { newHabitAction, type HabitDraft } from '../src/state/commands';
import { reducer } from '../src/state/reducer';
import { buildEmptyState } from '../src/state/seed';
import { todaySummary } from '../src/state/selectors';
import type { TrackerState } from '../src/state/types';

const NY = 'America/New_York';
const MON = '2026-10-26';
const TUE = '2026-10-27';

/** One movement habit `h` (squats), once a week or every day, created on Monday with no water habit. */
function squats(cadence: 'WEEKLY' | 'DAILY'): TrackerState {
  const empty = buildEmptyState(MON, undefined, { withWater: false });
  const draft: HabitDraft = {
    name: 'Squats',
    category: 'movement',
    type: 'COUNT',
    unit: 'times',
    icon: 'check',
    cadence,
    timesPerPeriod: 1,
    target: 1,
    freezesPerMonth: 0,
    pinned: false,
  };
  const add = newHabitAction(draft, 'h', MON);
  const withType = { ...add, habit: { ...add.habit, snackType: 'SQUATS' as const } };
  return reducer(reducer(empty, withType), { type: 'UPDATE_SETTINGS', patch: { onboardingDone: true } });
}

const snack = (id: string, day: string, minute: number): MovementSnack => ({ id, at: instantOf(day, minute, NY), zone: NY, day, type: 'SQUATS', reps: 10, trigger: 'MANUAL' });

describe('the export file carries its own stamp (R23-A01)', () => {
  const at = instantOf(MON, 12 * 60, NY);
  it('a restored first backup says it was exported, not that none was', () => {
    const state = buildEmptyState(MON, undefined, { withWater: true });
    assert.equal(state.settings.lastExportAt, undefined);
    const restored = parseExport(serializeExport(withExportStamp(state, at), new Date(at)));
    assert.equal(restored.settings.lastExportAt, at);
    assert.deepEqual(backupAge(restored.settings.lastExportAt, at + 3_600_000, NY), { text: 'Last exported today.', stale: false });
    assert.equal(state.settings.lastExportAt, undefined, 'the live state is stamped only once the file was handed over');
  });
  it('a later export carries its own moment, not the one before it', () => {
    const earlier = reducer(buildEmptyState(MON, undefined, { withWater: true }), { type: 'UPDATE_SETTINGS', patch: { lastExportAt: at - 40 * 86_400_000 } });
    const restored = parseExport(serializeExport(withExportStamp(earlier, at), new Date(at)));
    assert.equal(restored.settings.lastExportAt, at);
    assert.equal(backupAge(restored.settings.lastExportAt, at, NY).stale, false);
  });
});

describe('a met week says "nothing due" (IDEA23-2)', () => {
  const noonTue = instantOf(TUE, 12 * 60, NY);
  it('one Monday set settles Tuesday: no target, a full ring, and the legend says so', () => {
    const monday = reducer(squats('WEEKLY'), { type: 'LOG_SNACKS', snacks: [snack('s1', MON, 12 * 60)] });
    const tue = todaySummary(monday, TUE, noonTue, NY);
    assert.equal(tue.snacksTarget, 0);
    assert.equal(tue.snacksDone, 0);
    assert.equal(tue.snacksSettled, true);
    assert.equal(tue.rings.movement, 1, 'a met week draws a full ring');
    assert.equal(settledLegend(tue.snacksDone, 'snacks'), 'Nothing due today');
    const mon = todaySummary(monday, MON, instantOf(MON, 13 * 60, NY), NY);
    assert.equal(mon.snacksSettled, false, 'the day the set was done is an ordinary 1 / 1 day');
    assert.equal(mon.snacksTarget, 1);
  });
  it('a day started after the week was met is an ordinary day again, and a daily habit never settles', () => {
    const monday = reducer(squats('WEEKLY'), { type: 'LOG_SNACKS', snacks: [snack('s1', MON, 12 * 60)] });
    const started = reducer(monday, { type: 'LOG_SNACKS', snacks: [snack('s2', TUE, 9 * 60)] });
    const tue = todaySummary(started, TUE, noonTue, NY);
    assert.equal(tue.snacksSettled, false);
    assert.equal(tue.snacksTarget, 1);
    assert.equal(tue.rings.movement, 1);
    const daily = todaySummary(reducer(squats('DAILY'), { type: 'LOG_SNACKS', snacks: [snack('s1', MON, 12 * 60)] }), TUE, noonTue, NY);
    assert.equal(daily.snacksSettled, false);
    assert.equal(daily.snacksTarget, 1);
    assert.equal(daily.rings.movement, 0);
  });
  it('a category with no habits is not "settled" — nothing was ever asked', () => {
    const none = todaySummary(buildEmptyState(MON, undefined, { withWater: true }), MON, instantOf(MON, 12 * 60, NY), NY);
    assert.equal(none.snacksSettled, false);
    assert.equal(none.mindSettled, false);
    assert.equal(none.rings.movement, 0);
    assert.equal(settledLegend(2, 'snacks'), '2 snacks · nothing more due');
    assert.equal(settledLegend(1250, 'min'), '1,250 min · nothing more due');
  });
});

describe('the self-test names the channel as Android shows it (C23-07)', () => {
  it('says "Movement & habit nudges", never the internal id', () => {
    const line = REMINDER_TEST_CHECKS.find((x) => x.includes('channel'));
    assert.ok(line);
    assert.match(line, /"Movement & habit nudges" channel/);
    assert.doesNotMatch(line, /"Nudges"/);
  });
});
