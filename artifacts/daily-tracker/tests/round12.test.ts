/** Round 12: the simulator's residual finding and what the twelfth council turned up. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { NudgePolicy } from '../src/domain/models';
import { planNudges, type PlanHabit, type PlanInput, type ScheduledNudge } from '../src/domain/nudges/planner';
import { addDays, instantOf, trackingDayOf } from '../src/domain/time/trackingDay';

const ZONE = 'America/New_York';
const TODAY = '2026-10-25';
const at = (day: string, hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return instantOf(day, h! * 60 + m!, ZONE);
};
const policy = (over: Partial<NudgePolicy> & { habitId: string }): NudgePolicy => ({ kind: 'FIXED', times: ['07:30'], onlyWhenBehind: false, maxPerDay: 2, enabled: true, ...over });
const habit = (over: Partial<PlanHabit> & { id: string }): PlanHabit => ({ name: over.id, policy: policy({ habitId: over.id }), doneToday: false, donePeriod: false, todayRatio: 0, movement: false, ...over });
const input = (over: Partial<PlanInput> = {}): PlanInput => ({
  nowMs: at(TODAY, '08:00'),
  zone: ZONE,
  today: TODAY,
  settings: { activeStartMin: 0, activeEndMin: 8 * 60, dailyNudgeCap: 10, nudgeIntervalMin: 60, remindersEnabled: true, weeklySummary: { enabled: false, weekday: 0, minute: 18 * 60 }, waterGoalMl: 2000, tapSizeMl: 250 },
  habits: [],
  rotationCompletedToday: 0,
  swapOffset: 0,
  events: [],
  nudgeEvents: [],
  ...over,
});
const byId = (plan: ScheduledNudge[], prefix: string) => plan.filter((n) => n.id.startsWith(prefix));

describe('merging stops at the tracking-day boundary', () => {
  it('two set times a minute apart across 3 am stay two notifications, each on its own day', () => {
    const tomorrow = addDays(TODAY, 1);
    const late = habit({ id: 'late', policy: policy({ habitId: 'late', times: ['02:59'], maxPerDay: 1 }) });
    const early = habit({ id: 'early', policy: policy({ habitId: 'early', times: ['03:00'], maxPerDay: 1 }) });
    const plan = planNudges(input({ habits: [late, early], nowMs: at(TODAY, '20:00') }));
    const a = byId(plan, 'fix:late:' + tomorrow)[0];
    const b = byId(plan, 'fix:early:' + tomorrow)[0];
    assert.ok(a && b, 'both placed');
    assert.equal(a.mergedIds, undefined, 'not merged');
    assert.equal(b.mergedIds, undefined, 'not merged');
    assert.equal(a.day, TODAY, '02:59 belongs to the day before the boundary');
    assert.equal(b.day, tomorrow);
    assert.equal(trackingDayOf(b.at, ZONE), tomorrow);
  });

  it('a minute apart on the same side of the boundary still merges', () => {
    const tomorrow = addDays(TODAY, 1);
    const one = habit({ id: 'one', policy: policy({ habitId: 'one', times: ['03:00'], maxPerDay: 1 }) });
    const two = habit({ id: 'two', policy: policy({ habitId: 'two', times: ['03:01'], maxPerDay: 1 }) });
    const plan = planNudges(input({ habits: [one, two], nowMs: at(TODAY, '20:00') }));
    const merged = plan.find((n) => n.mergedIds?.length === 2 && n.day === tomorrow);
    assert.ok(merged, 'one notification for both');
    assert.deepEqual([...merged!.habitIds].sort(), ['one', 'two']);
  });
});


// ── Round 12 council: durable bookkeeping, the press inbox, copy ───────────────────────────────

import { EMPTY_BOOKKEEPING, MAX_RECORDS, deliveries, parseBookkeeping, type LedgerEntry } from '../src/services/deliveryJournal';
import { HANDLED_RETENTION_MS, INBOX_RETENTION_MS, MAX_TRIES, parseResponses, pending, wasHandled, withFailed, withHandled, withReceived } from '../src/services/responseInbox';
import { nextRingText } from '../src/domain/nudges/describePolicy';
import type { NudgePayload } from '../src/state/commands';

const entry = (id: string, atMs: number, over: Partial<LedgerEntry> = {}): LedgerEntry => ({ id, habitIds: ['h'], day: TODAY, at: atMs, sig: 's', ...over });

describe('bookkeeping record: damaged rows are dropped, never fatal', () => {
  it('keeps the well-formed entries and drops the rest, field by field', () => {
    const good = entry('a', at(TODAY, '09:00'));
    const raw = JSON.stringify({
      ledger: [good, null, 7, 'x', { id: 'b' }, { ...good, id: '' }, { ...good, at: 'soon' }, { ...good, at: Number.NaN }, { ...good, habitIds: 'h' }, { ...good, sig: 3 }, { ...good, id: 'ok', mergedIds: ['m1', 'm2'] }, { ...good, id: 'bad-merge', mergedIds: [1] }],
      journal: [{ id: 'j', habitIds: [], day: TODAY, at: 1 }, { id: 'j2', habitIds: [], day: TODAY, at: 'x' }],
      cancelling: ['c1', 2, null, ''],
      scheduling: 'nope',
    });
    const bk = parseBookkeeping(raw);
    assert.deepEqual(bk.ledger.map((e) => e.id), ['a', 'ok', 'bad-merge']);
    assert.deepEqual(bk.ledger[1]!.mergedIds, ['m1', 'm2']);
    assert.equal(bk.ledger[2]!.mergedIds, undefined, 'a damaged optional field is dropped, the row kept');
    assert.deepEqual(bk.journal.map((e) => e.id), ['j']);
    assert.deepEqual(bk.cancelling, ['c1']);
    assert.deepEqual(bk.scheduling, []);
    assert.deepEqual(parseBookkeeping('{"ledger": {"a": 1}}'), EMPTY_BOOKKEEPING);
    assert.deepEqual(parseBookkeeping('null'), EMPTY_BOOKKEEPING);
    assert.deepEqual(parseBookkeeping('[1,2]'), EMPTY_BOOKKEEPING);
  });

  it('caps a runaway record at the newest entries', () => {
    const many = Array.from({ length: MAX_RECORDS + 50 }, (_, i) => entry('e' + i, i));
    const bk = parseBookkeeping(JSON.stringify({ ledger: many, journal: many, cancelling: many.map((e) => e.id), scheduling: [] }));
    assert.equal(bk.ledger.length, MAX_RECORDS);
    assert.equal(bk.ledger[0]!.id, 'e50', 'the oldest went');
    assert.equal(bk.ledger[MAX_RECORDS - 1]!.id, 'e' + (MAX_RECORDS + 49));
    assert.equal(bk.journal.length, MAX_RECORDS);
    assert.equal(bk.cancelling.length, MAX_RECORDS);
  });

  it('reads a ledger with a repeated id the way the first entry says', () => {
    const t = at(TODAY, '09:00');
    const bk = { ...EMPTY_BOOKKEEPING, ledger: [entry('a', t, { sig: 'first' }), entry('a', t + 1, { sig: 'second' })] };
    const r = deliveries(bk, new Set(['a']), t + 60_000);
    assert.equal(r.live.length, 1);
    assert.equal(r.live[0]!.sig, 'first');
  });
});

describe('the press inbox', () => {
  const payload: NudgePayload = { nudgeId: 'rot:' + TODAY + ':600', kind: 'ROTATION', habitIds: ['h'], day: TODAY };
  const t0 = at(TODAY, '10:00');
  const press = { key: 'k1', payload, action: 'DONE', receivedAt: t0 };

  it('writes a press down once, marks it handled only on commit, and drops it after too many failures', () => {
    let r = withReceived(parseResponses(null), press, t0);
    assert.equal(pending(r, t0).length, 1);
    assert.equal(withReceived(r, press, t0), r, 'the same press again changes nothing');
    assert.equal(pending(withReceived(r, { ...press, key: 'k2' }, t0), t0).length, 2);
    r = withFailed(r, 'k1', t0);
    assert.equal(pending(r, t0)[0]!.tries, 1, 'a failed application is counted, the press kept');
    for (let i = 1; i < MAX_TRIES; i++) r = withFailed(r, 'k1', t0);
    assert.equal(pending(r, t0).length, 0, 'spent after MAX_TRIES');
    assert.equal(wasHandled(r, 'k1'), false, 'spent is not handled: a later identical press is new');
    let h = withHandled(withReceived(parseResponses(null), press, t0), 'k1', t0 + 5);
    assert.equal(pending(h, t0 + 5).length, 0);
    assert.equal(wasHandled(h, 'k1'), true);
    assert.equal(withReceived(h, press, t0 + 10), h, 'a handled press is not re-admitted');
    h = parseResponses(JSON.stringify(h));
    assert.equal(wasHandled(h, 'k1'), true, 'survives a round trip');
  });

  it('forgets what is too old to matter', () => {
    const r = withHandled(withReceived(parseResponses(null), press, t0), 'k1', t0);
    const later = withReceived(r, { ...press, key: 'k3' }, t0 + HANDLED_RETENTION_MS + 1);
    assert.equal(wasHandled(later, 'k1'), false, 'the handled mark is pruned after the OS could re-deliver');
    const stale = withReceived(parseResponses(null), press, t0);
    assert.equal(pending(stale, t0 + INBOX_RETENTION_MS + 1).length, 0, 'a two-day-old press is not replayed');
    assert.equal(pending(stale, t0 + INBOX_RETENTION_MS - 1).length, 1);
  });

  it('reads a damaged record without crashing', () => {
    assert.deepEqual(parseResponses('nope'), { handled: {}, inbox: [] });
    assert.deepEqual(parseResponses('[1]'), { handled: {}, inbox: [] });
    const r = parseResponses(JSON.stringify({ handled: { ok: t0, bad: 'x', '': t0 }, inbox: [press, { ...press, key: 'k2', payload: { nope: 1 } }, { ...press, key: 'k4', receivedAt: 'x' }, null, { ...press, key: 'k5', tries: -1 }] }));
    assert.deepEqual(Object.keys(r.handled), ['ok']);
    assert.deepEqual(r.inbox.map((x) => [x.key, x.tries]), [['k1', 0], ['k5', 0]]);
  });
});

describe('the next-ring line', () => {
  const base = { habitId: 'tea', policy: policy({ habitId: 'tea' }), remindersEnabled: true, today: TODAY, zone: ZONE, clock: '12h' as const, doneToday: false, donePeriod: false, periodNoun: 'day' as const };

  it('says today and tomorrow by the calendar, not the tracking day', () => {
    const tomorrow = addDays(TODAY, 1);
    // 1:00 AM tomorrow belongs to today's tracking day (the day turns at 3 AM) but is "tomorrow" on a clock.
    const ring = { at: at(tomorrow, '01:00'), day: TODAY, habitIds: ['tea'] };
    assert.equal(nextRingText({ ...base, plan: [ring], nowMs: at(TODAY, '23:00') }), 'Next: tomorrow at 1:00 AM');
    assert.equal(nextRingText({ ...base, plan: [ring], nowMs: at(tomorrow, '00:30') }), 'Next: today at 1:00 AM');
    assert.equal(nextRingText({ ...base, plan: [ring] }), 'Next: today at 1:00 AM', 'without an instant the tracking day decides');
  });

  it('explains a global pause before anything else, and a met quota before a far set time', () => {
    const off = at(TODAY, '14:00');
    assert.equal(nextRingText({ ...base, plan: [{ at: at(TODAY, '19:00'), day: TODAY, habitIds: ['tea'] }], nowMs: at(TODAY, '12:00'), offUntil: off }), 'Paused until today at 2:00 PM (Settings → Reminders).');
    const interval = policy({ habitId: 'tea', kind: 'INTERVAL', intervalMin: 60, times: undefined });
    assert.equal(nextRingText({ ...base, policy: interval, plan: [], nowMs: at(TODAY, '12:00'), offUntil: at(TODAY, '11:00') }), 'Nothing planned for the rest of today or tomorrow (the daily cap or this habit’s limit may be spent).', 'an expired pause says nothing');
    const friday = policy({ habitId: 'tea', times: ['07:00'], weekdays: [4] });
    assert.match(nextRingText({ ...base, policy: friday, plan: [], nowMs: at(TODAY, '12:00') })!, /^Next: Fri/);
    assert.equal(nextRingText({ ...base, policy: friday, plan: [], nowMs: at(TODAY, '12:00'), donePeriod: true, periodNoun: 'week' }), 'Done for the week: nothing more rings.');
  });
});

describe('a replayed press is a no-op', () => {
  it('the same snooze at the same instant is written once; a later snooze is another', async () => {
    const { nudgeResponseActions, applyAll } = await import('../src/state/commands');
    const { reducer } = await import('../src/state/reducer');
    const { buildSampleState } = await import('../src/state/seed');
    const t = at(TODAY, '10:00');
    const state = buildSampleState(TODAY, ZONE, t);
    const payload: NudgePayload = { nudgeId: 'rot:' + TODAY + ':600', kind: 'ROTATION', habitIds: [state.habits[0]!.id], day: TODAY };
    let n = 0;
    const ctx = { nowMs: t, zone: ZONE, today: TODAY, newId: () => 'id' + n++ };
    const once = applyAll(state, nudgeResponseActions(state, payload, 'SNOOZE', ctx), reducer);
    const snoozes = (s: typeof state) => s.nudgeEvents.filter((e) => e.nudgeId === payload.nudgeId && e.kind === 'SNOOZED');
    assert.equal(snoozes(once).length, 1);
    assert.deepEqual(nudgeResponseActions(once, payload, 'SNOOZE', ctx), [], 'replayed with the instant it arrived: nothing to add');
    const again = applyAll(once, nudgeResponseActions(once, payload, 'SNOOZE', { ...ctx, nowMs: t + 60_000 }), reducer);
    assert.equal(snoozes(again).length, 2, 'a snooze a minute later is a new one');
  });
});

describe('water copy follows the units setting', () => {
  const waterInput = (units: 'ml' | 'oz') =>
    input({
      nowMs: at(TODAY, '12:00'),
      settings: { ...input().settings, activeStartMin: 8 * 60, activeEndMin: 22 * 60, units },
      water: { habitId: 'water', loggedMl: 0, intervalMin: 60 },
    });
  it('says ounces to someone who set ounces', () => {
    const ml = byId(planNudges(waterInput('ml')), 'water:')[0];
    const oz = byId(planNudges(waterInput('oz')), 'water:')[0];
    assert.ok(ml && oz, 'a water check is planned');
    assert.match(ml.body, /About [\d,]+ ml behind pace/);
    assert.match(oz.body, /About [\d.]+ oz behind pace/);
    assert.equal(ml.id, oz.id, 'the slot is the same');
  });
});
