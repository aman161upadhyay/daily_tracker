/// <reference types="node" />
/**
 * Council round 11 regressions: deliveries counted per occurrence by the planner (a slot that rang
 * twice spent two, a snooze does not un-ring), a tap that writes nothing, the bookkeeping record
 * that reads a dead sync's intents back (cancelled is not delivered, scheduled is in the ledger),
 * the paused policy the editor leaves paused, the reminder card's next-ring line.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { NudgeEvent, NudgePolicy } from '../src/domain/models';
import { planNudges, type PlanHabit, type PlanInput, type ScheduledNudge } from '../src/domain/nudges/planner';
import { instantOf, minutesOfDay } from '../src/domain/time/trackingDay';
import { describePolicy, isPaused, nextRingText, normalizeWeekdays, policyFromDraft, weekdaysText } from '../src/domain/nudges/describePolicy';
import { validateRecords, ValidationError } from '../src/data/validate';
import { EMPTY_BOOKKEEPING, OVERDUE_GRACE_MS, deliveries, parseBookkeeping, type LedgerEntry } from '../src/services/deliveryJournal';

const ZONE = 'America/New_York';
const TODAY = '2026-10-25';
const at = (day: string, hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return instantOf(day, h! * 60 + m!, ZONE);
};
const clock = (n: ScheduledNudge) => {
  const min = minutesOfDay(n.at, ZONE);
  return `${n.day} ${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
};
const policy = (over: Partial<NudgePolicy> & { habitId: string }): NudgePolicy => ({ kind: 'FIXED', times: ['07:30', '19:00'], onlyWhenBehind: false, maxPerDay: 2, enabled: true, ...over });
const habit = (over: Partial<PlanHabit> & { id: string }): PlanHabit => ({ name: over.id, policy: policy({ habitId: over.id }), doneToday: false, donePeriod: false, todayRatio: 0, movement: false, ...over });
const tea = habit({ id: 'tea' });
const input = (over: Partial<PlanInput> = {}): PlanInput => ({
  nowMs: at(TODAY, '08:00'),
  zone: ZONE,
  today: TODAY,
  settings: { activeStartMin: 9 * 60, activeEndMin: 21 * 60, dailyNudgeCap: 2, nudgeIntervalMin: 60, remindersEnabled: true, weeklySummary: { enabled: false, weekday: 0, minute: 18 * 60 }, waterGoalMl: 2000, tapSizeMl: 250 },
  habits: [tea],
  rotationCompletedToday: 0,
  swapOffset: 0,
  events: [],
  nudgeEvents: [],
  ...over,
});
const ev = (nudgeId: string, kind: NudgeEvent['kind'], atMs: number, extra: Partial<NudgeEvent> = {}): NudgeEvent => ({ id: `${nudgeId}|${kind}|${atMs}`, nudgeId, habitIds: ['tea'], at: atMs, zone: ZONE, day: TODAY, kind, ...extra });
const today = (plan: ScheduledNudge[]) => plan.filter((n) => n.day === TODAY).map(clock);

describe('planner: deliveries are counted per occurrence', () => {
  const slot = `fix:tea:${TODAY}:07:30`;

  it('a slot that rang, was snoozed and rang again spent two of the budget and the cap', () => {
    const twice = [ev(slot, 'FIRED', at(TODAY, '07:30')), ev(slot, 'SNOOZED', at(TODAY, '07:31'), { untilMs: at(TODAY, '07:46') }), ev(slot, 'FIRED', at(TODAY, '07:46'))];
    assert.deepEqual(today(planNudges(input({ nudgeEvents: twice }))), [], 'maxPerDay 2 and the cap of 2 are both spent');
    const once = [ev(slot, 'FIRED', at(TODAY, '07:30'))];
    assert.deepEqual(today(planNudges(input({ nudgeEvents: once }))), [`${TODAY} 19:00`]);
  });

  it('a snooze on top of a ring does not un-ring it', () => {
    const snoozed = [ev(slot, 'FIRED', at(TODAY, '07:30')), ev(slot, 'SNOOZED', at(TODAY, '07:31'), { untilMs: at(TODAY, '08:30') })];
    const plan = planNudges(input({ nudgeEvents: snoozed, settings: { ...input().settings, dailyNudgeCap: 1 } }));
    assert.deepEqual(today(plan), [], 'the cap of one was spent by the ring; the re-offer waits for tomorrow');
  });

  it('a merged notification counts once however many slots it stood for', () => {
    const via = `fix:tea:${TODAY}:07:30`;
    const other = habit({ id: 'juice', policy: policy({ habitId: 'juice', times: ['07:30', '20:00'] }) });
    const merged = [ev(via, 'FIRED', at(TODAY, '07:30'), { habitIds: ['tea', 'juice'] }), ev(`fix:juice:${TODAY}:07:30`, 'FIRED', at(TODAY, '07:30'), { habitIds: ['tea', 'juice'], via })];
    const plan = planNudges(input({ habits: [tea, other], nudgeEvents: merged }));
    assert.equal(today(plan).length, 1, 'one ring spent one of the cap of two: one more today');
  });
});

describe('bookkeeping: a dead sync is read back', () => {
  const entry = (id: string, atMs: number, sig = 'x'): LedgerEntry => ({ id, habitIds: ['h'], day: TODAY, at: atMs, sig });
  const NOW = at(TODAY, '12:00');

  it('an id that was being cancelled and is gone did not ring', () => {
    const bk = { ledger: [entry('a', NOW + 3_600_000), entry('b', NOW - 60_000)], cancelling: ['a'], scheduling: [] };
    const { fired, live } = deliveries(bk, new Set<string>(), NOW);
    assert.deepEqual(fired.map((f) => f.id), ['b'], 'b rang; a was cancelled by us');
    assert.deepEqual(live, []);
  });

  it('an id that was being cancelled and is still pending stays in the ledger (the cancel never happened)', () => {
    const bk = { ledger: [entry('a', NOW + 3_600_000)], cancelling: ['a'], scheduling: [] };
    const { fired, live } = deliveries(bk, new Set(['a']), NOW);
    assert.deepEqual(fired, []);
    assert.deepEqual(live.map((e) => e.id), ['a']);
  });

  it('an entry that was being scheduled: pending joins the ledger, gone and overdue rang, gone and ahead is forgotten', () => {
    const bk = { ledger: [], cancelling: [], scheduling: [entry('p', NOW + 60_000), entry('o', NOW - 60_000), entry('f', NOW + 3_600_000)] };
    const { fired, live, overdueKept } = deliveries(bk, new Set(['p']), NOW);
    assert.deepEqual(live.map((e) => e.id), ['p']);
    assert.deepEqual(fired.map((f) => f.id), ['o']);
    assert.deepEqual(overdueKept, []);
  });

  it('the same id replaced (cancelled and scheduled anew) and pending is left for the sync to redo', () => {
    const bk = { ledger: [entry('a', NOW + 600_000, 'old')], cancelling: ['a'], scheduling: [entry('a', NOW + 900_000, 'new')] };
    const { fired, live } = deliveries(bk, new Set(['a']), NOW);
    assert.deepEqual(fired, []);
    assert.deepEqual(live, [], 'unknowable which request the OS holds');
    const gone = deliveries(bk, new Set<string>(), NOW + 1_000_000);
    assert.deepEqual(gone.fired.map((f) => [f.id, f.at]), [['a', NOW + 900_000]], 'the new one is overdue and gone: it rang');
  });

  it('the same id re-offered after it rang (no cancel): the old ring and the new request are both known', () => {
    const bk = { ledger: [entry('a', NOW - 600_000, 'old')], cancelling: [], scheduling: [entry('a', NOW + 900_000, 'new')] };
    const { fired, live } = deliveries(bk, new Set(['a']), NOW);
    assert.deepEqual(fired.map((f) => [f.id, f.at]), [['a', NOW - 600_000]]);
    assert.deepEqual(live.map((e) => e.sig), ['new']);
  });

  it('an overdue pending entry from the ledger is kept inside the grace, whatever the intents say', () => {
    const bk = { ledger: [entry('late', NOW - OVERDUE_GRACE_MS + 60_000)], cancelling: [], scheduling: [] };
    const { overdueKept, fired } = deliveries(bk, new Set(['late']), NOW);
    assert.deepEqual(overdueKept.map((e) => e.id), ['late']);
    assert.deepEqual(fired, []);
  });

  it('parses a stored record leniently and never as a failure', () => {
    assert.deepEqual(parseBookkeeping(null), EMPTY_BOOKKEEPING);
    assert.deepEqual(parseBookkeeping('nope'), EMPTY_BOOKKEEPING);
    // Round 12: entries are checked one by one; a damaged one is dropped rather than kept to crash a later sync.
    assert.deepEqual(parseBookkeeping('{"ledger":[{"id":"a"}],"cancelling":["a",1],"scheduling":"x"}'), { ledger: [], journal: [], cancelling: ['a'], scheduling: [] });
  });
});

describe('the policy editor and the reminder card', () => {
  const ctx = { movement: false, water: false };
  const draft = { mode: 'FIXED' as const, times: ['09:00'], intervalMin: 60, onlyWhenBehind: false, maxPerDay: 1 };

  it('a paused schedule stays paused when edited; a new or switched-off one is enabled by its mode', () => {
    const paused: NudgePolicy = { habitId: 'h', kind: 'FIXED', times: ['09:00'], onlyWhenBehind: false, maxPerDay: 1, enabled: false };
    assert.equal(isPaused(paused), true);
    assert.equal(policyFromDraft(paused, draft, ctx).enabled, false, 'Save keeps the schedule paused');
    assert.equal(policyFromDraft(paused, { ...draft, mode: 'INTERVAL' }, ctx).enabled, false, 'another mode, still paused');
    assert.equal(policyFromDraft(paused, { ...draft, mode: 'NONE' }, ctx).kind, 'NONE');
    assert.equal(policyFromDraft({ habitId: 'h' }, draft, ctx).enabled, true, 'a habit without a policy gets a running one');
    const off: NudgePolicy = { habitId: 'h', kind: 'NONE', onlyWhenBehind: false, maxPerDay: 0, enabled: false };
    assert.equal(isPaused(off), false, 'Off is not paused');
    assert.equal(policyFromDraft(off, draft, ctx).enabled, true, 'Off → Set times runs');
  });

  it('the next-ring line reads the plan, then explains why there is nothing', () => {
    const base = { habitId: 'tea', policy: policy({ habitId: 'tea' }), remindersEnabled: true, today: TODAY, zone: ZONE, clock: '12h' as const, doneToday: false, donePeriod: false, periodNoun: 'day' as const };
    const plan = [
      { at: at(TODAY, '19:00'), day: TODAY, habitIds: ['juice', 'tea'] },
      { at: at('2026-10-26', '07:30'), day: '2026-10-26', habitIds: ['tea'] },
    ];
    assert.equal(nextRingText({ ...base, plan }), 'Next: today at 7:00 PM');
    assert.equal(nextRingText({ ...base, plan: plan.slice(1) }), 'Next: tomorrow at 7:30 AM');
    assert.equal(nextRingText({ ...base, plan: [], doneToday: true }), 'Done for today: nothing more rings.');
    assert.equal(nextRingText({ ...base, plan: [], donePeriod: true, periodNoun: 'week' }), 'Done for the week: nothing more rings.');
    assert.match(nextRingText({ ...base, plan: [] })!, /^Nothing planned/);
    assert.equal(nextRingText({ ...base, plan, remindersEnabled: false }), 'Reminders are off in Settings → Reminders.');
    assert.equal(nextRingText({ ...base, plan, policy: { ...base.policy, enabled: false } }), 'Paused: nothing rings until the switch is on.');
    assert.equal(nextRingText({ ...base, plan, policy: undefined }), null);
    assert.equal(nextRingText({ ...base, plan, policy: { ...base.policy, kind: 'EVENT' } }), null);
  });
});

describe('set times on chosen weekdays', () => {
  // TODAY is a Sunday (weekday 6); Monday is 0.
  const monday = '2026-10-26';
  const ctx = { movement: false, water: false };

  it('the planner places the times only on the chosen days', () => {
    const mwf = habit({ id: 'tea', policy: policy({ habitId: 'tea', times: ['07:30'], maxPerDay: 1, weekdays: [0, 2, 4] }) });
    const plan = planNudges(input({ habits: [mwf], nowMs: at(TODAY, '06:00') }));
    assert.deepEqual(plan.map(clock), [`${monday} 07:30`], 'Sunday is skipped, Monday rings');
    const weekend = habit({ id: 'tea', policy: policy({ habitId: 'tea', times: ['07:30'], maxPerDay: 1, weekdays: [5, 6] }) });
    assert.deepEqual(planNudges(input({ habits: [weekend], nowMs: at(TODAY, '06:00') })).map(clock), [`${TODAY} 07:30`]);
    const every = habit({ id: 'tea', policy: policy({ habitId: 'tea', times: ['07:30'], maxPerDay: 1 }) });
    assert.deepEqual(planNudges(input({ habits: [every], nowMs: at(TODAY, '06:00') })).map(clock), [`${TODAY} 07:30`, `${monday} 07:30`]);
  });

  it('the editor normalises the choice; every day and no day are stored as no restriction', () => {
    const draft = { mode: 'FIXED' as const, times: ['07:30'], intervalMin: 60, onlyWhenBehind: false, maxPerDay: 1 };
    assert.deepEqual(policyFromDraft({ habitId: 'h' }, { ...draft, weekdays: [4, 0, 2, 2] }, ctx).weekdays, [0, 2, 4]);
    assert.equal(policyFromDraft({ habitId: 'h' }, { ...draft, weekdays: [0, 1, 2, 3, 4, 5, 6] }, ctx).weekdays, undefined);
    assert.equal(policyFromDraft({ habitId: 'h' }, { ...draft, weekdays: [] }, ctx).weekdays, undefined);
    assert.equal(policyFromDraft({ habitId: 'h', weekdays: [0] }, { ...draft, mode: 'INTERVAL' }, ctx).weekdays, undefined, 'an interval has no weekdays');
    assert.deepEqual(normalizeWeekdays([7, -1, 3.5, 2]), [2], 'junk is dropped');
  });

  it('reads as words', () => {
    assert.equal(weekdaysText([0, 1, 2, 3, 4]), 'on weekdays');
    assert.equal(weekdaysText([5, 6]), 'at weekends');
    assert.equal(weekdaysText([0, 2, 4]), 'on Mon, Wed and Fri');
    assert.equal(weekdaysText([3]), 'on Thu');
    assert.equal(weekdaysText(undefined), '');
    assert.equal(describePolicy(policy({ habitId: 'h', times: ['07:30'], maxPerDay: 1, weekdays: [0, 2, 4] }), { ...ctx, rotationIntervalMin: 60, clock: '12h' as const }), 'At 7:30 AM on Mon, Wed and Fri');
  });

  it('the backup validator accepts the field and refuses junk in it', () => {
    const base = { habits: [], rules: [], policies: [] as unknown[], entries: [], water: [], snacks: [], mind: [], nudgeEvents: [], events: [], body: { steps: [], sleep: [], heart: [], weight: [], workouts: [] }, cycleLogs: [] };
    assert.doesNotThrow(() => validateRecords({ ...base, policies: [policy({ habitId: 'h', weekdays: [0, 6] })] }));
    assert.doesNotThrow(() => validateRecords({ ...base, policies: [policy({ habitId: 'h' })] }));
    assert.throws(() => validateRecords({ ...base, policies: [{ ...policy({ habitId: 'h' }), weekdays: [7] }] }), ValidationError);
    assert.throws(() => validateRecords({ ...base, policies: [{ ...policy({ habitId: 'h' }), weekdays: ['Mon'] }] }), ValidationError);
  });

  it('the next-ring line reads the policy when the chosen day is past the plan horizon', () => {
    const friday = policy({ habitId: 'tea', times: ['18:00'], maxPerDay: 1, weekdays: [4] });
    const base = { habitId: 'tea', policy: friday, remindersEnabled: true, today: TODAY, zone: ZONE, clock: '12h' as const, nowMs: at(TODAY, '08:00'), doneToday: false, donePeriod: false, periodNoun: 'day' as const };
    assert.equal(nextRingText({ ...base, plan: [] }), 'Next: Fri, Oct 30 at 6:00 PM');
    // Within the horizon the plan is the authority: nothing there means nothing rings.
    const tomorrow = policy({ habitId: 'tea', times: ['09:00'], maxPerDay: 1, weekdays: [0] });
    assert.match(nextRingText({ ...base, plan: [], policy: tomorrow })!, /^Nothing planned/);
  });
});
