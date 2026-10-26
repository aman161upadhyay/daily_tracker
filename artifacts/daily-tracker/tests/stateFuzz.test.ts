/**
 * Randomised state fuzz (council round 18, promoted from the fuzz lens's generator): seeded random
 * sequences of reducer actions and command builders, with the clock moving both ways across a DST
 * change and the 3 am boundary, in two zones. After every transition the state must still pass the
 * validator and an export → parse round trip, keep its references intact, have unique chronological
 * rule versions, restore what a clear-day removed, feed every selector without a non-finite number,
 * and survive a SQLite persist → load and replace → load unchanged.
 *
 * `FUZZ_SEQUENCES` (default 6) sets how many sequences run; `FUZZ_START` offsets the seeds. A failure
 * prints the seed, the step and the last actions so the sequence can be replayed.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { reducer, type Action } from '../src/state/reducer';
import * as C from '../src/state/commands';
import * as S from '../src/state/selectors';
import { buildEmptyState, buildSampleState, habitFromPreset } from '../src/state/seed';
import { PRESETS } from '../src/library/presets';
import { parseState } from '../src/data/store';
import { validateRecords } from '../src/data/validate';
import { SqliteStore } from '../src/data/sql/sqliteStore';
import { trackingDayOf, addDays } from '../src/domain/time/trackingDay';
import { dayRecords } from '../src/domain/habits/records';
import { widgetModel } from '../src/widget/model';
import type { TrackerState } from '../src/state/types';

/* eslint-disable @typescript-eslint/no-explicit-any */

