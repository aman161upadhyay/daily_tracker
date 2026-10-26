/**
 * The nudge pipeline under a randomised phone: ten days per sequence of app opens, headless
 * reconciles, saves that fail, processes that die after writing, notifications that fire, Done /
 * Snooze / Tap / Swap replies, logs made in the app and a clock rolled back two hours — in Berlin
 * and New York, with narrow and round-the-clock active hours and three daily caps. After every
 * reconcile the invariants below are checked; the first breach of each kind is reported with the
 * seed, the sequence and the last steps, so a failure can be replayed by hand.
 *
 *   I1  a day never rings more often than the daily cap (summaries, events and cycle reminders aside)
 *   I2  no FIRED event is recorded twice for the same nudge and instant
 *   I3  what the OS delivered is folded exactly once, and nothing is folded that was not delivered
 *   I4  a notification is never re-scheduled while an identical one still sits in the shade
 *   I5  a habit never rings more than its own policy's maximum a day
 *   I6  nothing is scheduled less than 45 seconds ahead (the OS would deliver it at once)
 *   I7  a habit with a free slot on its own is not starved when the global budget still has room
 *
 * Promoted from the round-12 council's throwaway simulator; the seeds and counts are small enough
 * for the suite, the full run (600 sequences) is the same code with more sequences.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { planNudges, type NudgeActionKind, type ScheduledNudge } from '../src/domain/nudges/planner';
import type { Habit, HabitRule, NudgePolicy } from '../src/domain/models';
import { addDays, instantOf, trackingDayOf } from '../src/domain/time/trackingDay';
import { PRESET_BY_ID } from '../src/library/presets';
import { EMPTY_BOOKKEEPING, deliveries, journalWith, journalWithout, type FiredRecord, type LedgerEntry } from '../src/services/deliveryJournal';
import { applyAll, completeFromNudge, firedActions, nudgeResponseActions, parsePayload, type CommandContext } from '../src/state/commands';
import { reducer } from '../src/state/reducer';
import { buildEmptyState, habitFromPreset } from '../src/state/seed';
import { nudgePlan, planInputFor } from '../src/state/selectors';
import type { TrackerState } from '../src/state/types';

const MIN = 60_000;
const SEEDS = [11, 2026, 8777];
const SEQUENCES_PER_SEED = Number(process.env.NUDGE_SIM_SEQUENCES ?? 25);

type Pending = ScheduledNudge & { sig: string };
interface Breach {
  seed: number;
  seq: number;
  zone: string;
  step: number;
  detail: unknown;
  trace: unknown[];
}

const sig = (n: ScheduledNudge) => `${n.at}|${n.day}|${n.habitIds.join(',')}|${(n.mergedIds ?? []).join(',')}|${n.title}|${n.body}|x`;
const ids = (n: Pick<ScheduledNudge, 'id' | 'mergedIds'>) => [...new Set([n.id, ...(n.mergedIds ?? [])])];

function xorshift(seed: number): () => number {
  let rng = seed >>> 0;
  return () => {
    rng ^= rng << 13;
    rng ^= rng >>> 17;
    rng ^= rng << 5;
    return (rng >>> 0) / 4294967296;
  };
}

function fixture(seq: number, start: string): TrackerState {
  const state = buildEmptyState(start);
  state.settings = {
    ...state.settings,
    remindersEnabled: true,
    activeStartMin: seq % 4 < 2 ? 540 : 0,
    activeEndMin: seq % 4 < 2 ? 1260 : 480,
    dayBoundaryHour: 3,
    dailyNudgeCap: [2, 5, 10][seq % 3]!,
    nudgeIntervalMin: 60,
    weeklySummary: { ...state.settings.weeklySummary, enabled: false },
  };
  for (const [presetId, id] of [
    ['squat-snack', 'sq'],
    ['walk-break', 'walk'],
  ] as const) {
    const b = habitFromPreset(PRESET_BY_ID[presetId]!, id, start);
    state.habits.push(b.habit);
    state.rules.push(b.rule);
    state.policies.push({ ...b.policy, kind: 'ROTATION', maxPerDay: 2 });
  }
  for (const id of ['tea', 'fixed']) {
    const habit: Habit = { id, name: id, type: 'YES_NO', unit: '', icon: 'check', category: 'mind', createdDay: start, archived: false, pinned: false };
    const rule: HabitRule = { habitId: id, effectiveFrom: start, cadence: 'DAILY', timesPerPeriod: 1, target: 1, freezesPerMonth: 2 };
    const policy: NudgePolicy = { habitId: id, enabled: true, kind: id === 'tea' ? 'INTERVAL' : 'FIXED', intervalMin: 60, times: id === 'fixed' ? ['07:30', '19:00'] : undefined, onlyWhenBehind: id === 'tea', maxPerDay: 2 };
    state.habits.push(habit);
    state.rules.push(rule);
    state.policies.push(policy);
  }
  return state;
}

function runSequence(seed: number, seq: number, report: (key: string, breach: Breach) => void): number {
  const rand = xorshift(seed + seq * 100003);
  const zone = seq % 2 ? 'Europe/Berlin' : 'America/New_York';
  const start = zone === 'Europe/Berlin' ? '2026-10-22' : '2026-10-28';
  let now = instantOf(start, 180, zone);
  const end = instantOf(addDays(start, 10), 180, zone);
  let state = fixture(seq, start);
  let step = 0;
  let rolled = false;
  let uid = 0;
  let reconciles = 0;

  const pending = new Map<string, Pending>();
  let ledger: LedgerEntry[] = [];
  let journal: FiredRecord[] = [];
  const os: Pending[] = [];
  let trace: unknown[] = [];
  const permitted = new Set<string>();
  const seen = new Set<string>();
  const fail = (key: string, detail: unknown) => {
    if (seen.has(key)) return;
    seen.add(key);
    report(key, { seed, seq, zone, step, detail, trace: trace.slice(-5) });
  };

  function reconcile(force = false) {
    reconciles++;
    const today = trackingDayOf(now, zone, 3);
    const ctx: CommandContext = { nowMs: now, zone, today, newId: () => `sim${++uid}` };
    const before = state;
    journal = journalWith(journal, deliveries({ ...EMPTY_BOOKKEEPING, ledger }, new Set(pending.keys()), now).fired, now);
    state = applyAll(state, firedActions(state, journal, ctx), reducer);
    const planningState = state;
    const plan = nudgePlan(state, today, now, zone);
    const { fired, overdueKept } = deliveries({ ...EMPTY_BOOKKEEPING, ledger }, new Set(pending.keys()), now);
    journal = journalWith(journal, fired, now);
    const keep = new Set(overdueKept.map((x) => x.id));
    const wanted = new Map(plan.map((n) => [n.id, n]));
    for (const [id, n] of pending) if (!keep.has(id) && (!wanted.has(id) || sig(wanted.get(id)!) !== n.sig)) pending.delete(id);
    for (const n of plan) {
      if (pending.has(n.id) || n.at <= now) continue;
      if (n.at < now + 45_000) fail('I6', n);
      for (const id of ids(n)) if (os.some((o) => ids(o).includes(id)) && !permitted.has(id)) fail('I4', { id, n });
      pending.set(n.id, { ...n, sig: sig(n) });
    }
    ledger = [...overdueKept, ...plan.filter((n) => n.at > now && !keep.has(n.id) && pending.has(n.id)).map((n) => ({ ...n, sig: sig(n) }))];
    state = applyAll(state, firedActions(state, journal, ctx), reducer);
    const saved = force || rand() < 0.5;
    const death = rand() < 0.1;
    if (!saved) state = before;
    else if (!death) journal = journalWithout(journal, journal);
    trace.push({
      step,
      now: new Date(now).toISOString(),
      saved,
      death,
      plan: plan.filter((n) => n.day === today).map((n) => [n.id, new Date(n.at).toISOString()]),
      fires: state.nudgeEvents.filter((e) => e.kind === 'FIRED' && e.day === today).map((e) => [e.nudgeId, e.at]),
    });
    trace = trace.slice(-5);

    const fs = state.nudgeEvents.filter((e) => e.kind === 'FIRED');
    const uniq = new Set<string>();
    for (const e of fs) {
      const key = e.nudgeId + '|' + e.at;
      if (uniq.has(key)) fail('I2', key);
      uniq.add(key);
    }
    for (const day of new Set(fs.map((e) => e.day))) {
      const es = fs.filter((e) => e.day === day);
      const rings = new Set(es.filter((e) => !/^(event|cycle|summary):/.test(e.nudgeId)).map((e) => (e.via ?? e.nudgeId) + '|' + e.at));
      if (rings.size > state.settings.dailyNudgeCap) fail('I1', { day, count: rings.size, cap: state.settings.dailyNudgeCap });
      for (const h of ['tea', 'fixed', 'sq', 'walk']) {
        const own = es.filter((e) => (h === 'tea' ? e.nudgeId.startsWith('int:tea:') : h === 'fixed' ? e.nudgeId.startsWith('fix:fixed:') : e.nudgeId.startsWith('rot:') && e.habitIds.includes(h)));
        const ownRings = new Set(own.map((e) => (e.via ?? e.nudgeId) + '|' + e.at));
        if (ownRings.size > 2) fail('I5', { day, h, count: ownRings.size, events: own });
      }
    }
    if (saved) {
      for (const o of os.filter((o) => o.day >= addDays(today, -7) && o.at >= now - 3 * 86_400_000)) {
        for (const id of ids(o)) {
          const matches = fs.filter((e) => e.nudgeId === id && e.at === o.at);
          if (matches.length !== 1) fail('I3-missing', { o, id, count: matches.length });
        }
      }
      for (const e of fs) if (!os.some((o) => o.at === e.at && ids(o).includes(e.nudgeId))) fail('I3-phantom', e);
    }
    // Soft check: the global budget has room and the habit has a valid slot on its own, yet the
    // combined plan (merged slots included) offers it none.
    const used = new Set(planningState.nudgeEvents.filter((e) => e.kind === 'FIRED' && e.day === today).map((e) => (e.via ?? e.nudgeId) + '|' + e.at)).size;
    if (used + plan.filter((n) => n.day === today).length < state.settings.dailyNudgeCap) {
      const input = planInputFor(planningState, today, now, zone);
      for (const h of input.habits.filter((h) => !h.doneToday && !h.donePeriod)) {
        if (!plan.some((n) => n.day === today && n.habitIds.includes(h.id)) && planNudges({ ...input, habits: [h], water: undefined }).some((n) => n.day === today && n.habitIds.includes(h.id))) fail('I7-soft', { habit: h.id, today });
      }
    }
  }

  reconcile();
  while (now < end) {
    step++;
    const closed = rand() < 0.12;
    now += (closed ? 360 + Math.floor(rand() * 481) : 1 + Math.floor(rand() * 180)) * MIN;
    const fresh: Pending[] = [];
    for (const [id, n] of pending) {
      if (n.at > now) continue;
      pending.delete(id);
      os.push(n);
      fresh.push(n);
      for (const x of ids(n)) permitted.delete(x);
    }
    if (!rolled && now >= instantOf(addDays(start, 5), 720, zone)) {
      now -= 120 * MIN;
      rolled = true;
    }
    const ctx: CommandContext = { nowMs: now, zone, today: trackingDayOf(now, zone, 3), newId: () => `sim${++uid}` };
    if (fresh.length && rand() < 0.65) {
      const n = fresh[Math.floor(rand() * fresh.length)]!;
      const choices: (NudgeActionKind | 'TAP')[] = ['DONE', 'SNOOZE', 'TAP', ...(n.actions.includes('SWAP') ? (['SWAP'] as const) : [])];
      const action = choices[Math.floor(rand() * choices.length)]!;
      const p = parsePayload({ ...n, nudgeId: n.id })!;
      state = applyAll(state, nudgeResponseActions(state, p, action, ctx), reducer);
      if (action === 'SNOOZE' || action === 'SWAP') for (const id of ids(n)) permitted.add(id);
      trace.push({ step, action, id: n.id, at: n.at, now });
      trace = trace.slice(-5);
    } else if (rand() < 0.15) {
      const h = state.habits[Math.floor(rand() * state.habits.length)]!;
      state = applyAll(state, completeFromNudge(state, h, ctx), reducer);
    }
    reconcile();
  }
  reconcile(true);
  return reconciles;
}

describe('the nudge pipeline on a randomised phone', () => {
  it(`holds its invariants over ${SEEDS.length * SEQUENCES_PER_SEED} ten-day sequences`, () => {
    const first: Record<string, Breach> = {};
    const counts: Record<string, number> = {};
    let reconciles = 0;
    for (const seed of SEEDS) {
      for (let seq = 0; seq < SEQUENCES_PER_SEED; seq++) {
        reconciles += runSequence(seed, seq, (key, breach) => {
          counts[key] = (counts[key] ?? 0) + 1;
          first[key] ??= breach;
        });
      }
    }
    assert.ok(reconciles > SEEDS.length * SEQUENCES_PER_SEED * 20, `too few reconciles to mean anything: ${reconciles}`);
    assert.deepEqual(counts, {}, `invariant breaches (first of each): ${JSON.stringify(first, null, 1)}`);
  });
});
