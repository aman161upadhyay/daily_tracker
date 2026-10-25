/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { evaluateStreak, type StreakInput } from '../src/domain/habits/streaks';
import type { HabitRule } from '../src/domain/models';
import { addDays } from '../src/domain/time/trackingDay';

function daily(effectiveFrom: string, target = 1, freezesPerMonth = 2): HabitRule {
  return { habitId: 'h', effectiveFrom, cadence: 'DAILY', timesPerPeriod: 1, target, freezesPerMonth };
}

function weekly(effectiveFrom: string, timesPerPeriod: number, freezesPerMonth = 1): HabitRule {
  return { habitId: 'h', effectiveFrom, cadence: 'WEEKLY', timesPerPeriod, target: 1, freezesPerMonth };
}

/** Values keyed by day; everything else is 0. */
function values(map: Record<string, number>): (day: string) => number {
  return (day) => map[day] ?? 0;
}

/** Marks every day from `from` to `to` as done except the listed misses. */
function doneExcept(from: string, to: string, misses: string[]): (day: string) => number {
  const miss = new Set(misses);
  return (day) => (day >= from && day <= to && !miss.has(day) ? 1 : 0);
}

function statuses(input: StreakInput): string[] {
  return evaluateStreak(input).periods.map((p) => p.status);
}

describe('streak engine — daily habits', () => {
  it('grows by one per met day and counts a met today', () => {
    const r = evaluateStreak({ rules: [daily('2026-10-01')], createdDay: '2026-10-01', today: '2026-10-05', valueOf: doneExcept('2026-10-01', '2026-10-05', []) });
    assert.equal(r.streak, 5);
    assert.equal(r.best, 5);
    assert.deepEqual(r.freezesUsed, {});
  });

  it('never penalises the open period', () => {
    const r = evaluateStreak({ rules: [daily('2026-10-01')], createdDay: '2026-10-01', today: '2026-10-05', valueOf: doneExcept('2026-10-01', '2026-10-04', []) });
    assert.equal(r.streak, 4);
    assert.equal(r.periods.at(-1)!.status, 'OPEN');
  });

  it('spends a freeze on a miss and resets on the third miss of the month', () => {
    const input: StreakInput = {
      rules: [daily('2026-10-01')],
      createdDay: '2026-10-01',
      today: '2026-10-10',
      valueOf: doneExcept('2026-10-01', '2026-10-10', ['2026-10-04', '2026-10-06', '2026-10-08']),
    };
    assert.deepEqual(statuses(input), ['MET', 'MET', 'MET', 'FROZEN', 'MET', 'FROZEN', 'MET', 'MISSED', 'MET', 'MET']);
    const r = evaluateStreak(input);
    assert.equal(r.streak, 2, 'the third miss reset the streak');
    assert.equal(r.best, 5, 'frozen days keep the streak but do not grow it');
    assert.deepEqual(r.freezesUsed, { '2026-10': 2 });
    assert.equal(r.freezesLeftThisMonth, 0);
  });

  it('spends no freeze when there is no streak to protect', () => {
    const r = evaluateStreak({ rules: [daily('2026-10-01')], createdDay: '2026-10-01', today: '2026-10-03', valueOf: values({ '2026-10-03': 1 }) });
    assert.deepEqual(r.periods.map((p) => p.status), ['MISSED', 'MISSED', 'MET']);
    assert.deepEqual(r.freezesUsed, {});
    assert.equal(r.freezesLeftThisMonth, 2);
  });

  it('counts Jan 31 and Feb 1 freezes against different months', () => {
    const input: StreakInput = {
      rules: [daily('2026-01-20')],
      createdDay: '2026-01-20',
      today: '2026-02-06',
      valueOf: doneExcept('2026-01-20', '2026-02-06', ['2026-01-30', '2026-01-31', '2026-02-01', '2026-02-03', '2026-02-05']),
    };
    const r = evaluateStreak(input);
    const byDay = Object.fromEntries(r.periods.map((p) => [p.start, p.status]));
    assert.equal(byDay['2026-01-30'], 'FROZEN');
    assert.equal(byDay['2026-01-31'], 'FROZEN');
    assert.equal(byDay['2026-02-01'], 'FROZEN', 'February has its own allowance');
    assert.equal(byDay['2026-02-03'], 'FROZEN');
    assert.equal(byDay['2026-02-05'], 'MISSED', 'third February miss');
    assert.deepEqual(r.freezesUsed, { '2026-01': 2, '2026-02': 2 });
  });

  it('refunds a freeze when the missed day is backfilled', () => {
    const base: StreakInput = { rules: [daily('2026-10-01')], createdDay: '2026-10-01', today: '2026-10-06', valueOf: doneExcept('2026-10-01', '2026-10-06', ['2026-10-03']) };
    const before = evaluateStreak(base);
    assert.deepEqual(before.freezesUsed, { '2026-10': 1 });
    assert.equal(before.streak, 5);

    const after = evaluateStreak({ ...base, valueOf: doneExcept('2026-10-01', '2026-10-06', []) });
    assert.deepEqual(after.freezesUsed, {});
    assert.equal(after.streak, 6);
  });

  it('does not re-score closed days when the rule changes', () => {
    const rules = [daily('2026-10-01', 1), daily('2026-10-05', 5)];
    const r = evaluateStreak({ rules, createdDay: '2026-10-01', today: '2026-10-05', valueOf: () => 1 });
    assert.deepEqual(r.periods.map((p) => p.status), ['MET', 'MET', 'MET', 'MET', 'OPEN']);
    assert.equal(r.streak, 4);
  });

  it('uses the first rule for days before it took effect (start moved earlier)', () => {
    const r = evaluateStreak({ rules: [daily('2026-10-03')], createdDay: '2026-10-01', today: '2026-10-04', valueOf: () => 1 });
    assert.equal(r.periods.length, 4);
    assert.equal(r.streak, 4);
  });

  it('is idempotent', () => {
    const input: StreakInput = { rules: [daily('2026-09-01')], createdDay: '2026-09-01', today: '2026-10-25', valueOf: (d) => (d.endsWith('3') ? 0 : 1) };
    assert.deepEqual(evaluateStreak(input), evaluateStreak(input));
  });
});

