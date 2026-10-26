import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cycleAlerts, outlierSuggestions } from '../src/domain/cycle/alerts';
import { describeCorrelation, describeWindow, habitSymptomCorrelations, spearman, symptomPatterns } from '../src/domain/cycle/insights';
import { describeReminder, nextFireDay, upcomingReminders } from '../src/domain/cycle/reminders';
import { isEmptyLog, nextSeverity, SYMPTOMS } from '../src/domain/cycle/symptoms';
import {
  applyPeriodEnd,
  applyPeriodStart,
  averageCycleLength,
  buildTimeline,
  closeOlderOpenSpans,
  cycleLengths,
  displayPhase,
  predictCycle,
  rangeDays,
  startShortlyAfter,
  todayOffer,
} from '../src/domain/cycle/timeline';
import type { CycleDayLog, CycleReminder } from '../src/domain/models';
import { DEFAULT_SETTINGS } from '../src/domain/models';
import { planNudges, type PlanInput } from '../src/domain/nudges/planner';
import { reducer } from '../src/state/reducer';
import { buildEmptyState, buildSampleState } from '../src/state/seed';
import { completedCycles, cycleInsights, cycleReminderFires, planInputFor } from '../src/state/selectors';
import { instantOf } from '../src/domain/time/trackingDay';

const RULES = { avgCycleDays: 28, periodDays: 5, lutealDays: 14 };
const TODAY = '2026-10-26';

// Starts 28 / 29 / 28 days apart; the last period is closed.
const HISTORY = [
  { start: '2026-08-02', end: '2026-08-06' },
  { start: '2026-08-30', end: '2026-09-03' },
  { start: '2026-09-28', end: '2026-10-02' },
  { start: '2026-10-26' },
];
/** Three completed cycles (28, 28, 29 days), the current one started 2026-09-28. */
const THREE = [{ start: '2026-07-05', end: '2026-07-09' }, ...HISTORY.slice(0, 3)];

describe('cycle lengths and the average', () => {
  it('lists completed cycles and marks the usable ones', () => {
    const lengths = cycleLengths([...HISTORY.slice(0, 3), { start: '2027-03-01' }, { start: '2027-03-05' }]);
    assert.deepEqual(
      lengths.map((c) => [c.length, c.usable]),
      [
        [28, true],
        [29, true],
        [154, false],
        [4, false],
      ],
    );
  });

  it('blends the typical length until three usable cycles exist, then uses the last six', () => {
    assert.equal(averageCycleLength([], 30), 30);
    assert.equal(averageCycleLength(HISTORY.slice(0, 2), 30), 29, '(28 + 30 + 30) / 3');
    assert.equal(averageCycleLength(HISTORY.slice(0, 4), 30), 28, '(28 + 29 + 28) / 3');
    const eight = Array.from({ length: 9 }, (_, i) => ({ start: `2026-0${1 + Math.floor(i / 3)}-${String(1 + (i % 3) * 10).padStart(2, '0')}` }));
    // Lengths: 10,10,11, 10,10,9(Feb)... only the last six count, all ≥ 10 except where February is short.
    const avg = averageCycleLength(eight, 28);
    assert.ok(avg >= 10 && avg <= 12);
  });

  it('skips excluded cycles', () => {
    const odd = [{ start: '2026-06-20' }, ...HISTORY.slice(0, 3)];
    assert.equal(averageCycleLength(odd, 28), 33, '(43 + 28 + 29) / 3');
    assert.equal(averageCycleLength([{ start: '2026-06-20', excluded: true }, ...HISTORY.slice(0, 3)], 28), 28);
  });

  it('widens the range with the spread, capped at seven days', () => {
    assert.equal(rangeDays([28, 29]), 2);
    assert.equal(rangeDays([28, 29, 28]), 1);
    assert.equal(rangeDays([20, 40, 20, 40]), 7);
  });
});

