/**
 * Round 16: weeks can start on Sunday (periods, grids, the weekly summary's day); Undo keeps the
 * manual-beats-import precedence; the planner's budgets move only on slots it kept (the repeated
 * hour when DST ends); the Today card's countdown is real minutes across that hour; a night keeps
 * the offsets it was slept at, so a trip neither re-dates it nor makes bedtimes look irregular.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mergeBody } from '../src/domain/body/merge';
import { bedtimeSpreadMin, dayAtOffset, minutesAtOffset, nightEndingOn, sleepClockMin } from '../src/domain/body/stats';
import { EMPTY_BODY, type SleepNight } from '../src/domain/body/types';
import { evaluateStreak, periodBounds, periodQuota, periodStartOf } from '../src/domain/habits/streaks';
import type { HabitEntry, NudgePolicy } from '../src/domain/models';
import { planNudges, type PlanHabit, type PlanInput } from '../src/domain/nudges/planner';
import { monthCells, weekdayLetters } from '../src/domain/time/month';
import { addDays, instantOf, minutesOfDay, trackingDayOf, weekEndIndex, weekStartIndex, weekStartOf, zoneOffsetAt } from '../src/domain/time/trackingDay';
import { normalizeSettings } from '../src/data/store';
import { PRESET_BY_ID } from '../src/library/presets';
import { reducer } from '../src/state/reducer';
import { buildEmptyState, habitFromPreset } from '../src/state/seed';
import { habitView, liveNudge } from '../src/state/selectors';
import type { TrackerState } from '../src/state/types';

const NY = 'America/New_York';
const at = (day: string, minute: number, zone = NY) => instantOf(day, minute, zone);

function withPreset(state: TrackerState, presetId: string, id: string, createdDay = '2026-09-01'): TrackerState {
  const { habit, rule, policy } = habitFromPreset(PRESET_BY_ID[presetId]!, id, createdDay);
  return { ...state, habits: [...state.habits, habit], rules: [...state.rules, rule], policies: [...state.policies, policy] };
}

describe('week start: Sunday-first weeks', () => {
  const WED = '2026-10-28';

  it('rotates the period bounds, the quota and the grid header; Monday stays the default', () => {
    assert.equal(weekStartIndex(undefined), 0);
    assert.equal(weekStartIndex('sunday'), 6);
    assert.equal(weekEndIndex('monday'), 6, 'Monday-first weeks end on Sunday');
    assert.equal(weekEndIndex('sunday'), 5, 'Sunday-first weeks end on Saturday');
    assert.equal(weekStartOf(WED), '2026-10-26');
    assert.equal(weekStartOf(WED, 6), '2026-10-25');
    assert.deepEqual(periodBounds('WEEKLY', WED, 6), { start: '2026-10-25', end: '2026-10-31', length: 7 });
    assert.deepEqual(periodBounds('WEEKLY', WED), { start: '2026-10-26', end: '2026-11-01', length: 7 });
    assert.equal(periodStartOf('WEEKLY', '2026-10-25', 6), '2026-10-25', 'a Sunday opens its own week');
    assert.equal(periodQuota({ cadence: 'WEEKLY', timesPerPeriod: 3 }, WED, 6), 3);
    assert.deepEqual(weekdayLetters(6), ['S', 'M', 'T', 'W', 'T', 'F', 'S']);
    assert.deepEqual(weekdayLetters(), ['M', 'T', 'W', 'T', 'F', 'S', 'S']);
    const cells = monthCells('2026-11', 6);
    assert.equal(cells[0], '2026-11-01', 'November 2026 starts on a Sunday: no leading blank');
    assert.equal(cells.length, 35);
    assert.equal(monthCells('2026-11')[0], null, 'Monday-first: six blanks before the 1st');
    assert.equal(monthCells('2026-11')[6], '2026-11-01');
  });

  it('counts a Sunday log into the week it opens, and the streak follows the same bounds', () => {
    const base = withPreset(buildEmptyState(WED), 'technical-reading', 'h_read');
    const habit = base.habits.find((h) => h.id === 'h_read')!;
    const sunday: HabitEntry = { id: 'e1', habitId: 'h_read', day: '2026-10-25', at: at('2026-10-25', 20 * 60), zone: NY, value: 20, source: 'MANUAL' };
    const monday: TrackerState = { ...base, entries: [sunday] };
    const sundayFirst: TrackerState = { ...monday, settings: { ...monday.settings, weekStart: 'sunday' } };
    assert.equal(habitView(monday, habit, WED).periodDone, 0, 'Monday-first: last Sunday closed the previous week');
    assert.equal(habitView(sundayFirst, habit, WED).periodDone, 1, 'Sunday-first: the same log opens this week');
    const rule = base.rules.find((r) => r.habitId === 'h_read')!;
    const done = (days: string[]) => (d: string) => (days.includes(d) ? 20 : 0);
    const mondayWeeks = evaluateStreak({ rules: [{ ...rule, timesPerPeriod: 1 }], createdDay: '2026-10-19', today: WED, valueOf: done(['2026-10-25']) });
    const sundayWeeks = evaluateStreak({ rules: [{ ...rule, timesPerPeriod: 1 }], createdDay: '2026-10-19', today: WED, valueOf: done(['2026-10-25']), weekStart: 6 });
    assert.deepEqual(mondayWeeks.periods.map((p) => p.start), ['2026-10-19', '2026-10-26']);
    assert.deepEqual(sundayWeeks.periods.map((p) => p.start), ['2026-10-19', '2026-10-25'], 'the first period starts where the habit does');
  });

  it('is stored as a setting with Monday as the default for files that predate it', () => {
    const settings = normalizeSettings({} as never);
    assert.equal(settings.weekStart, 'monday');
    assert.equal(normalizeSettings({ weekStart: 'sunday' } as never).weekStart, 'sunday');
    assert.equal(normalizeSettings({ weekStart: 'thursday' } as never).weekStart, 'monday', 'an unknown value is not kept');
  });
});

describe('undo: a manual record coming back replaces the import that filled its day', () => {
  const TODAY = '2026-10-26';
  const base = withPreset(buildEmptyState(TODAY), 'steps', 'h_steps');
  const manual: HabitEntry = { id: 'm1', habitId: 'h_steps', day: TODAY, at: at(TODAY, 12 * 60), zone: NY, value: 6000, source: 'MANUAL' };
  const synced: HabitEntry = { id: 'a1', habitId: 'h_steps', day: TODAY, at: at(TODAY, 12 * 60 + 30), zone: NY, value: 4000, source: 'AUTO_HC' };
  const otherDay: HabitEntry = { id: 'a2', habitId: 'h_steps', day: '2026-10-25', at: at('2026-10-25', 12 * 60), zone: NY, value: 3000, source: 'AUTO_HC' };

  it('evicts the same habit/day AUTO_HC entry and leaves other days alone', () => {
    const removed: TrackerState = { ...base, entries: [synced, otherDay] };
    const back = reducer(removed, { type: 'RESTORE_LOGS', records: [{ log: 'entry', record: manual }] });
    assert.deepEqual(back.entries.map((e) => e.id).sort(), ['a2', 'm1']);
  });

  it('does not touch anything when the restored record is itself an import', () => {
    const removed: TrackerState = { ...base, entries: [manual] };
    const back = reducer(removed, { type: 'RESTORE_LOGS', records: [{ log: 'entry', record: synced }] });
    assert.deepEqual(back.entries.map((e) => e.id).sort(), ['a1', 'm1']);
  });
});

describe('planner: the repeated hour when DST ends', () => {
  const policy = (over: Partial<NudgePolicy> & { habitId: string }): NudgePolicy => ({ kind: 'ROTATION', intervalMin: 60, onlyWhenBehind: false, maxPerDay: 8, enabled: true, ...over });
  const habit = (over: Partial<PlanHabit> & { id: string }): PlanHabit => ({ name: over.id, policy: policy({ habitId: over.id }), doneToday: false, donePeriod: false, todayRatio: 0, movement: false, ...over });
  // Midnight EDT, 1 November 2026: the clock reads 01:00–01:59 twice before 02:00 EST arrives.
  const nowMs = at('2026-11-01', 0);
  const today = trackingDayOf(nowMs, NY, 4); // 2026-10-31: the night belongs to Saturday's tracking day
  const input = (habits: PlanHabit[]): PlanInput => ({
    nowMs,
    zone: NY,
    today,
    boundaryHour: 4,
    settings: { activeStartMin: 0, activeEndMin: 4 * 60, dailyNudgeCap: 40, nudgeIntervalMin: 60, remindersEnabled: true, weeklySummary: { enabled: false, weekday: 6, minute: 18 * 60 }, waterGoalMl: 2000, tapSizeMl: 250 },
    habits,
    events: [],
    nudgeEvents: [],
    rotationCompletedToday: 0,
    swapOffset: 0,
  });
  /** The night's slots for the given habits, as the clock shows them (the next night's are planned too and left out). */
  const tonight = (ids: string[], plan: ReturnType<typeof planNudges>) => plan.filter((n) => n.day === today && ids.some((id) => n.habitIds.includes(id)));
  const clocks = (ids: string[], plan: ReturnType<typeof planNudges>) => tonight(ids, plan).map((n) => `${String(Math.floor(minutesOfDay(n.at, NY) / 60)).padStart(2, '0')}:${String(minutesOfDay(n.at, NY) % 60).padStart(2, '0')}`);

  it('an interval habit spends its budget on kept slots only: the 25-hour night still reaches 03:30', () => {
    const tea = habit({ id: 'tea', policy: policy({ habitId: 'tea', kind: 'INTERVAL', intervalMin: 30, activeStartMin: 0, activeEndMin: 4 * 60, maxPerDay: 8 }) });
    const plan = planNudges(input([tea]));
    const ids = plan.map((n) => n.id);
    assert.equal(new Set(ids).size, ids.length, 'one notification per identifier');
    // Every half hour from 00:30: the second 01:00 and 01:30 share ids with the first and are dropped
    // without spending the budget of eight, so the night runs to 03:30 (nine elapsed slots, seven kept).
    assert.deepEqual(clocks(['tea'], plan), ['00:30', '01:00', '01:30', '02:00', '02:30', '03:00', '03:30']);
  });

  it('the rotation neither advances nor charges a habit for a slot it dropped', () => {
    const a = habit({ id: 'a', snackType: 'SQUATS', movement: true, policy: policy({ habitId: 'a', maxPerDay: 3 }) });
    const b = habit({ id: 'b', snackType: 'WALK', movement: true, policy: policy({ habitId: 'b', maxPerDay: 3 }) });
    const plan = planNudges(input([a, b]));
    // Hourly from midnight: 01:00 (EDT), 01:00 (EST: same id, dropped), 02:00, 03:00 — a, b, a. A
    // rotation that advanced on the dropped slot would offer a, a, b.
    assert.deepEqual(clocks(['a', 'b'], plan), ['01:00', '02:00', '03:00']);
    assert.deepEqual(tonight(['a', 'b'], plan).map((n) => n.habitIds[0]), ['a', 'b', 'a'], 'the dropped slot did not take b\u2019s turn');
  });
});

