/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { adherenceColor, adherenceStage, ADHERENCE_LUT_OUTPUT, FLOW_THRESHOLD } from '../src/domain/adherence/adherenceScale';
import { averageCycleLength, cycleDay, isPeriodOpen, predictedNextStart } from '../src/domain/cycle/timeline';
import { adherenceOf, bestStreak, currentStreak, percentChange, ratioOf, type DayRatio } from '../src/domain/habits/progress';
import { nextNudge, nextSlotMin, swapRotation, type RotationItem } from '../src/domain/nudges/nextNudge';
import { formatOneDecimal, parseDecimalInput, parseVolumeInput, formatClock, formatIn, formatVolume } from '../src/domain/time/format';
import { lastNDays } from '../src/domain/time/trackingDay';
import { catchUpMl, expectedIntakeMl, isOnPace, waterStatus } from '../src/domain/water/pace';

const TODAY = '2026-10-25';

function ratios(values: number[], target = 1): DayRatio[] {
  const days = lastNDays(TODAY, values.length);
  return values.map((v, i) => ({ day: days[i]!, value: v, target, ratio: ratioOf(v, target) }));
}

describe('adherence scale', () => {
  it('maps the ramp pale gold → green → violet', () => {
    assert.equal(adherenceStage(0), 'dormant');
    assert.equal(adherenceStage(0.3), 'warming');
    assert.equal(adherenceStage(0.55), 'building');
    assert.equal(adherenceStage(0.8), 'onTrack');
    assert.equal(adherenceStage(FLOW_THRESHOLD), 'flow');
    assert.equal(adherenceStage(1), 'flow');
  });

  it('returns valid hex colours across the whole range', () => {
    for (const hex of ADHERENCE_LUT_OUTPUT) assert.match(hex, /^#[0-9a-f]{6}$/i);
    assert.equal(ADHERENCE_LUT_OUTPUT.length, 21);
    assert.equal(adherenceColor(0.75).toLowerCase(), '#1db954');
  });
});

describe('progress math', () => {
  it('ratioOf clamps and handles zero targets', () => {
    assert.equal(ratioOf(3, 2), 1);
    assert.equal(ratioOf(1, 2), 0.5);
    assert.equal(ratioOf(0, 0), 0);
    assert.equal(ratioOf(2, 0), 1);
  });

  it('adherence is the 14-day mean, today counted proportionally', () => {
    const r = ratios([1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0.5]);
    assert.equal(adherenceOf(r, '2026-01-01', TODAY), 7.5 / 14);
  });

  it('young habits (< 3 days) use today only', () => {
    const r = ratios([0, 1]);
    assert.equal(adherenceOf(r, '2026-10-24', TODAY), 1);
    assert.equal(adherenceOf(ratios([1, 1, 0]), '2026-10-23', TODAY), 2 / 3);
  });

  it('streaks ignore an unfinished today but break on a missed yesterday', () => {
    assert.equal(currentStreak(ratios([1, 1, 1, 0.4])), 3);
    assert.equal(currentStreak(ratios([1, 1, 1, 1])), 4);
    assert.equal(currentStreak(ratios([1, 1, 0, 0])), 0);
    assert.equal(bestStreak(ratios([1, 1, 0, 1, 1, 1, 0])), 3);
  });

  it('percentChange is null without a baseline', () => {
    assert.equal(percentChange(0, 10), null);
    assert.equal(percentChange(10, 15), 50);
    assert.equal(percentChange(20, 15), -25);
  });
});

describe('water pace', () => {
  const start = 9 * 60;
  const end = 21 * 60;
  it('expects intake in proportion to the active day', () => {
    assert.equal(expectedIntakeMl(start, start, end, 2000), 0);
    assert.equal(expectedIntakeMl(15 * 60, start, end, 2000), 1000);
    assert.equal(expectedIntakeMl(23 * 60, start, end, 2000), 2000);
  });

  it('is on pace within half a tap and rounds catch-up to 50 ml', () => {
    assert.equal(isOnPace(900, 1000), true);
    assert.equal(isOnPace(800, 1000), false);
    assert.equal(catchUpMl(730, 1000), 300);
    assert.equal(catchUpMl(1200, 1000), 0);
  });

  it('builds a full status', () => {
    const s = waterStatus(1500, 2000, 15 * 60, start, end);
    assert.equal(s.onPace, true);
    assert.equal(s.remainingMl, 500);
    assert.equal(s.reachedGoal, false);
    assert.equal(waterStatus(2100, 2000, 15 * 60, start, end).reachedGoal, true);
  });
});

describe('next nudge', () => {
  const base = { activeStartMin: 9 * 60, activeEndMin: 21 * 60, intervalMin: 60 };
  const items: RotationItem[] = [
    { habitId: 'a', snackType: 'SQUATS', label: 'Squats' },
    { habitId: 'b', snackType: 'WALK', label: 'Walk' },
    { habitId: 'c', snackType: 'STRETCH', label: 'Stretch' },
  ];

  it('is one interval after the last snack, never before now', () => {
    assert.equal(nextSlotMin({ ...base, nowMin: 10 * 60 + 30, lastDoneMin: 10 * 60 }), 11 * 60);
    assert.equal(nextSlotMin({ ...base, nowMin: 12 * 60, lastDoneMin: 10 * 60 }), 12 * 60);
    assert.equal(nextSlotMin({ ...base, nowMin: 9 * 60 + 10 }), 10 * 60);
  });

  it('respects active hours and snooze', () => {
    assert.equal(nextSlotMin({ ...base, nowMin: 21 * 60 }), null);
    assert.equal(nextSlotMin({ ...base, nowMin: 20 * 60 + 30, lastDoneMin: 20 * 60 }), null);
    assert.equal(nextSlotMin({ ...base, nowMin: 8 * 60 }), 10 * 60);
    assert.equal(nextSlotMin({ ...base, nowMin: 12 * 60, lastDoneMin: 11 * 60, snoozedUntilMin: 12 * 60 + 10 }), 12 * 60 + 10);
  });

  it('rotates through the enabled snacks and can swap', () => {
    const n0 = nextNudge({ ...base, nowMin: 10 * 60 }, items, 0);
    const n1 = nextNudge({ ...base, nowMin: 10 * 60 }, items, 1);
    const n3 = nextNudge({ ...base, nowMin: 10 * 60 }, items, 3);
    assert.equal(n0?.item.habitId, 'a');
    assert.equal(n1?.item.habitId, 'b');
    assert.equal(n3?.item.habitId, 'a');
    assert.equal(n0?.inMin, 0);
    assert.equal(swapRotation(items, items[2]!).habitId, 'a');
    assert.equal(nextNudge({ ...base, nowMin: 10 * 60 }, [], 0), null);
  });
});

describe('cycle prediction', () => {
  const history = [
    { start: '2026-07-05', end: '2026-07-09' },
    { start: '2026-08-02', end: '2026-08-06' },
    { start: '2026-08-31', end: '2026-09-04' },
    { start: '2026-09-28', end: '2026-10-02' },
  ];

  it('blends the typical length in until three cycles are logged', () => {
    assert.equal(averageCycleLength(history, 30), 28);
    assert.equal(averageCycleLength(history.slice(0, 2), 30), 29);
    assert.equal(averageCycleLength(history.slice(0, 1), 30), 30);
    assert.equal(predictedNextStart('2026-09-28', 28), '2026-10-26');
  });

  it('knows the cycle day and whether a period is open', () => {
    assert.equal(cycleDay('2026-10-25', '2026-09-28'), 28);
    assert.equal(isPeriodOpen(history), false);
    assert.equal(isPeriodOpen([...history, { start: '2026-10-25' }]), true);
  });
});

describe('formatting', () => {
  it('formats clocks, countdowns and volumes', () => {
    assert.equal(formatClock(9 * 60, '12h'), '9:00 AM');
    assert.equal(formatClock(21 * 60 + 5, '12h'), '9:05 PM');
    assert.equal(formatClock(9 * 60, '24h'), '09:00');
    assert.equal(formatClock(21 * 60 + 5, '24h'), '21:05');
    assert.equal(formatClock(0, '24h'), '00:00');
    assert.equal(formatClock(0, '12h'), '12:00 AM');
    assert.equal(formatIn(0), 'now');
    assert.equal(formatIn(24), 'in 24 min');
    assert.equal(formatIn(90), 'in 1 h 30 min');
    assert.deepEqual(formatVolume(1500, 'ml'), { value: '1,500', unit: 'ml' });
    // Ounces keep one decimal (a glass rounded to the ounce drifts by up to 15 ml each time).
    assert.deepEqual(formatVolume(1500, 'oz'), { value: '50.7', unit: 'oz' });
    assert.deepEqual(formatVolume(250, 'oz'), { value: '8.5', unit: 'oz' });
    assert.deepEqual(formatVolume(2957, 'oz'), { value: '100', unit: 'oz' });
    assert.equal(formatOneDecimal(1850.26), '1,850.3');
    assert.equal(formatOneDecimal(12), '12');
    assert.equal(formatOneDecimal(0.04), '0');
  });

  it('reads typed numbers the way keyboards write them', () => {
    assert.equal(parseDecimalInput('64'), 64);
    assert.equal(parseDecimalInput('8.5'), 8.5);
    assert.equal(parseDecimalInput('1,850'), 1850); // thousands
    assert.equal(parseDecimalInput('12,000 ml'), 12000);
    assert.equal(parseDecimalInput('1,5'), 1.5); // a decimal-comma keyboard
    assert.equal(parseDecimalInput('1,850.5'), 1850.5);
    assert.equal(parseDecimalInput('oz'), null);
    assert.equal(parseDecimalInput(''), null);
    assert.equal(parseVolumeInput('1,850', 'ml'), 1850);
    assert.equal(parseVolumeInput('8,5', 'oz'), 251);
    assert.equal(parseVolumeInput('64 oz', 'oz'), 1893);
  });
});