describe('prediction', () => {
  it('projects the next start, fertile window and late-luteal days', () => {
    const p = predictCycle(THREE, RULES, '2026-10-10')!;
    assert.equal(p.cycleLength, 28);
    assert.equal(p.usableCycles, 3);
    assert.equal(p.nextStart, '2026-10-26');
    assert.equal(p.ovulation, '2026-10-12');
    assert.equal(p.fertileStart, '2026-10-07');
    assert.equal(p.fertileEnd, '2026-10-12');
    assert.equal(p.lateLutealStart, '2026-10-21');
    assert.equal(p.earliest, '2026-10-25');
    assert.equal(p.latest, '2026-10-27');
    assert.equal(p.lateDays, 0);
    assert.equal(p.lowConfidence, false);
  });

  it('counts late days once the expected start has passed', () => {
    const p = predictCycle(HISTORY.slice(0, 3), RULES, '2026-10-29')!;
    assert.equal(p.lateDays, 3);
  });

  it('clamps ovulation to the day after the period in a very short cycle', () => {
    const short = [{ start: '2026-09-01', end: '2026-09-05' }, { start: '2026-09-17', end: '2026-09-21' }, { start: '2026-10-03', end: '2026-10-07' }, { start: '2026-10-19', end: '2026-10-23' }];
    const p = predictCycle(short, RULES, '2026-10-24')!;
    assert.equal(p.cycleLength, 16);
    assert.equal(p.nextStart, '2026-11-04');
    assert.equal(p.ovulation, '2026-10-24', '2026-11-04 − 14 = 10-21 would fall inside the period');
    assert.equal(p.clamped, true);
    assert.equal(p.lowConfidence, true);
  });

  it('is low-confidence with fewer than three cycles', () => {
    assert.equal(predictCycle(HISTORY.slice(0, 2), RULES, '2026-09-10')!.lowConfidence, true);
    assert.equal(predictCycle([], RULES, TODAY), null);
  });
});

describe('timeline', () => {
  const t = buildTimeline(HISTORY.slice(0, 3), RULES, '2026-10-10');

  it('treats logged period days as menstrual and nothing else', () => {
    assert.equal(t.periodContaining('2026-09-30')?.start, '2026-09-28');
    assert.equal(t.periodContaining('2026-10-03'), undefined);
    assert.equal(t.infoOn('2026-09-30')?.phase, 'menstrual');
    assert.equal(t.infoOn('2026-09-30')?.periodDay, 3);
    assert.equal(t.infoOn('2026-09-30')?.predicted, false);
  });

  it('places follicular, fertile, luteal and late-luteal days of the current cycle', () => {
    assert.equal(t.infoOn('2026-10-05')?.phase, 'follicular');
    assert.equal(t.infoOn('2026-10-07')?.phase, 'fertile');
    assert.equal(t.infoOn('2026-10-12')?.phase, 'fertile');
    assert.equal(t.infoOn('2026-10-12')?.isOvulation, true);
    assert.equal(t.infoOn('2026-10-13')?.phase, 'luteal');
    assert.equal(t.infoOn('2026-10-21')?.phase, 'late-luteal');
    assert.equal(t.infoOn('2026-10-25')?.phase, 'late-luteal');
    assert.equal(t.infoOn('2026-10-10')?.cycleDay, 13);
    assert.equal(t.infoOn('2026-10-10')?.predicted, true, 'the end of the current cycle is only predicted');
  });

  it('uses the actual next start for past cycles', () => {
    assert.equal(t.infoOn('2026-08-16')?.phase, 'fertile', 'ovulation on 08-30 − 14 = 08-16');
    assert.equal(t.infoOn('2026-08-16')?.predicted, false);
    assert.equal(t.infoOn('2026-08-28')?.phase, 'late-luteal');
    assert.equal(t.infoOn('2026-07-01'), null, 'before the first logged period nothing is known');
  });

  it('projects future periods and phases', () => {
    assert.equal(t.infoOn('2026-10-26')?.phase, 'menstrual');
    assert.equal(t.infoOn('2026-10-26')?.predicted, true);
    assert.equal(t.infoOn('2026-11-09')?.phase, 'fertile', 'ovulation of the projected cycle: 11-23 − 14');
    assert.deepEqual(t.projectedPeriods('2026-10-01', '2026-12-31'), [
      { start: '2026-10-26', end: '2026-10-30' },
      { start: '2026-11-23', end: '2026-11-27' },
      { start: '2026-12-21', end: '2026-12-25' },
    ]);
  });

  it('keeps a late period in late-luteal and expects it any day', () => {
    const late = buildTimeline(HISTORY.slice(0, 3), RULES, '2026-10-29');
    assert.equal(late.prediction?.lateDays, 3);
    assert.equal(late.infoOn('2026-10-28')?.phase, 'late-luteal');
    assert.equal(late.infoOn('2026-10-28')?.late, true);
    assert.equal(late.infoOn('2026-10-30')?.phase, 'menstrual');
    assert.equal(late.projectedPeriods('2026-10-29', '2026-11-05')[0]?.start, '2026-10-30');
  });

  it('shows an open period up to its usual length', () => {
    const open = buildTimeline(HISTORY, RULES, '2026-11-02');
    assert.equal(open.periodContaining('2026-10-30')?.start, '2026-10-26');
    assert.equal(open.periodContaining('2026-10-31'), undefined, 'day 6 of an un-ended period is no longer painted');
    assert.equal(open.infoOn('2026-11-02')?.phase, 'follicular');
  });

  it('hides the fertile window in birth-control mode', () => {
    assert.equal(displayPhase('fertile', true), 'follicular');
    assert.equal(displayPhase('fertile', false), 'fertile');
    assert.equal(displayPhase('luteal', true), 'luteal');
  });
});

