/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { NudgeEvent, NudgePolicy } from '../src/domain/models';
import { planNudges, shortName, type PlanHabit, type PlanInput, type ScheduledNudge } from '../src/domain/nudges/planner';
import { instantOf, minutesOfDay } from '../src/domain/time/trackingDay';

const ZONE = 'America/New_York';
const TODAY = '2026-10-25'; // a Sunday
const at = (day: string, hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return instantOf(day, h! * 60 + m!, ZONE);
};
const clock = (n: ScheduledNudge) => {
  const min = minutesOfDay(n.at, ZONE);
  return `${n.day} ${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
};

const policy = (over: Partial<NudgePolicy> & { habitId: string }): NudgePolicy => ({
  kind: 'ROTATION',
  intervalMin: 60,
  onlyWhenBehind: false,
  maxPerDay: 8,
  enabled: true,
  ...over,
});

const habit = (over: Partial<PlanHabit> & { id: string }): PlanHabit => ({
  name: over.id,
  policy: policy({ habitId: over.id }),
  doneToday: false,
  donePeriod: false,
  todayRatio: 0,
  movement: false,
  ...over,
});

const squats = habit({ id: 'squats', name: 'Squat snack', snackType: 'SQUATS', movement: true });
const walk = habit({ id: 'walk', name: 'Walk break', snackType: 'WALK', movement: true, policy: policy({ habitId: 'walk', kind: 'INTERVAL' }) });
const meditate = habit({ id: 'meditate', name: 'Meditate', policy: policy({ habitId: 'meditate', kind: 'FIXED', times: ['07:30'], maxPerDay: 1 }) });
const read = habit({ id: 'read', name: 'Read 10 pages', policy: policy({ habitId: 'read', kind: 'FIXED', times: ['21:30'], maxPerDay: 1 }) });

function input(over: Partial<PlanInput> = {}): PlanInput {
  return {
    nowMs: at(TODAY, '14:30'),
    zone: ZONE,
    today: TODAY,
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
    habits: [squats, walk],
    rotationCompletedToday: 0,
    swapOffset: 0,
    events: [],
    nudgeEvents: [],
    ...over,
  };
}

const todayOnly = (plan: ScheduledNudge[]) => plan.filter((n) => n.day === TODAY);

describe('planNudges — rotation and active hours', () => {
  it('fills the rest of the active day with hourly slots and stops before the end', () => {
    const plan = todayOnly(planNudges(input()));
    assert.deepEqual(
      plan.map(clock),
      ['2026-10-25 15:00', '2026-10-25 16:00', '2026-10-25 17:00', '2026-10-25 18:00', '2026-10-25 19:00', '2026-10-25 20:00'],
    );
    assert.ok(plan.every((n) => minutesOfDay(n.at, ZONE) < 21 * 60));
  });

  it('alternates snacks from the pending slot and offers Swap when there is a choice', () => {
    // The rotation advances per completed snack, like the Today card, so the first pending slot is squats.
    const plan = todayOnly(planNudges(input()));
    assert.deepEqual(plan.slice(0, 3).map((n) => n.habitIds[0]), ['squats', 'walk', 'squats']);
    assert.ok(plan[0]!.actions.includes('SWAP'));
    const solo = todayOnly(planNudges(input({ habits: [squats] })));
    assert.ok(!solo[0]!.actions.includes('SWAP'));
  });

  it('anchors the series one interval after the last snack', () => {
    const plan = todayOnly(planNudges(input({ habits: [{ ...squats, lastLogMs: at(TODAY, '14:10') }, walk], rotationCompletedToday: 1 })));
    assert.equal(clock(plan[0]!), '2026-10-25 15:10');
    assert.equal(plan[0]!.habitIds[0], 'walk', 'the rotation advanced past the snack just done');
  });

  it('plans tomorrow from the start of active hours and nothing after the horizon', () => {
    const plan = planNudges(input());
    const tomorrow = plan.filter((n) => n.day === '2026-10-26');
    assert.equal(clock(tomorrow[0]!), '2026-10-26 10:00');
    assert.ok(plan.every((n) => n.at <= at(TODAY, '14:30') + 36 * 3_600_000));
  });

  it('emits nothing once the active day is over, except tomorrow', () => {
    const plan = planNudges(input({ nowMs: at(TODAY, '21:30') }));
    assert.equal(todayOnly(plan).length, 0);
    assert.ok(plan.some((n) => n.day === '2026-10-26'));
  });

  it('drops a habit that is done for today and one whose week is complete', () => {
    const plan = todayOnly(planNudges(input({ habits: [{ ...squats, doneToday: true }, walk, { ...read, donePeriod: true }] })));
    assert.ok(plan.every((n) => n.habitIds[0] === 'walk'));
  });

  it('respects each habit\'s maxPerDay inside the shared rotation', () => {
    const plan = todayOnly(planNudges(input({ habits: [{ ...squats, policy: policy({ habitId: 'squats', maxPerDay: 1 }) }, walk] })));
    assert.equal(plan.filter((n) => n.habitIds[0] === 'squats').length, 1);
    assert.equal(plan.filter((n) => n.habitIds[0] === 'walk').length, 5);
    const fired: NudgeEvent[] = [
      { id: 'f', nudgeId: 'rot:x', habitIds: ['squats'], at: at(TODAY, '12:00'), zone: ZONE, day: TODAY, kind: 'FIRED' },
      { id: 'd', nudgeId: 'rot:x', habitIds: ['squats'], at: at(TODAY, '12:01'), zone: ZONE, day: TODAY, kind: 'DONE' },
    ];
    const after = todayOnly(planNudges(input({ habits: [{ ...squats, policy: policy({ habitId: 'squats', maxPerDay: 1 }) }, walk], nudgeEvents: fired })));
    assert.equal(after.filter((n) => n.habitIds[0] === 'squats').length, 0, 'a nudge that already fired uses up the budget');
    // Done pressed on the Today card settles a slot that never rang: no delivery, no budget spent.
    const pressed = todayOnly(planNudges(input({ habits: [{ ...squats, policy: policy({ habitId: 'squats', maxPerDay: 1 }) }, walk], nudgeEvents: [fired[1]!] })));
    assert.equal(pressed.filter((n) => n.habitIds[0] === 'squats').length, 1, 'a card press is not a ring');
  });

  it('is deterministic: the same input gives the same ids and times', () => {
    const a = planNudges(input());
    const b = planNudges(input());
    assert.deepEqual(a, b);
  });
});

describe('planNudges — caps, merges and history', () => {
  it('never plans more automatic nudges than the daily cap, counting those already fired', () => {
    const fired: NudgeEvent[] = [1, 2, 3].map((i) => ({
      id: `e${i}`,
      nudgeId: `old-${i}`,
      habitIds: ['squats'],
      at: at(TODAY, `1${i}:00`),
      zone: ZONE,
      day: TODAY,
      kind: 'FIRED',
    }));
    const plan = todayOnly(planNudges(input({ settings: { ...input().settings, dailyNudgeCap: 5 }, nudgeEvents: fired })));
    assert.equal(plan.length, 2);
  });

  it('merges two nudges closer than five minutes into one', () => {
    const fixed = habit({ id: 'stairs', name: 'Stair sprint', snackType: 'STAIRS', movement: true, policy: policy({ habitId: 'stairs', kind: 'FIXED', times: ['15:03'], maxPerDay: 1 }) });
    const plan = todayOnly(planNudges(input({ habits: [squats, fixed] })));
    const three = plan.filter((n) => minutesOfDay(n.at, ZONE) >= 15 * 60 && minutesOfDay(n.at, ZONE) < 15 * 60 + 5);
    assert.equal(three.length, 1);
    assert.deepEqual(three[0]!.habitIds, ['squats', 'stairs']);
    assert.equal(three[0]!.title, 'Time for a break');
    // The body names both habits, so a Done on the merged card is an informed one.
    assert.match(three[0]!.body, /squats/i);
    assert.match(three[0]!.body, /Stair sprint/);
    assert.equal('line' in three[0]!, false);
  });

  it('a long habit name is cut for the one-line title', () => {
    const long = 'Walk to the far end of the office and back without the phone';
    const h = habit({ id: 'long', name: long, policy: policy({ habitId: 'long', kind: 'FIXED', times: ['16:00'], maxPerDay: 1 }) });
    const n = todayOnly(planNudges(input({ habits: [h] }))).find((x) => x.habitIds.includes('long'))!;
    assert.equal(n.title.length <= 40, true);
    assert.ok(n.title.endsWith('…'));
    assert.equal(shortName('Short'), 'Short');
  });

  it('two timed reminders merged keep both names (not "Time for it · Time for it")', () => {
    const a = habit({ id: 'a', name: 'Vitamins', policy: policy({ habitId: 'a', kind: 'FIXED', times: ['15:00'], maxPerDay: 1 }) });
    const b = habit({ id: 'b', name: 'Call mum', policy: policy({ habitId: 'b', kind: 'FIXED', times: ['15:02'], maxPerDay: 1 }) });
    const plan = todayOnly(planNudges(input({ habits: [a, b] })));
    const merged = plan.find((n) => n.habitIds.length === 2)!;
    assert.ok(merged);
    assert.equal(merged.body, 'Vitamins · Call mum');
  });

  it('does not re-plan a slot that already fired, and moves a snoozed slot only', () => {
    const base = todayOnly(planNudges(input()));
    const [first, second] = base;
    const events: NudgeEvent[] = [
      { id: 'a', nudgeId: first!.id, habitIds: first!.habitIds, at: at(TODAY, '15:00'), zone: ZONE, day: TODAY, kind: 'FIRED' },
      { id: 'b', nudgeId: second!.id, habitIds: second!.habitIds, at: at(TODAY, '16:00'), zone: ZONE, day: TODAY, kind: 'SNOOZED', untilMs: at(TODAY, '16:20') },
    ];
    const plan = todayOnly(planNudges(input({ nowMs: at(TODAY, '16:01'), nudgeEvents: events })));
    assert.ok(!plan.some((n) => n.id === first!.id));
    const moved = plan.find((n) => n.id === second!.id);
    assert.equal(moved && clock(moved), '2026-10-25 16:20');
    assert.deepEqual(moved!.habitIds, second!.habitIds, 'a snooze re-offers the same snack');
    assert.equal(clock(plan[1]!), '2026-10-25 17:00', 'later slots keep their time');
  });

  it('re-offers a swapped slot right away with the next snack', () => {
    const base = todayOnly(planNudges(input()));
    const first = base[0]!;
    assert.equal(first.habitIds[0], 'squats');
    const events: NudgeEvent[] = [{ id: 's', nudgeId: first.id, habitIds: first.habitIds, at: at(TODAY, '15:00'), zone: ZONE, day: TODAY, kind: 'SWAPPED' }];
    const plan = todayOnly(planNudges(input({ nowMs: at(TODAY, '15:00') + 10_000, nudgeEvents: events, swapOffset: 1 })));
    const again = plan.find((n) => n.id === first.id);
    assert.ok(again, 'the slot is offered again');
    assert.equal(again!.habitIds[0], 'walk');
    assert.ok(again!.at > at(TODAY, '15:00'));
  });

  it('collapses the live "snooze all" onto one nudge', () => {
    const plan = todayOnly(planNudges(input({ snoozedUntilMs: at(TODAY, '16:30') })));
    assert.equal(clock(plan[0]!), '2026-10-25 16:30');
    assert.deepEqual(plan[0]!.habitIds, ['squats', 'walk']);
    assert.equal(clock(plan[1]!), '2026-10-25 17:00');
  });
});

describe('planNudges — fixed times, water, events, summary', () => {
  it('keeps explicit clock times even outside active hours and skips those already past', () => {
    const plan = planNudges(input({ habits: [meditate, read] }));
    assert.deepEqual(todayOnly(plan).map(clock), ['2026-10-25 21:30']);
    assert.ok(plan.some((n) => clock(n) === '2026-10-26 07:30'));
  });

  it('honours onlyWhenBehind for fixed check-ins', () => {
    const steps = habit({ id: 'steps', policy: policy({ habitId: 'steps', kind: 'FIXED', times: ['19:00'], onlyWhenBehind: true, maxPerDay: 1 }) });
    assert.equal(todayOnly(planNudges(input({ habits: [{ ...steps, todayRatio: 0.7 }] }))).length, 0);
    assert.equal(todayOnly(planNudges(input({ habits: [{ ...steps, todayRatio: 0.3 }] }))).length, 1);
  });

  it('plans water checks only while behind pace and never past the goal', () => {
    const water = { habitId: 'h_water', loggedMl: 500, lastTapMs: at(TODAY, '13:00'), intervalMin: 90 };
    const behind = todayOnly(planNudges(input({ habits: [], water })));
    // 13:00 + 90 min = 14:30 is "now" (already delivered); the next check is 16:00.
    assert.deepEqual(behind.map(clock), ['2026-10-25 16:00', '2026-10-25 17:30', '2026-10-25 19:00', '2026-10-25 20:30']);
    assert.ok(behind.every((n) => n.kind === 'WATER' && n.waterMl === 250));
    const onPace = todayOnly(planNudges(input({ habits: [], water: { ...water, loggedMl: 1200 } })));
    assert.ok(onPace.length < behind.length);
    assert.ok(onPace.every((n) => minutesOfDay(n.at, ZONE) >= 17 * 60), 'nothing until pace would be lost again');
    assert.equal(todayOnly(planNudges(input({ habits: [], water: { ...water, loggedMl: 2000 } }))).length, 0);
  });

  it('merges a water check with a movement slot and keeps the +water action', () => {
    const water = { habitId: 'h_water', loggedMl: 0, lastTapMs: at(TODAY, '13:58'), intervalMin: 60 };
    const plan = todayOnly(planNudges(input({ water })));
    const first = plan[0]!;
    assert.equal(clock(first), '2026-10-25 14:58');
    assert.deepEqual(first.habitIds, ['h_water', 'squats']);
    assert.ok(first.actions.includes('WATER'));
  });

  it('includes one-off events outside the cap', () => {
    const events = [{ id: 'shield-1', habitId: 'shield', at: at(TODAY, '14:50'), zone: ZONE, day: TODAY, title: 'Post-meal walk', body: '2 minutes.' }];
    const plan = todayOnly(planNudges(input({ settings: { ...input().settings, dailyNudgeCap: 0 }, events })));
    assert.deepEqual(plan.map((n) => n.kind), ['EVENT']);
  });

  it('schedules the weekly summary at the chosen time and never twice', () => {
    const settings = { ...input().settings, weeklySummary: { enabled: true, weekday: 6, minute: 18 * 60 } };
    const plan = planNudges(input({ settings, weekSummary: { title: 'Your week', body: '5 of 7.' } }));
    const summaries = plan.filter((n) => n.kind === 'SUMMARY');
    assert.equal(summaries.length, 1);
    assert.equal(clock(summaries[0]!), '2026-10-25 18:00');
    const seen: NudgeEvent[] = [{ id: 'x', nudgeId: summaries[0]!.id, habitIds: [], at: 0, zone: ZONE, day: TODAY, kind: 'FIRED' }];
    assert.equal(planNudges(input({ settings, weekSummary: { title: 'Your week', body: '' }, nudgeEvents: seen })).filter((n) => n.kind === 'SUMMARY').length, 0);
  });

  it('is silent in off mode and when reminders are off', () => {
    assert.equal(planNudges(input({ settings: { ...input().settings, remindersEnabled: false } })).length, 0);
    const off = planNudges(input({ settings: { ...input().settings, offUntil: at('2026-10-26', '12:00') } }));
    assert.ok(off.length > 0);
    assert.ok(off.every((n) => n.at >= at('2026-10-26', '12:00')));
  });
});

describe('planNudges — DST', () => {
  it('keeps wall-clock slots across the fall-back night (no double hour, no skipped day)', () => {
    const sat = '2026-10-31';
    const plan = planNudges(input({ today: sat, nowMs: at(sat, '20:30') }));
    const sunday = plan.filter((n) => n.day === '2026-11-01');
    assert.equal(clock(sunday[0]!), '2026-11-01 10:00');
    // 10:00 EST is 15:00 UTC; the day gained an hour, which must not shift the slot.
    assert.equal(new Date(sunday[0]!.at).toISOString(), '2026-11-01T15:00:00.000Z');
    const minutes = sunday.map((n) => minutesOfDay(n.at, ZONE));
    assert.deepEqual(minutes, [...new Set(minutes)], 'no slot appears twice');
  });

  it('keeps wall-clock slots across the spring-forward night', () => {
    const sat = '2026-03-07';
    const plan = planNudges(input({ today: sat, nowMs: at(sat, '20:30'), habits: [squats, meditate] }));
    const sunday = plan.filter((n) => n.day === '2026-03-08');
    assert.equal(clock(sunday[0]!), '2026-03-08 07:30');
    assert.equal(new Date(sunday[0]!.at).toISOString(), '2026-03-08T11:30:00.000Z');
    assert.equal(clock(sunday[1]!), '2026-03-08 10:00');
  });
});