describe('streak engine — weekly and monthly habits', () => {
  // 2026-10-19 is a Monday; 2026-09-28 is a Monday.
  it('meets a week with enough days and prorates a partial first week', () => {
    const r = evaluateStreak({
      rules: [weekly('2026-10-23', 3)],
      createdDay: '2026-10-23', // Friday: 3 days left → 1 day required
      today: '2026-10-25',
      valueOf: values({ '2026-10-24': 1 }),
    });
    assert.equal(r.periods.length, 1);
    assert.equal(r.periods[0]!.required, 1);
    assert.equal(r.periods[0]!.status, 'MET');
    assert.equal(r.streak, 1);
  });

  it('charges a freeze for a week that spans a month end to the month it ends in', () => {
    const r = evaluateStreak({
      rules: [weekly('2026-09-21', 2)],
      createdDay: '2026-09-21',
      today: '2026-10-11',
      // week Sep 21–27 met, week Sep 28–Oct 4 missed, week Oct 5–11 met
      valueOf: values({ '2026-09-22': 1, '2026-09-24': 1, '2026-10-06': 1, '2026-10-08': 1 }),
    });
    assert.deepEqual(r.periods.map((p) => p.status), ['MET', 'FROZEN', 'MET']);
    assert.deepEqual(r.freezesUsed, { '2026-10': 1 });
    assert.equal(r.streak, 2);
  });

  it('applies a target edited mid-week to the current week only', () => {
    const r = evaluateStreak({
      rules: [weekly('2026-10-12', 1), weekly('2026-10-21', 3)],
      createdDay: '2026-10-12',
      today: '2026-10-25',
      valueOf: values({ '2026-10-13': 1, '2026-10-20': 1 }),
    });
    assert.equal(r.periods[0]!.status, 'MET', 'last week still judged by the old rule');
    assert.equal(r.periods[1]!.required, 3);
    assert.equal(r.periods[1]!.status, 'OPEN');
  });

  it('skips periods where every day is off and keeps the streak', () => {
    const off = new Set<string>();
    for (let d = '2026-10-12'; d <= '2026-10-18'; d = addDays(d, 1)) off.add(d);
    const r = evaluateStreak({
      rules: [weekly('2026-10-05', 2)],
      createdDay: '2026-10-05',
      today: '2026-10-25',
      offDays: off,
      valueOf: values({ '2026-10-06': 1, '2026-10-07': 1, '2026-10-20': 1, '2026-10-21': 1 }),
    });
    assert.deepEqual(r.periods.map((p) => p.status), ['MET', 'SKIPPED', 'MET']);
    assert.equal(r.streak, 2);
  });

  it('handles monthly cadence', () => {
    const r = evaluateStreak({
      rules: [{ habitId: 'h', effectiveFrom: '2026-08-01', cadence: 'MONTHLY', timesPerPeriod: 1, target: 1, freezesPerMonth: 0 }],
      createdDay: '2026-08-01',
      today: '2026-10-25',
      valueOf: values({ '2026-08-15': 1, '2026-10-02': 1 }),
    });
    assert.deepEqual(r.periods.map((p) => [p.start, p.end, p.status]), [
      ['2026-08-01', '2026-08-31', 'MET'],
      ['2026-09-01', '2026-09-30', 'MISSED'],
      ['2026-10-01', '2026-10-31', 'MET'],
    ]);
    assert.equal(r.streak, 1);
  });
});