class Driver {
  db = new DatabaseSync(':memory:');
  async execAsync(s: string) {
    this.db.exec(s);
  }
  async runAsync(s: string, p: any[]) {
    return this.db.prepare(s).run(...p);
  }
  async getAllAsync(s: string, p: any[]) {
    return this.db.prepare(s).all(...p);
  }
  async withTransactionAsync(f: () => Promise<void>) {
    this.db.exec('BEGIN');
    try {
      await f();
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
}

/** Collection order is not storage semantics: keyed rows are sorted, primitive arrays (reminder times) kept. */
function canon(x: any): any {
  if (Array.isArray(x)) {
    const a = x.map(canon);
    return a.length && typeof a[0] === 'object' ? a.sort((p, q) => JSON.stringify(p).localeCompare(JSON.stringify(q))) : a;
  }
  if (x && typeof x === 'object')
    return Object.fromEntries(
      Object.keys(x)
        .sort()
        .filter((k) => x[k] !== undefined)
        .map((k) => [k, canon(x[k])]),
    );
  return x;
}

function finite(x: any): void {
  if (typeof x === 'number') assert(Number.isFinite(x), `non-finite number ${x}`);
  else if (x instanceof Map) [...x.values()].forEach(finite);
  else if (x && typeof x === 'object') Object.values(x).forEach(finite);
}

interface Breach {
  kind: string;
  seed: number;
  seq: number;
  step: number;
  error: string;
  trail: unknown[];
}

async function runSequence(seq: number, steps: number): Promise<Breach | null> {
  const seed = (0x1234abcd + Math.imul(seq + 1, 2654435761)) >>> 0;
  let rand = seed;
  const r = (n: number) => {
    rand ^= rand << 13;
    rand ^= rand >>> 17;
    rand ^= rand << 5;
    return (rand >>> 0) % n;
  };
  const pick = <T>(a: readonly T[]): T => a[r(a.length)];
  let serial = 0;
  let now = Date.parse('2026-10-30T12:00:00Z');
  const zone = seq % 2 ? 'America/New_York' : 'Europe/Berlin';
  let state: any = buildEmptyState('2026-10-30');
  let undo: any[] = [];
  const drivers = [new Driver(), new Driver()];
  const [store, full] = await Promise.all(drivers.map((d) => SqliteStore.open(d as any)));
  await store.replace(state);
  const trail: unknown[] = [];
  let breach: Breach | null = null;
  try {
    for (let step = 0; step < steps; step++) {
      const delta = pick([-360, -60, 0, 20, 60, 180, 720, 1440]) * 60000;
      now += delta;
      const today = trackingDayOf(now, zone, 3);
      const ctx = { nowMs: now, zone, today, newId: () => `f${seq}_${serial++}` };
      const h = pick(state.habits as any[]);
      const id = ctx.newId();
      let actions: Action[] = [];
      const policy = {
        habitId: h?.id ?? id,
        kind: pick(['INTERVAL', 'FIXED', 'NONE'] as const),
        intervalMin: pick([5, 30, 90, 1440]),
        times: ['08:15', '17:45'],
        onlyWhenBehind: !!r(2),
        maxPerDay: r(12),
        enabled: !!r(2),
      };
      switch (r(26)) {
        case 0:
        case 1: {
          const p = pick(PRESETS.filter((x) => !state.habits.some((y: any) => y.presetId === x.id)));
          if (p) actions = [{ type: 'ADD_HABIT', ...habitFromPreset(p, id, today) } as Action];
          break;
        }
        case 2:
        case 3:
          actions = [
            C.newHabitAction(
              {
                name: `Habit ${id}`,
                type: pick(['YES_NO', 'COUNT', 'AMOUNT', 'TIMER']),
                category: pick(['craft', 'mind', 'fuel']),
                unit: 'units',
                icon: 'check',
                cadence: pick(['DAILY', 'WEEKLY', 'MONTHLY']),
                timesPerPeriod: 1 + r(7),
                target: 1 + r(100),
                freezesPerMonth: r(5),
                pinned: !!r(2),
                reminder: policy,
              } as any,
              id,
              today,
            ),
          ];
          break;
        case 4:
          if (h) actions = C.ruleChangeActions(state, h, { cadence: pick(['DAILY', 'WEEKLY', 'MONTHLY']), timesPerPeriod: 1 + r(7), target: 1 + r(100), freezesPerMonth: r(5) } as any, today);
          break;
        case 5:
          if (h) actions = C.targetChangeActions(state, h, h.presetId === 'water' ? 100 + r(19000) : 1 + r(100), today);
          break;
        case 6:
          if (h) actions = [{ type: 'UPDATE_HABIT', id: h.id, patch: { archived: !h.archived, pinned: !!r(2) } }];
          break;
        case 7:
          if (h) actions = [{ type: 'DELETE_HABIT', id: h.id }];
          break;
        case 8:
        case 9:
          if (h) actions = C.completeFromNudge(state, h, ctx);
          break;
        case 10:
          if (h && !h.snackType && !h.mindKind && h.presetId !== 'water')
            actions = [{ type: pick(['ADD_ENTRY', 'TOGGLE_ENTRY']), entry: { id, habitId: h.id, day: today, at: now, zone, value: 1 + r(50), source: 'MANUAL' } } as Action];
          break;
        case 11:
          if (h) {
            undo = dayRecords(state, h, today);
            actions = [{ type: 'CLEAR_DAY', habit: h, day: today }];
          }
          break;
        case 12:
          actions = [
            { type: 'RESTORE_LOGS', records: undo },
            { type: 'RESTORE_LOGS', records: undo },
          ];
          break;
        case 13:
          actions = [{ type: 'ADD_WATER', entry: { id, at: now, zone, day: today, ml: pick([150, 250, 500, 2000]), source: 'MANUAL' } }];
          break;
        case 14:
          actions = [{ type: 'UNDO_WATER', day: today }];
          break;
        case 15:
          actions = [{ type: 'LOG_SNACK', snack: { id, at: now, day: today, zone, type: pick(['WALK', 'SQUATS', 'CALF_RAISES']), reps: 10, trigger: 'MANUAL' } } as Action];
          break;
        case 16:
          actions = [{ type: 'LOG_MIND', session: { id, startAt: now - 600000, endAt: now, day: today, zone, kind: pick(['BREATHING', 'MEDITATION']), minutes: 10 } } as Action];
          break;
        case 17:
          if (h) actions = [{ type: 'SET_POLICY', policy } as Action];
          break;
        case 18:
          actions = [
            {
              type: 'UPDATE_SETTINGS',
              patch: { weekStart: pick(['sunday', 'monday']), units: pick(['ml', 'oz']), activeStartMin: r(1440), activeEndMin: r(1440), dailyNudgeCap: r(101), onboardingDone: true, dayBoundaryHour: 3, cycleEnabled: true },
            } as Action,
          ];
          break;
        case 19:
          actions = [{ type: 'SET_CYCLE_LOG', log: { day: today, symptoms: { cramps: 1 + r(3) }, flow: 1 + r(3), mood: 1 + r(5) } } as Action];
          break;
        case 20:
          actions = [{ type: 'PERIOD_START', day: addDays(today, -r(10)), today }];
          break;
        case 21:
          actions = [{ type: 'PERIOD_END', day: today }];
          break;
        case 22:
          actions = C.firedActions(state, [{ id: `slot-${seq}-${step}`, habitIds: h ? [h.id] : [], day: today, at: now }], ctx);
          break;
        case 23:
          actions = C.nudgeResponseActions(state, { nudgeId: `slot-${seq}-${step - 1}`, habitIds: h ? [h.id] : [], kind: 'FIXED', day: today } as any, pick(['DONE', 'SNOOZE', 'SWAP', 'WATER']), ctx);
          break;
        case 24:
          actions = [{ type: 'REPLACE', state: parseState(JSON.parse(JSON.stringify(state))) }];
          break;
        case 25: {
          const log = pick(['entry', 'water', 'snack', 'mind'] as const);
          const key = { entry: 'entries', water: 'water', snack: 'snacks', mind: 'mind' }[log];
          const record = pick(state[key] as any[]);
          if (record) {
            undo = [{ log, record }];
            actions = [{ type: 'REMOVE_LOG', log, id: record.id } as Action];
          }
          break;
        }
      }
      // A full sample replacement late in every tenth sequence (early, its 140-day history would swamp the exploration).
      if (step === steps - 1 && seq % 10 === 0) actions = [{ type: 'REPLACE', state: buildSampleState(today, zone, now) }];
      const prev: TrackerState = state;
      for (const a of actions) state = reducer(state, a);
      trail.push({ step, now, today, actions: actions.map((a) => (a.type === 'REPLACE' ? { type: 'REPLACE', sample: a.state.settings.sampleData } : a)) });

      const check = async (kind: string, f: () => unknown) => {
        if (breach) return;
        try {
          await f();
        } catch (e: any) {
          breach = { kind, seed, seq, step, error: e?.message ?? String(e), trail: trail.slice(-6) };
        }
      };
      await check('validator', () => {
        validateRecords(state);
        parseState(JSON.parse(JSON.stringify(state)));
      });
      await check('integrity', () => {
        const ids = new Set(state.habits.map((x: any) => x.id));
        for (const list of [state.rules, state.policies, state.entries]) for (const x of list) assert(ids.has(x.habitId), `orphan ${x.habitId}`);
        for (const x of state.habits) {
          const rules = S.rulesFor(state, x.id);
          assert(rules.length > 0, 'a habit without a rule');
          assert(
            rules.every((v: any, i: number) => !i || rules[i - 1].effectiveFrom < v.effectiveFrom),
            'rule versions not unique and chronological',
          );
        }
        finite(state);
      });
      await check('restore-idempotency', () => {
        const once = reducer(state, { type: 'RESTORE_LOGS', records: undo });
        assert.deepEqual(canon(reducer(once, { type: 'RESTORE_LOGS', records: undo })), canon(once));
      });
      await check('clear-then-restore', () => {
        if (!h || !state.habits.some((x: any) => x.id === h.id)) return;
        const records = dayRecords(state, h, today);
        const back = reducer(reducer(state, { type: 'CLEAR_DAY', habit: h, day: today }), { type: 'RESTORE_LOGS', records });
        assert.deepEqual(canon(back), canon(state));
      });
      await check('undo-water', () => {
        if (actions[0]?.type !== 'UNDO_WATER') return;
        const eligible = prev.water.filter((w) => w.day === today);
        const last = eligible.reduce<(typeof eligible)[number] | null>((a, b) => (!a || b.at >= a.at ? b : a), null);
        assert.deepEqual(
          state.water,
          prev.water.filter((w) => w !== last),
        );
      });
      await check('selectors', () => {
        for (const x of state.habits) finite(S.habitView(state, x, today));
        for (const fn of [S.todaySummary, S.liveNudge, S.planInputFor, S.nudgePlan]) finite((fn as any)(state, today, now, zone));
        for (const fn of [S.highlights, S.weekSummaryText, S.rotationHabit, S.cycleTimeline, S.cycleExpectedDay, S.cycleReminderFires]) finite((fn as any)(state, today));
        finite(S.cycleInsights(state));
        finite(widgetModel(state, today, now, zone));
      });
      await check('persist', async () => {
        await store.persist(prev, state);
        assert.deepEqual(canon(await store.load()), canon(state));
      });
      await check('replace', async () => {
        await full.replace(state);
        assert.deepEqual(canon(await full.load()), canon(state));
      });
      if (step % 20 === 19) await check('persists-vs-replace', async () => assert.deepEqual(canon(await store.load()), canon(await full.load())));
      // Pruned only when a nudge event was folded (the documented lazy retention trigger).
      if (actions.some((a) => a.type === 'NUDGE_EVENT'))
        await check('retention', () => assert(state.nudgeEvents.every((e: any) => e.day >= addDays(today, -C.NUDGE_EVENT_RETENTION_DAYS)), 'a nudge event older than the retention window'));
      if (breach) break;
    }
  } finally {
    drivers.forEach((d) => d.db.close());
  }
  return breach;
}

const SEQUENCES = Number(process.env.FUZZ_SEQUENCES ?? 6);
const START = Number(process.env.FUZZ_START ?? 0);

describe('randomised state fuzz (FUZZ18)', () => {
  it(`holds every invariant over ${SEQUENCES} seeded sequences of 150 steps`, async () => {
    for (let seq = START; seq < START + SEQUENCES; seq++) {
      const breach = await runSequence(seq, 150);
      assert.equal(breach, null, breach ? `invariant "${breach.kind}" broke: ${breach.error}\nreplay: ${JSON.stringify({ seed: breach.seed, seq: breach.seq, step: breach.step, trail: breach.trail })}` : undefined);
    }
  });
});