describe('period logging', () => {
  it('offers "ended" prominently within the usual length, subtly through day 14, then "started"', () => {
    assert.deepEqual(todayOffer(HISTORY, RULES, '2026-10-28'), { kind: 'end', prominent: true, start: '2026-10-26' });
    assert.deepEqual(todayOffer(HISTORY, RULES, '2026-11-02'), { kind: 'end', prominent: false, start: '2026-10-26' });
    assert.deepEqual(todayOffer(HISTORY, RULES, '2026-11-09'), { kind: 'start' });
    assert.deepEqual(todayOffer(HISTORY.slice(0, 3), RULES, '2026-10-02'), { kind: 'ended-today', start: '2026-09-28' });
    assert.deepEqual(todayOffer([], RULES, TODAY), { kind: 'start' });
  });

  it('moves a start logged up to seven days before an existing one', () => {
    assert.equal(startShortlyAfter(HISTORY, '2026-10-22'), '2026-10-26');
    assert.equal(startShortlyAfter(HISTORY, '2026-10-18'), undefined);
    const r = applyPeriodStart(HISTORY, '2026-10-24', RULES, '2026-10-26');
    assert.ok(r.ok);
    assert.equal(r.moved, '2026-10-26');
    assert.equal(r.history.at(-1)?.start, '2026-10-24');
    assert.equal(r.history.length, 4);
  });

  it('refuses future days, days inside a period and starts too close after one', () => {
    assert.equal(applyPeriodStart(HISTORY, '2026-10-27', RULES, '2026-10-26').ok, false);
    assert.equal(applyPeriodStart(HISTORY, '2026-09-30', RULES, TODAY).ok, false);
    assert.equal(applyPeriodStart(HISTORY, '2026-10-05', RULES, TODAY).ok, false);
    assert.equal(applyPeriodStart(HISTORY, '2026-10-26', RULES, TODAY).ok, true, 'logging the same start twice is harmless');
  });

  it('closes an older open period at its usual length when a new one starts', () => {
    const r = applyPeriodStart([{ start: '2026-09-28' }], '2026-10-26', RULES, '2026-10-26');
    assert.ok(r.ok);
    assert.deepEqual(r.history, [{ start: '2026-09-28', end: '2026-10-02' }, { start: '2026-10-26' }]);
    assert.deepEqual(closeOlderOpenSpans([{ start: '2026-10-01' }, { start: '2026-10-03' }], RULES), [{ start: '2026-10-01', end: '2026-10-02' }, { start: '2026-10-03' }]);
  });

  it('ends the open period, within fourteen days of its start', () => {
    assert.equal(applyPeriodEnd(HISTORY, '2026-10-30')?.at(-1)?.end, '2026-10-30');
    assert.equal(applyPeriodEnd(HISTORY, '2026-10-25'), null, 'before the start');
    assert.equal(applyPeriodEnd(HISTORY, '2026-11-12'), null, 'past day 14');
    assert.equal(applyPeriodEnd(HISTORY.slice(0, 3), '2026-10-05'), null, 'nothing open');
  });
});

