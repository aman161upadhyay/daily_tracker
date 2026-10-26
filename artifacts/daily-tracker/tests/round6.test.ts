/// <reference types="node" />
/**
 * Council round 6 regressions: clock-time reminders across the DST nights (the skipped hour,
 * the repeated hour, the tracking day a 1:30 am slot belongs to), a settled nudge that outranks a
 * later-stamped snooze, orphaned follow-ups, snack-count caps, caches that survive unrelated
 * state changes, the backup policy's blind spot, AA contrast for the palette, and the volume
 * stepper reading ounces as ounces.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import colors from '../constants/colors';
import { hasUserData } from '../src/data/backupPolicy';
import { segmentStartOn } from '../src/domain/habits/streaks';
import type { Habit, MovementSnack, NudgeEvent, NudgePolicy, ScheduledEvent } from '../src/domain/models';
import { latestEvents, planNudges, type PlanHabit, type PlanInput } from '../src/domain/nudges/planner';
import { parseVolumeInput } from '../src/domain/time/format';
import { instantOf, minutesOfDay, trackingDayOf, zoneOffsetAt } from '../src/domain/time/trackingDay';
import { reducer } from '../src/state/reducer';
import { buildEmptyState } from '../src/state/seed';
import { cycleInsights, habitView, nudgePlan } from '../src/state/selectors';
import type { TrackerState } from '../src/state/types';

const ZONE = 'America/New_York';
const HOUR = 60 * 60_000;

const policy = (over: Partial<NudgePolicy> & { habitId: string }): NudgePolicy => ({
  kind: 'FIXED',
  onlyWhenBehind: false,
  maxPerDay: 8,
  enabled: true,
  ...over,
});
const planHabit = (over: Partial<PlanHabit> & { id: string }): PlanHabit => ({
  name: over.id,
  policy: policy({ habitId: over.id }),
  doneToday: false,
  donePeriod: false,
  todayRatio: 0,
  movement: false,
  ...over,
});
function input(over: Partial<PlanInput> & { nowMs: number; today: string }): PlanInput {
  return {
    zone: ZONE,
    boundaryHour: 3,
    settings: {
      activeStartMin: 9 * 60,
      activeEndMin: 21 * 60,
      dailyNudgeCap: 10,
      nudgeIntervalMin: 60,
      remindersEnabled: true,
      weeklySummary: { enabled: false, weekday: 0, minute: 18 * 60 },
      waterGoalMl: 2000,
      tapSizeMl: 250,
    },
    habits: [],
    rotationCompletedToday: 0,
    swapOffset: 0,
    events: [],
    nudgeEvents: [],
    ...over,
  };
}

describe('instantOf on the DST nights', () => {
  it('lands a minute the clock skips on the moment the clock jumps to, not the hour before', () => {
    // 2027-03-14: 02:00 EST becomes 03:00 EDT. 02:30 does not exist; the phone shows 03:30 then.
    const gap = instantOf('2027-03-14', 2 * 60 + 30, ZONE);
    assert.equal(minutesOfDay(gap, ZONE), 3 * 60 + 30);
    assert.equal(gap, instantOf('2027-03-14', 3 * 60 + 30, ZONE));
    assert.ok(gap > instantOf('2027-03-14', 1 * 60 + 59, ZONE));
  });

  it('resolves a minute the clock shows twice to its first occurrence', () => {
    // 2026-11-01: 02:00 EDT becomes 01:00 EST, so 01:30 happens twice.
    const first = instantOf('2026-11-01', 1 * 60 + 30, ZONE);
    assert.equal(zoneOffsetAt(first, ZONE), -4 * HOUR);
    assert.equal(minutesOfDay(first + HOUR, ZONE), 1 * 60 + 30);
  });

  it('is exact and monotonic on an ordinary day', () => {
    let prev = instantOf('2026-10-26', 0, ZONE);
    for (let m = 1; m < 24 * 60; m += 7) {
      const t = instantOf('2026-10-26', m, ZONE);
      assert.equal(minutesOfDay(t, ZONE), m);
      assert.ok(t > prev);
      prev = t;
    }
  });
});

describe('planner — the tracking day a slot belongs to', () => {
  // 00:30 on Nov 1: the calendar day is Nov 1, the tracking day (3 am boundary) is still Oct 31.
  const now = instantOf('2026-11-01', 30, ZONE);
  const lateFixed = planHabit({ id: 'tea', doneToday: true, policy: policy({ habitId: 'tea', times: ['01:30', '09:00'], maxPerDay: 2 }) });

  it('suppresses a 1:30 am reminder for a habit already done this tracking day, but not the 9 am one', () => {
    const plan = planNudges(input({ nowMs: now, today: '2026-10-31', habits: [lateFixed], horizonMs: 12 * HOUR }));
    const times = plan.map((n) => `${n.day} ${minutesOfDay(n.at, ZONE)}`);
    assert.ok(!times.includes('2026-11-01 90'), `1:30 am slot should be settled: ${times.join(', ')}`);
    assert.ok(times.includes('2026-11-01 540'), `9 am slot belongs to the next tracking day: ${times.join(', ')}`);
  });

  it('keeps the 1:30 am reminder when the boundary is midnight (it is a new tracking day then)', () => {
    const plan = planNudges(input({ nowMs: now, today: '2026-11-01', boundaryHour: 0, habits: [lateFixed], horizonMs: 12 * HOUR }));
    // Done "today" (Nov 1 tracking day) suppresses both: the habit is done for the day both slots fall in.
    assert.equal(plan.length, 0);
    const fresh = planNudges(input({ nowMs: now, today: '2026-11-01', boundaryHour: 0, habits: [{ ...lateFixed, doneToday: false }], horizonMs: 12 * HOUR }));
    assert.deepEqual(fresh.map((n) => minutesOfDay(n.at, ZONE)).sort((a, b) => a - b), [90, 540]);
  });

  it('never emits two slots with one id across the repeated hour', () => {
    const sip = planHabit({ id: 'sip', policy: policy({ habitId: 'sip', kind: 'INTERVAL', intervalMin: 30, activeStartMin: 0, activeEndMin: 4 * 60, maxPerDay: 20 }) });
    const plan = planNudges(input({ nowMs: instantOf('2026-10-31', 23 * 60 + 50, ZONE), today: '2026-10-31', habits: [sip], horizonMs: 6 * HOUR }));
    const ids = plan.map((n) => n.id);
    assert.equal(new Set(ids).size, ids.length, `duplicate ids: ${ids.join(', ')}`);
    assert.ok(plan.length >= 6, `expected a slot every half hour through the night, got ${plan.length}`);
    for (let i = 1; i < plan.length; i++) assert.ok(plan[i]!.at > plan[i - 1]!.at);
  });

  it('drops a one-off event whose habit is no longer in play', () => {
    const squat = planHabit({ id: 'squat', movement: true, snackType: 'SQUATS', policy: policy({ habitId: 'squat', kind: 'NONE', enabled: false }) });
    const events: ScheduledEvent[] = [
      { id: 'ev-live', habitId: 'squat', at: now + HOUR, zone: ZONE, day: '2026-10-31', title: 'Walk', body: 'two minutes' },
      { id: 'ev-gone', habitId: 'archived-habit', at: now + 2 * HOUR, zone: ZONE, day: '2026-10-31', title: 'Walk', body: 'two minutes' },
    ];
    const plan = planNudges(input({ nowMs: now, today: '2026-10-31', habits: [squat], eventHabitIds: ['squat'], events, horizonMs: 6 * HOUR }));
    assert.deepEqual(plan.map((n) => n.id), ['event:ev-live']);
    // Without the list (older callers, tests) every event stays eligible.
    assert.equal(planNudges(input({ nowMs: now, today: '2026-10-31', habits: [squat], events, horizonMs: 6 * HOUR })).length, 2);
  });
});

describe('latestEvents', () => {
  const ev = (kind: NudgeEvent['kind'], at: number, untilMs?: number): NudgeEvent => ({ id: `${kind}-${at}`, nudgeId: 'fix:tea:2026-10-31:09:00', habitIds: ['tea'], at, zone: ZONE, day: '2026-10-31', kind, ...(untilMs !== undefined ? { untilMs } : {}) });

  it('lets a done outrank a snooze stamped later (the clock was set back in between)', () => {
    const done = ev('DONE', 1000);
    const snoozed = ev('SNOOZED', 5000, 900_000);
    assert.equal(latestEvents([snoozed, done]).get(done.nudgeId)?.kind, 'DONE');
    assert.equal(latestEvents([done, snoozed]).get(done.nudgeId)?.kind, 'DONE');
  });

  it('a drink on a merged nudge leaves the movement half open (water, then snooze, snooze wins)', () => {
    const water = ev('WATER', 1000);
    const snoozed = ev('SNOOZED', 1000, 900_000);
    assert.equal(latestEvents([water, snoozed]).get(water.nudgeId)?.kind, 'SNOOZED');
    assert.equal(latestEvents([water, ev('DONE', 1000)]).get(water.nudgeId)?.kind, 'DONE');
  });

  it('still orders movable events by time (fired, then snoozed, then fired again)', () => {
    const fired = ev('FIRED', 1000);
    const snoozed = ev('SNOOZED', 2000, 900_000);
    const again = ev('FIRED', 3000);
    assert.equal(latestEvents([fired, snoozed]).get(fired.nudgeId)?.kind, 'SNOOZED');
    assert.equal(latestEvents([again, snoozed, fired]).get(fired.nudgeId)?.at, 3000);
  });

  it('the planner never re-offers a done nudge however the snooze is stamped', () => {
    const now = instantOf('2026-10-31', 8 * 60, ZONE);
    const tea = planHabit({ id: 'tea', policy: policy({ habitId: 'tea', times: ['09:00'], maxPerDay: 1 }) });
    const nudgeEvents = [ev('SNOOZED', now + 10 * 60_000, now + 25 * 60_000), ev('DONE', now + 5 * 60_000)];
    assert.equal(planNudges(input({ nowMs: now, today: '2026-10-31', habits: [tea], nudgeEvents, horizonMs: 6 * HOUR })).length, 0);
  });
});

describe('reducer — habits leaving take their follow-ups along', () => {
  const habit: Habit = { id: 'h1', name: 'Squat snack', category: 'movement', type: 'COUNT', unit: 'snacks', icon: 'squat', createdDay: '2026-10-01', archived: false, pinned: false, snackType: 'SQUATS' };
  const event: ScheduledEvent = { id: 'ev', habitId: 'h1', at: 1, zone: ZONE, day: '2026-10-31', title: 'Walk', body: '' };
  const base = reducer(reducer(buildEmptyState('2026-10-31'), { type: 'ADD_HABIT', habit, rule: { habitId: 'h1', effectiveFrom: '2026-10-01', cadence: 'DAILY', timesPerPeriod: 1, target: 3, freezesPerMonth: 0 }, policy: policy({ habitId: 'h1', kind: 'ROTATION' }) }), { type: 'SCHEDULE_EVENT', event });

  it('archiving removes the habit’s scheduled events; a plain rename does not', () => {
    assert.equal(base.events.length, 1);
    assert.equal(reducer(base, { type: 'UPDATE_HABIT', id: 'h1', patch: { archived: true } }).events.length, 0);
    assert.equal(reducer(base, { type: 'UPDATE_HABIT', id: 'h1', patch: { name: 'Squats' } }).events.length, 1);
    assert.equal(reducer(base, { type: 'UPDATE_HABIT', id: 'other', patch: { archived: true } }).events.length, 1);
  });

  it('deleting removes them too', () => {
    assert.equal(reducer(base, { type: 'DELETE_HABIT', id: 'h1' }).events.length, 0);
  });

  it('LOG_SNACKS appends every snack in one step and is a no-op when empty', () => {
    const snack = (i: number): MovementSnack => ({ id: `s${i}`, at: i, zone: ZONE, day: '2026-10-31', type: 'SQUATS', reps: 10, trigger: 'MANUAL' });
    const next = reducer(base, { type: 'LOG_SNACKS', snacks: [snack(1), snack(2), snack(3)] });
    assert.equal(next.snacks.length, 3);
    assert.equal(reducer(base, { type: 'LOG_SNACKS', snacks: [] }), base);
  });
});

describe('backup policy', () => {
  it('counts an imported heart-rate history as data worth keeping', () => {
    const empty = buildEmptyState('2026-10-31');
    assert.equal(hasUserData(empty), false);
    const withHeart: TrackerState = { ...empty, body: { ...empty.body, heart: [{ day: '2026-10-30', resting: 58, source: 'HEALTH_CONNECT' } as never] } };
    assert.equal(hasUserData(withHeart), true);
  });
});

describe('selector caches', () => {
  const habit: Habit = { id: 'read', name: 'Read', category: 'mind', type: 'COUNT', unit: 'pages', icon: 'book', createdDay: '2025-01-01', archived: false, pinned: false };
  const state = reducer(buildEmptyState('2026-10-31'), { type: 'ADD_HABIT', habit, rule: { habitId: 'read', effectiveFrom: '2025-01-01', cadence: 'DAILY', timesPerPeriod: 1, target: 10, freezesPerMonth: 0 }, policy: policy({ habitId: 'read', kind: 'NONE', enabled: false }) });
  const stored = state.habits.find((h) => h.id === 'read')!;

  it('hands out one HabitView per habit and day per state, and never the stored view for a draft', () => {
    const a = habitView(state, stored, '2026-10-31');
    assert.equal(habitView(state, stored, '2026-10-31'), a);
    assert.notEqual(habitView(state, stored, '2026-10-30'), a);
    const draft = { ...stored, name: 'Read more' };
    const d = habitView(state, draft, '2026-10-31');
    assert.notEqual(d, a);
    assert.equal(d.habit, draft);
    assert.equal(habitView(state, stored, '2026-10-31'), a);
  });

  it('a cadence that never changed has one segment, however old the habit is', () => {
    const rules = [{ habitId: 'read', effectiveFrom: '2025-01-01', cadence: 'DAILY' as const, timesPerPeriod: 1, target: 10, freezesPerMonth: 0 }];
    assert.equal(segmentStartOn(rules, '2020-01-01', '2026-10-31'), '2020-01-01');
    const weekly = [{ ...rules[0]!, cadence: 'WEEKLY' as const, timesPerPeriod: 3 }];
    assert.equal(segmentStartOn(weekly, '2020-01-01', '2026-10-31'), '2020-01-01');
  });

  it('cycle insights are reused across states that did not touch what they read', () => {
    const first = cycleInsights(state);
    const tapped = reducer(state, { type: 'ADD_WATER', entry: { id: 'w1', at: 1, zone: ZONE, day: '2026-10-31', ml: 250, source: 'MANUAL' } });
    assert.equal(cycleInsights(tapped), first);
  });

  it('the nudge plan cache keys on the tracking day and zone, not only the minute', () => {
    const now = instantOf('2026-10-31', 12 * 60, ZONE);
    const a = nudgePlan(state, '2026-10-31', now, ZONE);
    assert.equal(nudgePlan(state, '2026-10-31', now, ZONE), a);
    assert.notEqual(nudgePlan(state, '2026-10-31', now, 'Europe/London'), a);
    assert.notEqual(nudgePlan(state, '2026-10-30', now, ZONE), a);
  });
});

describe('palette contrast (WCAG AA for body-size text)', () => {
  const lum = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  };
  const ratio = (a: string, b: string) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi! + 0.05) / (lo! + 0.05);
  };
  for (const scheme of ['dark', 'light'] as const) {
    const p = colors[scheme];
    it(`${scheme}: secondary and tertiary text read on every surface, button text on its button`, () => {
      for (const surface of [p.bg, p.surface, p.surfaceRaised]) {
        assert.ok(ratio(p.text, surface) >= 7, `${scheme} text on ${surface}: ${ratio(p.text, surface).toFixed(2)}`);
        assert.ok(ratio(p.textSecondary, surface) >= 4.5, `${scheme} secondary on ${surface}: ${ratio(p.textSecondary, surface).toFixed(2)}`);
        assert.ok(ratio(p.textTertiary, surface) >= 4.5, `${scheme} tertiary on ${surface}: ${ratio(p.textTertiary, surface).toFixed(2)}`);
      }
      assert.ok(ratio(p.onGreen, p.green) >= 4.5, `${scheme} onGreen on green: ${ratio(p.onGreen, p.green).toFixed(2)}`);
      assert.ok(ratio(p.primaryForeground, p.primary) >= 4.5, `${scheme} primary button text: ${ratio(p.primaryForeground, p.primary).toFixed(2)}`);
    });
  }
});

describe('parseVolumeInput', () => {
  it('reads the number in the unit shown', () => {
    assert.equal(parseVolumeInput('1,850 ml', 'ml'), 1850);
    assert.equal(parseVolumeInput('2000', 'ml'), 2000);
    assert.equal(parseVolumeInput('64 oz', 'oz'), 1893);
    assert.equal(parseVolumeInput('64', 'oz'), 1893);
    assert.equal(parseVolumeInput('8.5', 'oz'), 251);
  });

  it('refuses what is not a number', () => {
    assert.equal(parseVolumeInput('', 'ml'), null);
    assert.equal(parseVolumeInput('   ', 'oz'), null);
    assert.equal(parseVolumeInput('oz', 'oz'), null);
  });
});

describe('trackingDayOf around the boundary (sanity for the planner tests above)', () => {
  it('00:30 on Nov 1 is still Oct 31 with a 3 am boundary', () => {
    assert.equal(trackingDayOf(instantOf('2026-11-01', 30, ZONE), ZONE, 3), '2026-10-31');
    assert.equal(trackingDayOf(instantOf('2026-11-01', 30, ZONE), ZONE, 0), '2026-11-01');
  });
});
