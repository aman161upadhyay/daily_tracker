/// <reference types="node" />
/**
 * Council round 9 regressions: one-to-one twin matching of imported drinks, "when the period
 * begins" on the logged day, the estimated/predicted wording, the linear session sweep under an
 * anomalous record, the planner's tracking-day slots, merged notifications written per
 * constituent (and counted once against the cap), a snooze past the active window, a met weekly
 * quota settling the rest of the week, the segment index, the incremental period counts, the
 * per-habit view memo, the widget's ring value and the schema's `via` column.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { distinctSleep, distinctSessions } from '../src/domain/body/stats';
import type { SleepNight } from '../src/domain/body/types';
import { nextFire } from '../src/domain/cycle/reminders';
import { phaseQualifier, predictCycle } from '../src/domain/cycle/timeline';
import { cadenceSegments, periodRequired, segmentStartIn, segmentStartOn } from '../src/domain/habits/streaks';
import type { CycleReminder, Habit, HabitEntry, HabitRule, NudgeEvent, NudgePolicy, WaterEntry } from '../src/domain/models';
import { planNudges, type PlanHabit, type PlanInput, type ScheduledNudge } from '../src/domain/nudges/planner';
import { addDays, instantOf, minutesOfDay } from '../src/domain/time/trackingDay';
import { MIGRATIONS, migrate, SCHEMA_VERSION } from '../src/data/sql/schema';
import type { SqlDriver, SqlValue } from '../src/data/sql/driver';
import { twinImports } from '../src/state/bodyCommands';
import { applyAll, firedActions, nudgeEventActions, nudgeResponseActions, parsePayload, type CommandContext } from '../src/state/commands';
import { reducer } from '../src/state/reducer';
import { buildEmptyState } from '../src/state/seed';
import { dayValues, habitRatios, habitView, periodDoneOn, rulesFor, segmentFrom, weekSummaryText } from '../src/state/selectors';
import type { TrackerState } from '../src/state/types';
import { ringValue } from '../src/widget/layout';

const ZONE = 'America/New_York';
const TODAY = '2026-10-25'; // a Sunday
const NOW = instantOf(TODAY, 14 * 60 + 30, ZONE);
let seq = 0;
const ctx: CommandContext = { nowMs: NOW, zone: ZONE, today: TODAY, newId: () => `r9-${++seq}` };
const at = (day: string, hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return instantOf(day, h! * 60 + m!, ZONE);
};
const clock = (n: ScheduledNudge) => {
  const min = minutesOfDay(n.at, ZONE);
  return `${n.day} ${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
};

describe('health: imported drinks pair one-to-one with the drinks logged here', () => {
  const manual = (id: string, atMs: number, ml = 250): WaterEntry => ({ id, at: atMs, zone: ZONE, day: TODAY, ml, source: 'MANUAL' });

  it('two imports around one manual drink: only the nearer is its copy', () => {
    const upstream = [
      { id: 'hc-a', at: NOW - 4 * 60_000, ml: 250 },
      { id: 'hc-b', at: NOW + 3 * 60_000, ml: 250 },
    ];
    const twins = twinImports(upstream, [manual('m1', NOW)]);
    assert.deepEqual([...twins], ['hc-b'], 'one manual row stands for one import — the closest');
  });

  it('closest pairs first, each row used once; amount and window still apply', () => {
    const upstream = [
      { id: 'hc-1', at: NOW - 60_000, ml: 250 },
      { id: 'hc-2', at: NOW + 60_000, ml: 250 },
      { id: 'hc-3', at: NOW + 9 * 60_000, ml: 250 },
      { id: 'hc-4', at: NOW + 2 * 60_000, ml: 500 },
    ];
    const twins = twinImports(upstream, [manual('m1', NOW), manual('m2', NOW + 2 * 60_000), manual('m3', NOW + 60 * 60_000)]);
    assert.deepEqual([...twins].sort(), ['hc-1', 'hc-2'], 'm1↔hc-1 and m2↔hc-2 pair up; hc-3 is too far from m2 once m2 is taken, hc-4 is a bigger drink');
  });

  it('is deterministic whatever the upstream order', () => {
    const upstream = [
      { id: 'hc-x', at: NOW + 2 * 60_000, ml: 250 },
      { id: 'hc-y', at: NOW - 2 * 60_000, ml: 250 },
    ];
    const a = [...twinImports(upstream, [manual('m1', NOW)])];
    const b = [...twinImports([...upstream].reverse(), [manual('m1', NOW)])];
    assert.deepEqual(a, b);
    assert.equal(a.length, 1);
  });
});

describe('cycle: wording and the first day of the period', () => {
  const RULES = { avgCycleDays: 28, periodDays: 5, lutealDays: 14 };
  const history = [{ start: '2026-08-02', end: '2026-08-06' }, { start: '2026-08-30', end: '2026-09-03' }, { start: '2026-09-28', end: '2026-10-02' }];
  const onStart: CycleReminder = { id: 'p0', label: 'Heat pad', anchor: 'PHASE_START', phase: 'period', offsetDays: 0, minute: 9 * 60, enabled: true };

  it('"when the period begins" fires on the logged start itself, confirmed', () => {
    const prediction = predictCycle(history, RULES, '2026-09-28')!;
    assert.deepEqual(nextFire(onStart, prediction, '2026-09-28'), { day: '2026-09-28', confirmed: true });
    // The day after, it points at the next predicted start — shown, not scheduled.
    assert.deepEqual(nextFire(onStart, predictCycle(history, RULES, '2026-09-29')!, '2026-09-29'), { day: '2026-10-26', confirmed: false });
  });

  it('an estimated phase reads "estimated" up to today and "predicted" after it', () => {
    assert.equal(phaseQualifier({ estimated: true }, '2026-10-20', TODAY), 'estimated');
    assert.equal(phaseQualifier({ estimated: true }, TODAY, TODAY), 'estimated');
    assert.equal(phaseQualifier({ estimated: true }, '2026-10-30', TODAY), 'predicted');
    assert.equal(phaseQualifier({ estimated: false }, '2026-10-30', TODAY), '');
    assert.equal(phaseQualifier(null, '2026-10-30', TODAY), '');
  });
});

describe('health: the session sweep stays linear under one anomalous record', () => {
  const H = 3600_000;
  const night = (i: number, over: Partial<SleepNight> = {}): SleepNight => {
    const end = at(addDays('2024-01-01', i), '07:00');
    return { id: `n${i}`, day: addDays('2024-01-01', i), startAt: end - 8 * H, endAt: end, minutes: 480, ...over };
  };

  it('counts each night once with a 400-hour record in the list, and the record once', () => {
    const nights = Array.from({ length: 900 }, (_, i) => night(i));
    const monster: SleepNight = { id: 'monster', day: '2024-02-01', startAt: at('2024-02-01', '00:00'), endAt: at('2024-02-01', '00:00') + 400 * H, minutes: 400 * 60 };
    const comparisons = { n: 0 };
    const out = distinctSessions([...nights, monster], () => (comparisons.n++, true), (a, b) => (b.minutes > a.minutes ? b : a));
    // The nights that share more than half of themselves with the monster fold into it (the richer
    // record stands for the group); every other night stands alone.
    const folded = nights.filter((n) => Math.min(n.endAt, monster.endAt) - Math.max(n.startAt, monster.startAt) > 0.5 * (n.endAt - n.startAt)).length;
    assert.equal(out.length, 900 + 1 - folded);
    assert.ok(comparisons.n < 900 * 4, `a few comparisons per session, not a scan of the history (${comparisons.n})`);
    assert.equal(distinctSleep(nights).length, 900);
  });
});

describe('planner: tracking-day slots', () => {
  const policy = (over: Partial<NudgePolicy> & { habitId: string }): NudgePolicy => ({ kind: 'ROTATION', intervalMin: 60, onlyWhenBehind: false, maxPerDay: 8, enabled: true, ...over });
  const habit = (over: Partial<PlanHabit> & { id: string }): PlanHabit => ({ name: over.id, policy: policy({ habitId: over.id }), doneToday: false, donePeriod: false, todayRatio: 0, movement: false, ...over });
  const squats = habit({ id: 'squats', name: 'Squat snack', snackType: 'SQUATS', movement: true });
  const walk = habit({ id: 'walk', name: 'Walk break', snackType: 'WALK', movement: true, policy: policy({ habitId: 'walk', kind: 'INTERVAL' }) });
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

  it('a 1 am clock time belongs to the evening before it: settled by today, labelled with today', () => {
    const late = habit({ id: 'late', name: 'Stretch', policy: policy({ habitId: 'late', kind: 'FIXED', times: ['01:00'], maxPerDay: 1 }) });
    const open = planNudges(input({ habits: [late] }));
    const firstNight = open.find((n) => n.id === `fix:late:2026-10-26:01:00`);
    assert.ok(firstNight, 'tonight at 1 am is planned');
    assert.equal(clock(firstNight!), '2026-10-25 01:00', 'the slot carries the tracking day it is judged by');
    const done = planNudges(input({ habits: [{ ...late, doneToday: true }] }));
    assert.ok(!done.some((n) => n.id === `fix:late:2026-10-26:01:00`), 'done today covers tonight');
    assert.ok(done.some((n) => n.id === `fix:late:2026-10-27:01:00`), 'tomorrow night is another tracking day');
  });

  it('a snooze that lands past the end of the active hours is over for the day', () => {
    const base = todayOnly(planNudges(input()));
    const last = base[base.length - 1]!;
    const beforeEnd = at(TODAY, '20:45');
    const events: NudgeEvent[] = [{ id: 's', nudgeId: last.id, habitIds: last.habitIds, at: beforeEnd, zone: ZONE, day: TODAY, kind: 'SNOOZED', untilMs: at(TODAY, '21:10') }];
    const plan = todayOnly(planNudges(input({ nowMs: beforeEnd + 60_000, nudgeEvents: events })));
    assert.ok(!plan.some((n) => n.id === last.id), 'not deferred into the night');
    const fixed = habit({ id: 'late', name: 'Stretch', policy: policy({ habitId: 'late', kind: 'FIXED', times: ['20:50'], maxPerDay: 1 }) });
    const fixedPlan = planNudges(input({ nowMs: beforeEnd + 60_000, habits: [fixed], nudgeEvents: [{ id: 'f', nudgeId: `fix:late:${TODAY}:20:50`, habitIds: ['late'], at: beforeEnd, zone: ZONE, day: TODAY, kind: 'SNOOZED', untilMs: at(TODAY, '21:10') }] }));
    assert.equal(fixedPlan.find((n) => n.id === `fix:late:${TODAY}:20:50`) && clock(fixedPlan.find((n) => n.id === `fix:late:${TODAY}:20:50`)!), '2026-10-25 21:10', 'an explicit clock time keeps its snooze');
  });

  it('a met weekly quota settles the rest of the week, not just today', () => {
    const weekly = habit({ id: 'lift', name: 'Strength session', policy: policy({ habitId: 'lift', kind: 'FIXED', times: ['18:00'], maxPerDay: 1 }), donePeriod: true, periodEndsOn: '2026-10-26' });
    // Sunday the 25th is the last day of its week in this fixture? No: the week runs Mon–Sun, so
    // the 25th is the last day; set the period end to tomorrow to see the settlement reach it.
    const plan = planNudges(input({ habits: [weekly] }));
    assert.ok(!plan.some((n) => n.habitIds.includes('lift')), 'nothing until the period is over');
    const nextWeek = planNudges(input({ habits: [{ ...weekly, periodEndsOn: TODAY }] }));
    assert.ok(nextWeek.some((n) => n.id === 'fix:lift:2026-10-26:18:00'), 'the next period starts fresh');
  });

  it('a merged notification that rang counts once against the daily cap', () => {
    const capped = input({ settings: { ...input().settings, dailyNudgeCap: 2 } });
    const base = todayOnly(planNudges(capped));
    assert.equal(base.length, 2);
    const first = base[0]!;
    // Two slots merged into `first`; both are written down, the second pointing at the first.
    const events: NudgeEvent[] = [
      { id: 'a', nudgeId: first.id, habitIds: first.habitIds, at: first.at, zone: ZONE, day: TODAY, kind: 'FIRED' },
      { id: 'b', nudgeId: `${first.id}:other`, habitIds: first.habitIds, at: first.at, zone: ZONE, day: TODAY, kind: 'FIRED', via: first.id },
    ];
    const after = todayOnly(planNudges({ ...capped, nowMs: first.at + 60_000, nudgeEvents: events }));
    assert.equal(after.length, 1, 'one ring spent one of the two; the other slot is still offered');
  });
});

describe('merged notifications are written per constituent', () => {
  it('nudgeEventActions writes one event per slot, the others pointing at the notification', () => {
    const actions = nudgeEventActions({ nudgeId: 'rot:1', habitIds: ['squats', 'walk'], mergedIds: ['rot:1', 'int:walk:1'] }, 'SNOOZED', ctx, NOW + 15 * 60_000);
    const events = actions.map((a) => (a.type === 'NUDGE_EVENT' ? a.event : null));
    assert.deepEqual(
      events.map((e) => [e!.nudgeId, e!.via, e!.kind, e!.untilMs]),
      [
        ['rot:1', undefined, 'SNOOZED', NOW + 15 * 60_000],
        ['int:walk:1', 'rot:1', 'SNOOZED', NOW + 15 * 60_000],
      ],
    );
  });

  it('firedActions records every slot of a merged delivery once', () => {
    const state = buildEmptyState(TODAY, undefined, { withWater: false });
    const actions = firedActions(state, [{ id: 'rot:1', habitIds: ['squats'], day: TODAY, at: NOW, mergedIds: ['rot:1', 'water:1'] }], ctx);
    const next = applyAll(state, actions, reducer);
    assert.deepEqual(next.nudgeEvents.map((e) => [e.nudgeId, e.via ?? null, e.kind]).sort(), [
      ['rot:1', null, 'FIRED'],
      ['water:1', 'rot:1', 'FIRED'],
    ]);
    // A second report of the same delivery adds nothing.
    assert.equal(firedActions(next, [{ id: 'rot:1', habitIds: ['squats'], day: TODAY, at: NOW, mergedIds: ['rot:1', 'water:1'] }], ctx).length, 0);
  });

  it('the payload carries the constituent ids and the response settles all of them', () => {
    const payload = parsePayload({ nudgeId: 'rot:1', habitIds: ['squats'], kind: 'ROTATION', day: TODAY, mergedIds: ['rot:1', 'int:walk:1'] });
    assert.ok(payload);
    assert.deepEqual(payload!.mergedIds, ['rot:1', 'int:walk:1']);
    const state = buildEmptyState(TODAY, undefined, { withWater: false });
    const next = applyAll(state, nudgeResponseActions(state, payload!, 'SNOOZE', ctx), reducer);
    assert.deepEqual(next.nudgeEvents.map((e) => e.nudgeId).sort(), ['int:walk:1', 'rot:1']);
  });

  it('a malformed mergedIds list is dropped, not trusted', () => {
    const payload = parsePayload({ nudgeId: 'rot:1', habitIds: ['squats'], kind: 'ROTATION', day: TODAY, mergedIds: 'rot:1' });
    assert.ok(payload);
    assert.equal(payload!.mergedIds, undefined);
  });
});

describe('cadence segments: one walk, then lookups', () => {
  const rules: HabitRule[] = [
    { habitId: 'h', effectiveFrom: '2025-01-01', cadence: 'WEEKLY', timesPerPeriod: 3, target: 1, freezesPerMonth: 0 },
    { habitId: 'h', effectiveFrom: '2025-03-12', cadence: 'MONTHLY', timesPerPeriod: 8, target: 1, freezesPerMonth: 0 },
    { habitId: 'h', effectiveFrom: '2025-09-04', cadence: 'DAILY', timesPerPeriod: 1, target: 1, freezesPerMonth: 0 },
  ];

  it('the segment list agrees with the day-by-day walk on every day of a year', () => {
    const segments = cadenceSegments(rules, '2025-01-01', '2026-01-10');
    assert.deepEqual(
      segments.map((s) => [s.from, s.cadence]),
      [
        ['2025-01-01', 'WEEKLY'],
        ['2025-03-17', 'MONTHLY'], // the Monday after the week the rule landed in
        ['2025-10-01', 'DAILY'], // the first day after the month the rule landed in
      ],
    );
    for (let d = '2024-12-30'; d <= '2026-01-10'; d = addDays(d, 1)) {
      assert.equal(segmentStartIn(segments, d, '2025-01-01'), segmentStartOn(rules, '2025-01-01', d), d);
    }
  });

  it('a single cadence is one segment without a walk', () => {
    assert.deepEqual(cadenceSegments([rules[0]!], '2025-01-01', '2030-01-01'), [{ from: '2025-01-01', cadence: 'WEEKLY' }]);
    assert.deepEqual(cadenceSegments([], '2025-01-01', '2030-01-01'), [{ from: '2025-01-01', cadence: 'DAILY' }]);
  });

  it('the quota counts the days of the period arithmetically, days off excluded', () => {
    const monthly = { cadence: 'MONTHLY' as const, timesPerPeriod: 10 };
    assert.equal(periodRequired(monthly, '2025-03-20', '2025-01-01'), 10);
    assert.equal(periodRequired(monthly, '2025-03-20', '2025-03-17'), Math.round((10 * 15) / 31));
    assert.equal(periodRequired(monthly, '2025-03-20', '2025-04-01'), 0, 'a segment starting after the period');
    assert.equal(periodRequired(monthly, '2025-03-20', '2025-03-17', new Set(['2025-03-18', '2025-03-31', '2025-04-02'])), Math.round((10 * 13) / 31));
  });
});

describe('selectors: period counts and views across states', () => {
  const withHabit = (withWater = true): TrackerState => {
    const state = buildEmptyState('2025-01-01', undefined, { withWater });
    const habit: Habit = { id: 'h', name: 'Lift', category: 'body', type: 'COUNT', unit: 'x', icon: 'shield', createdDay: '2025-01-01', archived: false, pinned: false };
    let s: TrackerState = { ...state, habits: [...state.habits, habit] };
    s = {
      ...s,
      rules: [
        ...s.rules,
        { habitId: 'h', effectiveFrom: '2025-01-01', cadence: 'WEEKLY', timesPerPeriod: 3, target: 1, freezesPerMonth: 0 },
        { habitId: 'h', effectiveFrom: '2025-03-12', cadence: 'MONTHLY', timesPerPeriod: 8, target: 2, freezesPerMonth: 0 },
      ],
    };
    const entries: HabitEntry[] = [];
    for (let i = 0; i < 300; i++) {
      const day = addDays('2025-01-01', i);
      if (i % 3 !== 1) entries.push({ id: `e${i}`, habitId: 'h', day, at: instantOf(day, 12 * 60, ZONE), zone: ZONE, value: i % 5 === 0 ? 2 : 1, source: 'MANUAL' });
    }
    return { ...s, entries };
  };

  it('the running period count matches a count from the period start on every day', () => {
    const s = withHabit();
    const habit = s.habits.find((h) => h.id === 'h')!;
    const days: string[] = [];
    for (let i = 0; i < 300; i++) days.push(addDays('2025-01-01', i));
    const ratios = habitRatios(s, habit, days);
    let periodsSeen = 0;
    for (const r of ratios) {
      const rule = rulesFor(s, 'h').filter((x) => x.effectiveFrom <= r.day).pop()!;
      const from = segmentFrom(s, habit, r.day);
      const required = periodRequired(rule, r.day, from);
      const expected = required > 0 ? Math.min(1, periodDoneOn(s, habit, rule.cadence, r.day) / required) : 0;
      assert.ok(Math.abs(r.ratio - expected) < 1e-9, `${r.day}: ${r.ratio} vs ${expected}`);
      if (r.ratio === 1) periodsSeen++;
    }
    assert.ok(periodsSeen > 0, 'the fixture has met periods');
    // And a gap in the days asked for restarts the count rather than extending it.
    const sparse = habitRatios(s, habit, ['2025-04-02', '2025-04-04']);
    assert.deepEqual(
      sparse.map((r) => r.ratio),
      habitRatios(s, habit, ['2025-04-02']).concat(habitRatios(s, habit, ['2025-04-04'])).map((r) => r.ratio),
    );
  });

  it('a water tap leaves another habit\'s view and day values untouched', () => {
    const s = withHabit();
    const habit = s.habits.find((h) => h.id === 'h')!;
    const before = habitView(s, habit, '2025-10-27');
    const values = dayValues(s, habit);
    const tapped = reducer(s, { type: 'ADD_WATER', entry: { id: 'w', at: instantOf('2025-10-27', 12 * 60, ZONE), zone: ZONE, day: '2025-10-27', ml: 250, source: 'MANUAL' } });
    assert.equal(habitView(tapped, habit, '2025-10-27'), before, 'same view object');
    assert.equal(dayValues(tapped, habit), values, 'same values map');
    // Another habit's entry does not rebuild it; its own entry does (the memo follows the newest state).
    const other = reducer(tapped, { type: 'ADD_ENTRY', entry: { id: 'y', habitId: 'someone-else', day: '2025-10-27', at: instantOf('2025-10-27', 13 * 60, ZONE), zone: ZONE, value: 1, source: 'MANUAL' } });
    assert.equal(habitView(other, habit, '2025-10-27'), before);
    const own = reducer(other, { type: 'ADD_ENTRY', entry: { id: 'x', habitId: 'h', day: '2025-10-27', at: instantOf('2025-10-27', 13 * 60, ZONE), zone: ZONE, value: 1, source: 'MANUAL' } });
    const rebuilt = habitView(own, habit, '2025-10-27');
    assert.notEqual(rebuilt, before);
    assert.equal(rebuilt.todayValue, before.todayValue + 1);
    // Another day is another view.
    assert.notEqual(habitView(own, habit, '2025-10-28'), rebuilt);
  });

  it('the week summary counts a monthly habit by its share of the week', () => {
    const s = withHabit(false);
    const text = weekSummaryText(s, '2025-10-26');
    assert.match(text.body, /^\d of 2 targets/, `a week holds a share of the month's 8 — round(8 × 7 / 31) (${text.body})`);
  });
});

describe('widget: the ring shows a number, not "1,8…"', () => {
  it('keeps the full text when it fits and shortens step by step when it does not', () => {
    assert.deepEqual(ringValue('6', 60, 20), { text: '6', size: 20 });
    const full = ringValue('750 ml', 32, 14);
    assert.ok(full.size >= 11, `legible: ${full.size}`);
    assert.equal(full.text, '750');
    const oz = ringValue('1,893 oz', 32, 14);
    assert.ok(oz.size >= 9);
    assert.ok(['1,893', '1.9k'].includes(oz.text), oz.text);
    assert.equal(oz.text, '1.9k', 'the thousands compact when the plain number is still too small');
    assert.equal(ringValue('20,000 ml', 32, 14).text, '20k');
    assert.equal(ringValue('✓', 20, 14).text, '✓');
  });
});

describe('schema: the nudge ledger\'s `via` column', () => {
  class Driver implements SqlDriver {
    readonly db = new DatabaseSync(':memory:');
    async execAsync(sql: string): Promise<void> {
      this.db.exec(sql);
    }
    async runAsync(sql: string, params: SqlValue[]): Promise<unknown> {
      return this.db.prepare(sql).run(...params);
    }
    async getAllAsync<T>(sql: string, params: SqlValue[]): Promise<T[]> {
      return this.db.prepare(sql).all(...params) as T[];
    }
    async withTransactionAsync(task: () => Promise<void>): Promise<void> {
      this.db.exec('BEGIN');
      try {
        await task();
        this.db.exec('COMMIT');
      } catch (err) {
        this.db.exec('ROLLBACK');
        throw err;
      }
    }
  }

  it('a v4 database gains the column; a fresh one has it', async () => {
    const old = new Driver();
    for (const m of MIGRATIONS.slice(0, 4)) await old.execAsync(m);
    old.db.exec('PRAGMA user_version = 4');
    assert.deepEqual(await migrate(old), { from: 4, to: SCHEMA_VERSION });
    const cols = old.db.prepare('PRAGMA table_info(nudge_event)').all() as { name: string }[];
    assert.ok(cols.some((c) => c.name === 'via'));
    const fresh = new Driver();
    await migrate(fresh);
    const freshCols = fresh.db.prepare('PRAGMA table_info(nudge_event)').all() as { name: string }[];
    assert.ok(freshCols.some((c) => c.name === 'via'));
  });
});