describe('alerts', () => {
  it('flags short and long cycles, variable lengths and long periods, neutrally', () => {
    const short = cycleAlerts([{ start: '2026-09-01', end: '2026-09-05' }, { start: '2026-09-19', end: '2026-09-23' }]);
    assert.equal(short[0]?.kind, 'short-cycle');
    assert.match(short[0]!.body, /18 days/);
    assert.doesNotMatch(short[0]!.body, /abnormal|disorder/i);
    const long = cycleAlerts([{ start: '2026-08-01' }, { start: '2026-09-10' }]);
    assert.equal(long[0]?.kind, 'long-cycle');
    const variable = cycleAlerts([{ start: '2026-01-01' }, { start: '2026-01-22' }, { start: '2026-03-01' }, { start: '2026-03-24' }, { start: '2026-05-01' }]);
    assert.ok(variable.some((a) => a.kind === 'variable'));
    const longPeriod = cycleAlerts([{ start: '2026-09-01', end: '2026-09-10' }]);
    assert.equal(longPeriod[0]?.kind, 'long-period');
    assert.deepEqual(cycleAlerts(HISTORY), []);
  });

  it('suggests excluding outliers but never excludes them itself', () => {
    const history = [{ start: '2026-04-01' }, { start: '2026-04-29' }, { start: '2026-05-27' }, { start: '2026-07-10' }, { start: '2026-08-07' }];
    const s = outlierSuggestions(history);
    assert.deepEqual(
      s.map((o) => [o.start, o.length]),
      [['2026-05-27', 44]],
    );
    assert.equal(cycleLengths(history).filter((c) => c.usable).length, 4);
    assert.deepEqual(outlierSuggestions(history.map((p) => (p.start === '2026-05-27' ? { ...p, excluded: true } : p))), []);
  });
});

describe('reminders', () => {
  const vitaminC: CycleReminder = { id: 'vitamin-c', label: 'Vitamin C', anchor: 'BEFORE_PERIOD', offsetDays: 5, minute: 9 * 60, enabled: true };
  const prediction = predictCycle(HISTORY.slice(0, 3), RULES, '2026-10-10')!;

  it('fires five days before the expected start, and rolls over once that day has passed', () => {
    assert.equal(nextFireDay(vitaminC, prediction, '2026-10-10'), '2026-10-21');
    assert.equal(nextFireDay(vitaminC, prediction, '2026-10-21'), '2026-10-21');
    assert.equal(nextFireDay(vitaminC, prediction, '2026-10-22'), '2026-11-18', 'next cycle: 10-26 + 28 − 5');
  });

  it('is silent while the period is late or the rule is off', () => {
    const late = predictCycle(HISTORY.slice(0, 3), RULES, '2026-10-28')!;
    assert.equal(nextFireDay(vitaminC, late, '2026-10-28'), null);
    assert.equal(nextFireDay({ ...vitaminC, enabled: false }, prediction, '2026-10-10'), null);
    assert.equal(nextFireDay(vitaminC, null, '2026-10-10'), null);
  });

  it('anchors phase rules to the day the phase begins', () => {
    const fertile: CycleReminder = { id: 'f', label: 'Fertile', anchor: 'PHASE_START', phase: 'fertile', offsetDays: 0, minute: 8 * 60, enabled: true };
    const luteal: CycleReminder = { id: 'l', label: 'Magnesium', anchor: 'PHASE_START', phase: 'luteal', offsetDays: 2, minute: 20 * 60, enabled: true };
    assert.equal(nextFireDay(fertile, prediction, '2026-10-01'), '2026-10-07');
    assert.equal(nextFireDay(luteal, prediction, '2026-10-01'), '2026-10-15');
    assert.deepEqual(
      upcomingReminders([luteal, fertile, vitaminC], prediction, '2026-10-01').map((f) => f.day),
      ['2026-10-07', '2026-10-15', '2026-10-21'],
    );
    assert.equal(describeReminder(vitaminC), '5 days before the expected period');
    assert.equal(describeReminder(luteal), '2 days into the luteal phase');
  });
});

