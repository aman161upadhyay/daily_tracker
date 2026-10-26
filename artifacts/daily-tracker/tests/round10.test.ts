/// <reference types="node" />
/**
 * Council round 10 regressions: deliveries written down per occurrence (a snoozed or swapped slot
 * that rings again), the delivery journal that outlives a lost fold, a clock set back, response
 * events stamped with the slot's tracking day, exempt rings outside the cap, per-habit budgets
 * that ignore missed slots and cross the day boundary, the rotation continuing into the next
 * tracking day, the session sweep's best-overlap grouping, the policy editor's normalisation,
 * cadence-aware freeze defaults and the shared water display helper.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { distinctSessions } from '../src/domain/body/stats';
import { defaultFreezes } from '../src/domain/habits/streaks';
import type { NudgeEvent, NudgePolicy } from '../src/domain/models';
import { clockMinutes, clockString, describePolicy, policyFromDraft, policyModeOf, timesText } from '../src/domain/nudges/describePolicy';
import { planNudges, type PlanHabit, type PlanInput, type ScheduledNudge } from '../src/domain/nudges/planner';
import { describeRule, formatHabitValue, habitAmountText, habitUnit } from '../src/domain/time/format';
import { addDays, instantOf, minutesOfDay } from '../src/domain/time/trackingDay';
import { JOURNAL_RETENTION_MS, OVERDUE_GRACE_MS, deliveries, journalWith, journalWithout, parseRecords, type LedgerEntry } from '../src/services/deliveryJournal';
import { applyAll, firedActions, nudgeResponseActions, parsePayload, type CommandContext } from '../src/state/commands';
import { reducer } from '../src/state/reducer';
import { buildEmptyState } from '../src/state/seed';

const ZONE = 'America/New_York';
const TODAY = '2026-10-25'; // a Sunday
const NOW = instantOf(TODAY, 14 * 60 + 30, ZONE);
let seq = 0;
const ctx: CommandContext = { nowMs: NOW, zone: ZONE, today: TODAY, newId: () => `r10-${++seq}` };
const at = (day: string, hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return instantOf(day, h! * 60 + m!, ZONE);
};
const clock = (n: ScheduledNudge) => {
  const min = minutesOfDay(n.at, ZONE);
  return `${n.day} ${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
};

describe('deliveries: one occurrence of a slot at a time', () => {
  const squat = { id: 'squat', name: 'Squat snack', category: 'movement' };

  it('a slot that rang, was snoozed and rang again is written down twice; the same report twice is not', () => {
    const base = buildEmptyState(TODAY, undefined, { withWater: false });
    const t1 = at(TODAY, '10:00');
    const t2 = t1 + 15 * 60_000;
    const first = applyAll(base, firedActions(base, [{ id: 'rot:1', habitIds: [squat.id], day: TODAY, at: t1 }], ctx), reducer);
    const snoozed = applyAll(first, [{ type: 'NUDGE_EVENT', event: { id: 'sn', nudgeId: 'rot:1', habitIds: [squat.id], at: t1 + 30_000, zone: ZONE, day: TODAY, kind: 'SNOOZED', untilMs: t2 }, keepFromDay: '2026-10-01' }], reducer);
    const again = firedActions(snoozed, [{ id: 'rot:1', habitIds: [squat.id], day: TODAY, at: t2 }], ctx);
    assert.equal(again.length, 1, 'the second ring is a new occurrence');
    const after = applyAll(snoozed, again, reducer);
    assert.deepEqual(
      after.nudgeEvents.filter((e) => e.kind === 'FIRED').map((e) => e.at),
      [t1, t2],
    );
    assert.equal(firedActions(after, [{ id: 'rot:1', habitIds: [squat.id], day: TODAY, at: t2 }], ctx).length, 0, 'a replay of the journal is a no-op');
    assert.equal(firedActions(after, [{ id: 'rot:1', habitIds: [squat.id], day: TODAY, at: t1 }], ctx).length, 0);
  });

  it('a re-delivered merged notification writes each constituent once per occurrence', () => {
    const base = buildEmptyState(TODAY, undefined, { withWater: false });
    const t1 = at(TODAY, '11:00');
    const rec = { id: 'rot:2', habitIds: ['squat', 'water'], day: TODAY, at: t1, mergedIds: ['rot:2', 'water:2'] };
    const once = applyAll(base, firedActions(base, [rec], ctx), reducer);
    assert.equal(once.nudgeEvents.length, 2);
    const twice = firedActions(once, [{ ...rec, at: t1 + 15 * 60_000 }], ctx);
    assert.deepEqual(twice.map((a) => (a.type === 'NUDGE_EVENT' ? [a.event.nudgeId, a.event.via ?? null] : null)), [
      ['rot:2', null],
      ['water:2', 'rot:2'],
    ]);
  });

  it('a swapped slot that rang with the next snack is settled by that ring', () => {
    // The plan re-offers a SWAPPED slot at max(at, now + lead); once that offer rang it must not
    // come back a third time.
    const policy = (over: Partial<NudgePolicy> & { habitId: string }): NudgePolicy => ({ kind: 'ROTATION', intervalMin: 60, onlyWhenBehind: false, maxPerDay: 8, enabled: true, ...over });
    const habit = (over: Partial<PlanHabit> & { id: string }): PlanHabit => ({ name: over.id, policy: policy({ habitId: over.id }), doneToday: false, donePeriod: false, todayRatio: 0, movement: true, ...over });
    const input: PlanInput = {
      nowMs: NOW,
      zone: ZONE,
      today: TODAY,
      boundaryHour: 3,
      settings: { activeStartMin: 9 * 60, activeEndMin: 21 * 60, dailyNudgeCap: 10, nudgeIntervalMin: 60, remindersEnabled: true, weeklySummary: { enabled: false, weekday: 0, minute: 18 * 60 }, waterGoalMl: 2000, tapSizeMl: 250 },
      habits: [habit({ id: 'squats', snackType: 'SQUATS' }), habit({ id: 'walk', snackType: 'WALK' })],
      rotationCompletedToday: 0,
      swapOffset: 0,
      events: [],
      nudgeEvents: [],
    };
    const first = planNudges(input).find((n) => n.day === TODAY && n.kind === 'ROTATION')!;
    const swapped: NudgeEvent = { id: 's', nudgeId: first.id, habitIds: first.habitIds, at: first.at + 10_000, zone: ZONE, day: TODAY, kind: 'SWAPPED' };
    const reoffered = planNudges({ ...input, nowMs: first.at + 20_000, nudgeEvents: [swapped] }).find((n) => n.id === first.id);
    assert.ok(reoffered, 'a swap brings the slot back with the next snack');
    const rang: NudgeEvent = { id: 'f', nudgeId: first.id, habitIds: reoffered!.habitIds, at: reoffered!.at, zone: ZONE, day: TODAY, kind: 'FIRED' };
    const after = planNudges({ ...input, nowMs: reoffered!.at + 60_000, nudgeEvents: [swapped, rang] });
    assert.ok(!after.some((n) => n.id === first.id), 'the ring after the swap settles the slot for good');
  });
});

describe('the delivery journal outlives a lost fold', () => {
  const entry = (id: string, atMs: number): LedgerEntry => ({ id, habitIds: ['h'], day: TODAY, at: atMs, sig: 'x' });

  it('an entry no longer pending has rung, even when its time looks like the future (clock set back)', () => {
    const ledger = [entry('rot:a', NOW - 60_000), entry('rot:b', NOW + 3 * 3_600_000), entry('rot:c', NOW + 60_000)];
    const { fired, overdueKept } = deliveries(ledger, new Set(['rot:c']), NOW);
    assert.deepEqual(
      fired.map((f) => f.id),
      ['rot:a', 'rot:b'],
    );
    assert.equal(overdueKept.length, 0);
    assert.ok(!('sig' in fired[0]!), 'the signature stays in the ledger');
  });

  it('an overdue alarm still pending is kept inside the grace period and dropped after it', () => {
    const recent = entry('rot:late', NOW - OVERDUE_GRACE_MS + 60_000);
    const stale = entry('rot:lost', NOW - OVERDUE_GRACE_MS - 60_000);
    const { fired, overdueKept } = deliveries([recent, stale], new Set(['rot:late', 'rot:lost']), NOW);
    assert.deepEqual(overdueKept.map((e) => e.id), ['rot:late']);
    assert.equal(fired.length, 0, 'a pending alarm has not rung');
  });

  it('the journal keeps each occurrence once, forgets what is acknowledged and what is old', () => {
    const a = { id: 'rot:a', habitIds: ['h'], day: TODAY, at: NOW - 60_000 };
    const b = { id: 'rot:b', habitIds: ['h'], day: TODAY, at: NOW - 30_000 };
    const old = { id: 'rot:old', habitIds: ['h'], day: '2026-10-20', at: NOW - JOURNAL_RETENTION_MS - 1 };
    const j1 = journalWith([], [a, old], NOW);
    assert.deepEqual(j1.map((r) => r.id), ['rot:a'], 'stale entries are not carried');
    const j2 = journalWith(j1, [a, b], NOW);
    assert.deepEqual(j2.map((r) => r.id), ['rot:a', 'rot:b'], 'a second report of the same occurrence is one entry');
    const again = journalWith(j2, [{ ...a, at: a.at + 15 * 60_000 }], NOW);
    assert.equal(again.length, 3, 'the same slot at a later time is another occurrence');
    assert.deepEqual(journalWithout(again, [a, b]).map((r) => [r.id, r.at]), [['rot:a', a.at + 15 * 60_000]]);
    assert.deepEqual(parseRecords('not json'), []);
    assert.deepEqual(parseRecords('{"a":1}'), []);
    assert.deepEqual(parseRecords(JSON.stringify(j2)), j2);
  });
});

describe('responses are stamped with the slot’s tracking day', () => {
  it('a button pressed after the boundary charges the day the nudge was planned for', () => {
    const yesterday = addDays(TODAY, -1);
    const payload = parsePayload({ nudgeId: `rot:${yesterday}:1430`, habitIds: ['squats'], kind: 'ROTATION', day: yesterday });
    assert.ok(payload);
    const state = buildEmptyState(TODAY, undefined, { withWater: false });
    const next = applyAll(state, nudgeResponseActions(state, payload!, 'SNOOZE', ctx), reducer);
    assert.equal(next.nudgeEvents.length, 1);
    assert.equal(next.nudgeEvents[0]!.day, yesterday);
    assert.equal(next.nudgeEvents[0]!.at, NOW, 'the snooze still counts from the press');
  });

  it('a tap on the body is one FIRED per day, not one per tap, and not after the sync recorded the ring', () => {
    const payload = parsePayload({ nudgeId: `fix:med:${TODAY}:07:30`, habitIds: ['med'], kind: 'FIXED', day: TODAY })!;
    const state = buildEmptyState(TODAY, undefined, { withWater: false });
    const tapped = applyAll(state, nudgeResponseActions(state, payload, 'TAP', ctx), reducer);
    assert.deepEqual(tapped.nudgeEvents.map((e) => [e.kind, e.day]), [['FIRED', TODAY]]);
    assert.equal(nudgeResponseActions(tapped, payload, 'TAP', ctx).length, 0, 'a second tap adds nothing');
    const synced = applyAll(state, firedActions(state, [{ id: payload.nudgeId, habitIds: ['med'], day: TODAY, at: at(TODAY, '07:30') }], ctx), reducer);
    assert.equal(nudgeResponseActions(synced, payload, 'TAP', ctx).length, 0, 'the sync already wrote the delivery down');
  });
});

describe('planner: budgets, the cap and the day boundary', () => {
  const policy = (over: Partial<NudgePolicy> & { habitId: string }): NudgePolicy => ({ kind: 'ROTATION', intervalMin: 60, onlyWhenBehind: false, maxPerDay: 8, enabled: true, ...over });
  const habit = (over: Partial<PlanHabit> & { id: string }): PlanHabit => ({ name: over.id, policy: policy({ habitId: over.id }), doneToday: false, donePeriod: false, todayRatio: 0, movement: false, ...over });
  const squats = habit({ id: 'squats', name: 'Squat snack', snackType: 'SQUATS', movement: true });
  const walk = habit({ id: 'walk', name: 'Walk break', snackType: 'WALK', movement: true });
  const input = (over: Partial<PlanInput> = {}): PlanInput => ({
    nowMs: NOW,
    zone: ZONE,
    today: TODAY,
    boundaryHour: 3,
    settings: { activeStartMin: 9 * 60, activeEndMin: 21 * 60, dailyNudgeCap: 10, nudgeIntervalMin: 60, remindersEnabled: true, weeklySummary: { enabled: false, weekday: 0, minute: 18 * 60 }, waterGoalMl: 2000, tapSizeMl: 250 },
    habits: [squats, walk],
    rotationCompletedToday: 0,
    swapOffset: 0,
    events: [],
    nudgeEvents: [],
    ...over,
  });
  const todayOnly = (plan: ScheduledNudge[]) => plan.filter((n) => n.day === TODAY);
  const fired = (nudgeId: string, atMs: number, habitIds = ['squats']): NudgeEvent => ({ id: `f-${nudgeId}`, nudgeId, habitIds, at: atMs, zone: ZONE, day: TODAY, kind: 'FIRED' });

  it('a summary, a cycle prompt or a follow-up that rang does not spend the daily cap', () => {
    const capped = input({ settings: { ...input().settings, dailyNudgeCap: 2 } });
    const exempt = [fired(`summary:${TODAY}`, at(TODAY, '09:00'), []), fired(`cycle:${TODAY}`, at(TODAY, '09:05'), []), fired('event:abc', at(TODAY, '10:00'), ['shield'])];
    assert.equal(todayOnly(planNudges({ ...capped, nudgeEvents: exempt })).length, 2, 'three exempt rings leave the cap untouched');
    const spent = [fired(`rot:${TODAY}:600`, at(TODAY, '10:00')), fired(`rot:${TODAY}:660`, at(TODAY, '11:00'))];
    assert.equal(todayOnly(planNudges({ ...capped, nudgeEvents: spent })).length, 0, 'two rotation rings spend a cap of two');
    // A follow-up merged with a rotation slot rang once, and that ring counts: the rotation was in it.
    const mergedRing: NudgeEvent[] = [fired('event:abc', at(TODAY, '10:00'), ['shield']), { ...fired(`rot:${TODAY}:600`, at(TODAY, '10:00')), via: 'event:abc' }];
    assert.equal(todayOnly(planNudges({ ...capped, nudgeEvents: mergedRing })).length, 1);
  });

  it('an interval habit’s budget counts what rang, not the slots that went by undelivered', () => {
    const tea = habit({ id: 'tea', name: 'Sip tea', policy: policy({ habitId: 'tea', kind: 'INTERVAL', intervalMin: 60, maxPerDay: 2 }) });
    // 10:00 to 14:00 went by with the phone off; the budget of two is still whole.
    const open = todayOnly(planNudges(input({ habits: [tea] }))).filter((n) => n.id.startsWith('int:tea:'));
    assert.deepEqual(open.map(clock), [`${TODAY} 15:00`, `${TODAY} 16:00`]);
    // Two that rang this morning spend it.
    const rang = [fired(`int:tea:${TODAY}:600`, at(TODAY, '10:00'), ['tea']), fired(`int:tea:${TODAY}:660`, at(TODAY, '11:00'), ['tea'])];
    assert.equal(todayOnly(planNudges(input({ habits: [tea], nudgeEvents: rang }))).filter((n) => n.id.startsWith('int:tea:')).length, 0);
  });

  it('fixed times missed earlier do not use up the day’s allowance', () => {
    const med = habit({ id: 'med', name: 'Meditate', policy: policy({ habitId: 'med', kind: 'FIXED', times: ['10:00', '11:00', '16:00', '18:00'], maxPerDay: 2 }) });
    const open = todayOnly(planNudges(input({ habits: [med] }))).filter((n) => n.id.startsWith('fix:med:'));
    assert.deepEqual(open.map(clock), [`${TODAY} 16:00`, `${TODAY} 18:00`]);
    const rang = [fired(`fix:med:${TODAY}:10:00`, at(TODAY, '10:00'), ['med']), fired(`fix:med:${TODAY}:11:00`, at(TODAY, '11:00'), ['med'])];
    assert.equal(todayOnly(planNudges(input({ habits: [med], nudgeEvents: rang }))).filter((n) => n.id.startsWith('fix:med:')).length, 0);
  });

  it('an active window that crosses the day boundary spends each tracking day’s budget, not one twice', () => {
    // Night owl: active midnight to 8 am, boundary at 3 am. On the calendar day after today the
    // 1 am and 2 am slots still belong to today (done), the 4 am slot onwards to tomorrow.
    const night = input({ settings: { ...input().settings, activeStartMin: 0, activeEndMin: 8 * 60 }, habits: [{ ...squats, doneToday: true }, { ...walk, doneToday: true }] });
    const tomorrowCalendar = addDays(TODAY, 1);
    const plan = planNudges(night).filter((n) => n.kind === 'ROTATION');
    assert.ok(!plan.some((n) => n.id === `rot:${tomorrowCalendar}:60` || n.id === `rot:${tomorrowCalendar}:120`), 'tonight’s small hours are today, and today is done');
    assert.ok(plan.some((n) => n.id === `rot:${tomorrowCalendar}:240`), 'the slots after the boundary are tomorrow’s and are offered');
    const tea = habit({ id: 'tea', name: 'Sip tea', doneToday: true, policy: policy({ habitId: 'tea', kind: 'INTERVAL', intervalMin: 60, maxPerDay: 2 }) });
    const teaPlan = planNudges({ ...night, habits: [tea] }).filter((n) => n.id.startsWith('int:tea:'));
    // 3 am is the first minute of tomorrow's tracking day: its first two slots are 3 and 4 am.
    assert.deepEqual(teaPlan.map(clock), [`${tomorrowCalendar} 03:00`, `${tomorrowCalendar} 04:00`], 'two for tomorrow, none for today');
  });
});

describe('sessions: the group a record shares most of itself with', () => {
  type S = { id: string; startAt: number; endAt: number; kind: string };
  const s = (id: string, startAt: number, endAt: number, kind = 'a'): S => ({ id, startAt, endAt, kind });
  const sweep = (list: S[]) => distinctSessions(list, (x, y) => x.kind === y.kind, (x, y) => (y.endAt - y.startAt > x.endAt - x.startAt ? y : x)).map((x) => x.id);

  it('two open groups both overlap the record by more than half: the better overlap takes it', () => {
    const a = s('a', 100, 200);
    const b = s('b', 150, 260); // shares 50 of 100 with a: not the same session
    const c = s('c', 160, 210); // 40/50 with a, 50/50 with b
    assert.deepEqual(sweep([a, b, c]), ['a', 'b'], 'c folds into b');
    assert.deepEqual(sweep([c, b, a]), ['a', 'b'], 'whatever the input order');
    assert.deepEqual(sweep([a, b, s('c', 160, 210, 'other')]), ['a', 'b', 'c'], 'a different kind stands alone');
  });
});

describe('the reminder editor normalises what it saves', () => {
  const ctxPlain = { movement: false, water: false, rotationIntervalMin: 60 };
  const ctxMove = { ...ctxPlain, movement: true };
  const ctxWater = { ...ctxPlain, water: true };

  it('set times are sorted, unique and bounded; the cap never exceeds the number of times', () => {
    const p = policyFromDraft({ habitId: 'h' }, { mode: 'FIXED', times: ['19:00', '08:00', '19:00', 'bad'], intervalMin: 0, onlyWhenBehind: true, maxPerDay: 9 }, ctxPlain);
    assert.deepEqual(p, { habitId: 'h', kind: 'FIXED', onlyWhenBehind: true, maxPerDay: 2, enabled: true, times: ['08:00', '19:00'] });
    assert.equal(describePolicy(p, ctxPlain), 'At 8:00 AM and 7:00 PM when behind');
  });

  it('an interval for a movement habit is the rotation; for water a pace check; otherwise its own series', () => {
    const draft = { mode: 'INTERVAL' as const, times: [], intervalMin: 7, onlyWhenBehind: false, maxPerDay: 40 };
    const move = policyFromDraft({ habitId: 'sq' }, { ...draft, mode: 'ROTATION' }, ctxMove);
    assert.equal(move.kind, 'ROTATION');
    assert.equal(move.intervalMin, 15, 'clamped to the shortest interval');
    assert.equal(move.maxPerDay, 12, 'clamped to the most a day');
    assert.equal(policyModeOf(move, ctxMove), 'ROTATION');
    assert.equal(describePolicy(move, ctxMove), 'In the movement rotation, about every 1 h · up to 12 a day');
    const water = policyFromDraft({ habitId: 'w' }, { ...draft, intervalMin: 90, onlyWhenBehind: true }, ctxWater);
    assert.equal(water.kind, 'INTERVAL');
    assert.equal(describePolicy(water, ctxWater), 'A pace check every 1 h 30 min when you are behind');
    const plain = policyFromDraft({ habitId: 't' }, { ...draft, intervalMin: 120, maxPerDay: 3, onlyWhenBehind: true }, ctxPlain);
    assert.equal(describePolicy(plain, ctxPlain), 'Every 2 h while behind pace · up to 3 a day');
    assert.equal(policyModeOf({ habitId: 't', kind: 'INTERVAL', onlyWhenBehind: false, maxPerDay: 1, enabled: true }, ctxPlain), 'INTERVAL');
  });

  it('off is a policy that never fires; event policies are not editable modes', () => {
    const off = policyFromDraft({ habitId: 'h', activeStartMin: 600 }, { mode: 'NONE', times: ['09:00'], intervalMin: 60, onlyWhenBehind: true, maxPerDay: 3 }, ctxPlain);
    assert.deepEqual(off, { habitId: 'h', kind: 'NONE', onlyWhenBehind: false, maxPerDay: 0, enabled: false, activeStartMin: 600 });
    assert.equal(describePolicy(off, ctxPlain), 'No reminder set');
    assert.equal(policyModeOf({ habitId: 'e', kind: 'EVENT', onlyWhenBehind: false, maxPerDay: 0, enabled: true }, ctxPlain), 'NONE');
    assert.equal(describePolicy(undefined, ctxPlain), 'No reminder set');
  });

  it('clock strings round-trip and read as spoken times', () => {
    assert.equal(clockMinutes('07:30'), 450);
    assert.equal(clockMinutes('24:00'), null);
    assert.equal(clockMinutes('7:30'), null);
    assert.equal(clockString(450), '07:30');
    assert.equal(clockString(1445), '00:05');
    assert.equal(timesText(['12:30', '08:00', '19:00']), '8:00 AM, 12:30 PM and 7:00 PM');
    assert.equal(timesText(['bad']), '');
  });
});

describe('defaults and display helpers', () => {
  it('a new habit starts with freezes that fit its cadence', () => {
    assert.equal(defaultFreezes('DAILY'), 2);
    assert.equal(defaultFreezes('WEEKLY'), 1);
    assert.equal(defaultFreezes('MONTHLY'), 0);
    const seeded = buildEmptyState(TODAY, undefined, { withWater: true });
    for (const r of seeded.rules) assert.equal(r.freezesPerMonth, defaultFreezes(r.cadence), `${r.habitId} starts with the cadence default`);
  });

  it('the Water preset is shown in the units setting; other habits keep their own unit', () => {
    const water = { presetId: 'water', unit: 'ml' };
    assert.deepEqual(formatHabitValue(water, 2000, 'oz'), { value: '67.6', unit: 'oz' });
    assert.deepEqual(formatHabitValue(water, 2000, 'ml'), { value: '2,000', unit: 'ml' });
    assert.equal(habitAmountText({ unit: 'squats' }, 10, 'oz'), '10 squats');
    assert.equal(habitAmountText({ unit: '' }, 3, 'oz'), '3');
    assert.equal(habitUnit(water, 'oz'), 'oz');
    assert.equal(habitUnit({ unit: 'steps' }, 'oz'), 'steps');
    assert.equal(describeRule({ type: 'AMOUNT', unit: 'ml', presetId: 'water' }, { cadence: 'DAILY', timesPerPeriod: 1, target: 2000 }, 'oz'), '67.6 oz a day');
    assert.equal(describeRule({ type: 'AMOUNT', unit: 'ml', presetId: 'water' }, { cadence: 'DAILY', timesPerPeriod: 1, target: 2000 }), '2,000 ml a day');
  });
});