describe('Today card countdown across the fold', () => {
  it('a one-hour snooze taken in the first 01:45 is sixty minutes away, not due', () => {
    const nowMs = Date.parse('2026-11-01T05:45:00Z'); // 01:45 EDT, the first time the clock shows it
    const today = trackingDayOf(nowMs, NY, 4);
    let s = withPreset(buildEmptyState(today), 'squat-snack', 'h_squat', '2026-10-01');
    s = { ...s, settings: { ...s.settings, dayBoundaryHour: 4, activeStartMin: 0, activeEndMin: 6 * 60, nudgeIntervalMin: 90, remindersEnabled: false }, nudgeSnoozedUntil: nowMs + 3_600_000 };
    const next = liveNudge(s, today, nowMs, NY);
    assert.ok(next);
    assert.equal(next.inMin, 60);
    assert.equal(next.dueMin, 105, 'due at the second 01:45');
    const later = liveNudge(s, today, nowMs + 30 * 60_000, NY);
    assert.ok(later);
    assert.equal(later.inMin, 30, 'half an hour later the wait shrank by thirty minutes, though the clock reads 01:15');
  });
});

describe('sleep: a night keeps the offsets it was slept at', () => {
  const zoneOffsetMin = (ms: number, zone: string) => Math.round(zoneOffsetAt(ms, zone) / 60_000);
  /** A night slept in `zone`, as the adapter would import it there: bed at `bedtimeMin` the evening before `day`, up at 07:00. */
  const night = (id: string, day: string, bedtimeMin: number, zone: string): SleepNight => {
    const startAt = at(addDays(day, -1), bedtimeMin, zone);
    const endAt = at(day, 7 * 60, zone);
    return { id, startAt, endAt, day, minutes: Math.round((endAt - startAt) / 60_000), startOffsetMin: zoneOffsetMin(startAt, zone), endOffsetMin: zoneOffsetMin(endAt, zone) };
  };

  it('offset helpers place an instant on the clock of the recording zone', () => {
    const ms = Date.parse('2026-11-03T02:30:00Z'); // 21:30 EST the evening before; 08:00 IST
    assert.equal(minutesAtOffset(ms, -5 * 60), 21 * 60 + 30);
    assert.equal(dayAtOffset(ms, -5 * 60), '2026-11-02');
    assert.equal(minutesAtOffset(ms, 330), 8 * 60);
    assert.equal(dayAtOffset(ms, 330), '2026-11-03');
  });

  it('a steady 23:00 bedtime stays steady across a trip; the clock shows the night as slept', () => {
    const sleep = [night('n1', '2026-11-02', 23 * 60, NY), night('n2', '2026-11-03', 23 * 60, NY), night('n3', '2026-11-04', 23 * 60, 'Asia/Kolkata')];
    const body = { ...EMPTY_BODY, sleep };
    assert.equal(bedtimeSpreadMin(body, '2026-11-04', 'Asia/Kolkata'), 0, 'read in Kolkata: the New York nights are still 23:00 nights');
    assert.equal(bedtimeSpreadMin(body, '2026-11-04', NY), 0);
    assert.equal(sleepClockMin(sleep[0]!, 'start', 'Asia/Kolkata'), 23 * 60);
    assert.equal(sleepClockMin(sleep[0]!, 'end', 'Asia/Kolkata'), 7 * 60);
    const legacy: SleepNight = { ...sleep[0]!, startOffsetMin: undefined, endOffsetMin: undefined };
    assert.equal(sleepClockMin(legacy, 'start', NY), 23 * 60, 'a night from before the field reads in the phone\u2019s zone, as it did');
  });

  it('a reread with the same times keeps the first placing; edited times take the new one', () => {
    const first = night('n1', '2026-11-02', 23 * 60, NY);
    const body = mergeBody(EMPTY_BODY, { sleep: [first] });
    // The same session read again after landing in Kolkata: the adapter would date it by the new zone.
    const reread: SleepNight = { ...first, day: '2026-11-03', startOffsetMin: 330, endOffsetMin: 330 };
    const after = mergeBody(body, { sleep: [reread] });
    assert.equal(after.sleep.length, 1);
    assert.equal(after.sleep[0]!.day, '2026-11-02');
    assert.equal(after.sleep[0]!.startOffsetMin, first.startOffsetMin);
    assert.equal(after, body, 'nothing changed, the same state object');
    const edited: SleepNight = { ...reread, endAt: first.endAt + 30 * 60_000, minutes: first.minutes + 30 };
    const moved = mergeBody(body, { sleep: [edited] });
    assert.equal(moved.sleep[0]!.day, '2026-11-03', 'an upstream edit is a new placing');
    assert.equal(moved.sleep[0]!.endOffsetMin, 330);
    assert.ok(nightEndingOn(moved, '2026-11-03'));
  });

  it('a night stored before the field existed is not given offsets by a reread', () => {
    const legacy: SleepNight = { id: 'n1', startAt: at('2026-11-01', 23 * 60), endAt: at('2026-11-02', 7 * 60), day: '2026-11-02', minutes: 480 };
    const body = mergeBody(EMPTY_BODY, { sleep: [legacy] });
    const reread: SleepNight = { ...legacy, startOffsetMin: -240, endOffsetMin: -300 };
    const after = mergeBody(body, { sleep: [reread] });
    assert.equal(after, body, 'same times: the stored placing (none) stands, so nothing is written');
  });
});