describe('insights', () => {
  const cycles = [
    { start: '2026-06-01', nextStart: '2026-06-29' },
    { start: '2026-06-29', nextStart: '2026-07-27' },
    { start: '2026-07-27', nextStart: '2026-08-24' },
    { start: '2026-08-24', nextStart: '2026-09-21' },
  ];
  const log = (day: string, symptoms: Record<string, 1 | 2 | 3>, mood?: 1 | 2 | 3 | 4 | 5): CycleDayLog => (mood === undefined ? { day, symptoms } : { day, symptoms, mood });
  const logs: CycleDayLog[] = [
    log('2026-06-27', { headache: 3 }, 2),
    log('2026-06-28', { headache: 3 }),
    log('2026-07-25', { headache: 3 }, 2),
    log('2026-07-26', { headache: 2 }),
    log('2026-08-22', { headache: 2 }, 3),
    log('2026-08-23', { headache: 2 }),
    log('2026-09-19', { headache: 1 }, 4),
    log('2026-09-20', { headache: 1 }),
    log('2026-06-02', { cramps: 2 }),
    log('2026-06-30', { cramps: 2 }),
  ];

  it('finds the three-day window a symptom keeps appearing in', () => {
    const p = symptomPatterns(logs, cycles);
    const headache = p.find((x) => x.key === 'headache')!;
    assert.deepEqual([headache.anchor, headache.from, headache.to, headache.share], ['next', 1, 3, 1]);
    assert.equal(describeWindow(headache), '1–3 days before your period');
    assert.equal(p.find((x) => x.key === 'cramps'), undefined, 'cramps in 2 of 4 cycles is below 60 %');
    assert.deepEqual(symptomPatterns(logs, cycles.slice(0, 2)), [], 'needs three logged cycles');
  });

  it('computes Spearman with ties and reports strong habit correlations as tendencies', () => {
    assert.equal(spearman([1, 2, 3, 4], [10, 20, 30, 40]), 1);
    assert.equal(spearman([1, 2, 3, 4], [4, 3, 2, 1]), -1);
    assert.equal(spearman([1, 1, 1, 1], [1, 2, 3, 4]), null);
    const habits = [
      { habitId: 'med', name: 'Meditate', perCycle: [0.2, 0.4, 0.6, 0.9] },
      { habitId: 'flat', name: 'Walk', perCycle: [0.5, 0.5, 0.5, 0.5] },
    ];
    const c = habitSymptomCorrelations(logs, cycles, habits);
    const headache = c.find((x) => x.habitId === 'med' && x.key === 'headache')!;
    assert.ok(headache.rho < -0.9);
    assert.equal(headache.n, 4);
    assert.equal(describeCorrelation(headache, (k) => k), 'Cycles where you did “Meditate” more often tended to have milder headache.');
    const mood = c.find((x) => x.habitId === 'med' && x.key === 'mood')!;
    assert.ok(mood.rho > 0.5);
    assert.equal(c.some((x) => x.habitId === 'flat'), false, 'no variance, no claim');
    assert.equal(c.some((x) => x.key === 'cramps'), false, 'a symptom seen in only one or two cycles is not correlated');
    assert.deepEqual(habitSymptomCorrelations(logs, cycles.slice(0, 3), habits), [], 'needs four cycles');
  });

  it('cycles the severity and detects empty logs', () => {
    assert.equal(nextSeverity(undefined), 1);
    assert.equal(nextSeverity(2), 3);
    assert.equal(nextSeverity(3), undefined);
    assert.equal(SYMPTOMS.length, 14);
    assert.equal(isEmptyLog({ symptoms: {} }), true);
    assert.equal(isEmptyLog({ symptoms: {}, note: '  ' }), true);
    assert.equal(isEmptyLog({ symptoms: { cramps: 1 } }), false);
  });
});

describe('cycle state', () => {
  const base = buildEmptyState(TODAY);

  it('upserts day logs and drops empty ones', () => {
    let s = reducer(base, { type: 'SET_CYCLE_LOG', log: { day: TODAY, symptoms: { cramps: 2 }, note: ' rough morning ' } });
    assert.deepEqual(s.cycleLogs, [{ day: TODAY, symptoms: { cramps: 2 }, note: 'rough morning' }]);
    s = reducer(s, { type: 'SET_CYCLE_LOG', log: { day: '2026-10-20', symptoms: {}, mood: 4 } });
    assert.deepEqual(
      s.cycleLogs.map((l) => l.day),
      ['2026-10-20', TODAY],
    );
    s = reducer(s, { type: 'SET_CYCLE_LOG', log: { day: TODAY, symptoms: {} } });
    assert.deepEqual(
      s.cycleLogs.map((l) => l.day),
      ['2026-10-20'],
    );
  });

  it('starts, moves, edits, excludes and deletes periods through the reducer', () => {
    let s = reducer(base, { type: 'PERIOD_START', day: '2026-09-28', today: TODAY });
    s = reducer(s, { type: 'PERIOD_START', day: TODAY, today: TODAY });
    assert.deepEqual(s.settings.cycle.history, [{ start: '2026-09-28', end: '2026-10-02' }, { start: TODAY }]);
    assert.equal(reducer(s, { type: 'PERIOD_START', day: '2026-10-27', today: TODAY }), s, 'future start refused');
    s = reducer(s, { type: 'PERIOD_START', day: '2026-10-24', today: TODAY });
    assert.equal(s.settings.cycle.history.at(-1)?.start, '2026-10-24', 'moved');
    s = reducer(s, { type: 'UPDATE_PERIOD', start: '2026-09-28', patch: { excluded: true, end: '2026-10-03' } });
    assert.deepEqual(s.settings.cycle.history[0], { start: '2026-09-28', end: '2026-10-03', excluded: true });
    s = reducer(s, { type: 'UPDATE_PERIOD', start: '2026-09-28', patch: { excluded: false, end: null } });
    assert.deepEqual(s.settings.cycle.history[0], { start: '2026-09-28', end: '2026-10-02' }, 'cleared end is refilled at the usual length for older spans');
    s = reducer(s, { type: 'DELETE_PERIOD', start: '2026-09-28' });
    assert.deepEqual(s.settings.cycle.history, [{ start: '2026-10-24' }]);
    s = reducer(s, { type: 'SET_CYCLE_LOG', log: { day: TODAY, symptoms: { cramps: 1 } } });
    s = reducer(s, { type: 'CLEAR_CYCLE' });
    assert.deepEqual([s.settings.cycle.history, s.cycleLogs], [[], []]);
    assert.equal(s.settings.cycle.reminders.length, DEFAULT_SETTINGS.cycle.reminders.length, 'reminders survive a data wipe');
  });

  it('feeds the planner cycle reminders, worded discreetly unless the person opts into names', () => {
    const zone = 'America/New_York';
    let s = buildEmptyState(TODAY);
    // Discreet is the default (a lock screen names nothing); this test opts into names first.
    assert.equal(s.settings.cycle.discreet, true);
    s = reducer(s, { type: 'UPDATE_SETTINGS', patch: { cycleEnabled: true, cycle: { ...s.settings.cycle, discreet: false } } });
    for (const p of HISTORY.slice(0, 3)) s = reducer(s, { type: 'PERIOD_START', day: p.start, today: '2026-10-20' });
    const fires = cycleReminderFires(s, '2026-10-20');
    assert.deepEqual(
      fires.map((f) => [f.reminder.id, f.day]),
      [['vitamin-c', '2026-10-21']],
    );
    const nowMs = instantOf('2026-10-21', 7 * 60, zone);
    const input: PlanInput = planInputFor(s, '2026-10-21', nowMs, zone);
    assert.deepEqual(input.cycleReminders, [{ id: 'vitamin-c', day: '2026-10-21', minute: 540, label: 'Vitamin C' }]);
    const plan = planNudges(input);
    const reminder = plan.find((n) => n.id === 'cycle:r:vitamin-c:2026-10-21')!;
    assert.equal(reminder.title, 'Vitamin C');
    assert.equal(reminder.channel, 'cycle');
    assert.equal(reminder.at, instantOf('2026-10-21', 9 * 60, zone));

    const discreet = reducer(s, { type: 'UPDATE_SETTINGS', patch: { cycle: { ...s.settings.cycle, discreet: true } } });
    const quiet = planNudges(planInputFor(discreet, '2026-10-21', nowMs, zone)).find((n) => n.id === 'cycle:r:vitamin-c:2026-10-21')!;
    assert.equal(quiet.title, 'Daily Tracker');
    assert.equal(quiet.body, 'You have a reminder.');

    const off = reducer(s, { type: 'UPDATE_SETTINGS', patch: { cycleEnabled: false } });
    assert.equal(planInputFor(off, '2026-10-21', nowMs, zone).cycleReminders, undefined);
  });

  it('the sample data carries five periods, day logs and at least one insight', () => {
    const sample = buildSampleState(TODAY, 'America/New_York', instantOf(TODAY, 12 * 60, 'America/New_York'));
    assert.equal(sample.settings.cycle.history.length, 5);
    assert.equal(completedCycles(sample).length, 4);
    assert.ok(sample.cycleLogs.length > 20);
    assert.ok(sample.cycleLogs.every((l) => l.day <= TODAY));
    const insights = cycleInsights(sample);
    assert.ok(insights.patterns.some((p) => p.key === 'headache' && p.anchor === 'next'));
    assert.equal(insights.loggedCycles, 4);
  });
});
