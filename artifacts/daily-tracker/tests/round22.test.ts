/**
 * Round 22: what the council's statistics, accessibility and diff lenses turned up.
 *
 * - "Days met" asks each day about itself: a weekly habit done once on Monday is one day met, not
 *   seven (the week's accumulated ratio reads 1.0 all week).
 * - A weight difference says what it spans: "over 35 days", "over 4 months", "since Jan 1, 2025" —
 *   never "over 30 days" for a reference two years back.
 * - Sleep durations round to whole minutes before the hours split off: 479.8 min is "8h".
 * - Hydration pace runs on the tracking day's own clock: at 00:30, before the 3 am boundary, the
 *   day's window has ended and the expected intake is the whole goal, not a new morning's zero.
 * - The Mind ring asks nothing of Tuesday when Monday met the week's one-session quota — and asks
 *   again when Tuesday has a session of its own.
 * - Light-theme inks written as small text reach AA on the surfaces they sit on.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import colors from '../constants/colors';
import { BACKUP_STALE_DAYS, backupAge } from '../src/domain/backup/backupAge';
import { formatSleep, latestWeight, weightSpanText } from '../src/domain/body/stats';
import { mergeBody } from '../src/domain/body/merge';
import { EMPTY_BODY } from '../src/domain/body/types';
import { contrastRatio } from '../src/domain/color/oklch';
import { dayMet, daysMet } from '../src/domain/habits/progress';
import { instantOf, trackingDayOf } from '../src/domain/time/trackingDay';
import { newHabitAction, type HabitDraft } from '../src/state/commands';
import { reducer } from '../src/state/reducer';
import { buildEmptyState } from '../src/state/seed';
import { habitView, todaySummary } from '../src/state/selectors';
import type { TrackerState } from '../src/state/types';

const NY = 'America/New_York';
const MON = '2026-10-26';

/** One weekly habit, `h`, created on Monday: a count once a week, or a 10-minute meditation once a week. */
function weeklyOnce(type: 'COUNT' | 'TIMER'): TrackerState {
  const empty = buildEmptyState(MON, undefined, { withWater: false });
  const draft: HabitDraft = {
    name: type === 'TIMER' ? 'Meditate' : 'Climb',
    category: type === 'TIMER' ? 'mind' : 'movement',
    type,
    unit: type === 'TIMER' ? 'min' : 'times',
    icon: 'check',
    cadence: 'WEEKLY',
    timesPerPeriod: 1,
    target: type === 'TIMER' ? 10 : 1,
    freezesPerMonth: 0,
    pinned: false,
  };
  const add = newHabitAction(draft, 'h', MON);
  const withKind = type === 'TIMER' ? { ...add, habit: { ...add.habit, mindKind: 'MEDITATION' as const } } : add;
  return reducer(reducer(empty, withKind), { type: 'UPDATE_SETTINGS', patch: { onboardingDone: true } });
}

describe('"Days met" for a weekly habit (STAT22-01)', () => {
  it('one Monday session is one day met by Sunday, while the week reads complete every day', () => {
    const base = weeklyOnce('COUNT');
    const state = reducer(base, { type: 'ADD_ENTRY', entry: { id: 'e1', habitId: 'h', day: MON, at: instantOf(MON, 12 * 60, NY), zone: NY, value: 1, source: 'MANUAL' } });
    const habit = state.habits.find((h) => h.id === 'h')!;
    const view = habitView(state, habit, '2026-11-01');
    const last7 = view.ratios14.slice(-7);
    assert.deepEqual(
      last7.map((r) => r.ratio),
      [1, 1, 1, 1, 1, 1, 1],
      'the week strip reads the quota as met all week',
    );
    assert.equal(daysMet(last7), 1);
    assert.equal(daysMet(view.ratios14), 1);
  });

  it('a day with no target counts when something was logged', () => {
    assert.equal(dayMet({ value: 1, target: 0 }), true);
    assert.equal(dayMet({ value: 0, target: 0 }), false);
    assert.equal(dayMet({ value: 9, target: 10 }), false);
    assert.equal(dayMet({ value: 10, target: 10 }), true);
  });
});

describe('a weight difference says what it spans (STAT22-02)', () => {
  it('names the real interval, not "30 days", for a reference two years back', () => {
    const body = mergeBody(EMPTY_BODY, {
      weight: [
        { id: 'a', at: Date.parse('2025-01-01T12:00:00Z'), day: '2025-01-01', kg: 80 },
        { id: 'b', at: Date.parse('2026-11-01T12:00:00Z'), day: '2026-11-01', kg: 70 },
      ],
    });
    const latest = latestWeight(body)!;
    assert.equal(latest.delta30, -10);
    assert.equal(latest.sinceDays, 669);
    assert.equal(weightSpanText(latest.sinceDay!, latest.sinceDays!), 'since Jan 2025');
  });

  it('writes days up to six weeks and months up to a year', () => {
    assert.equal(weightSpanText('2026-09-21', 35), 'over 35 days');
    assert.equal(weightSpanText('2026-06-28', 120), 'over 4 months');
    assert.equal(weightSpanText('2025-11-01', 365), 'over 12 months');
  });
});

describe('sleep durations round to whole minutes first (STAT22-03)', () => {
  it('never writes 60 minutes', () => {
    assert.equal(formatSleep(479.8), '8h');
    assert.equal(formatSleep(59.8), '1h');
    assert.equal(formatSleep(480), '8h');
    assert.equal(formatSleep(452), '7h 32m');
    assert.equal(formatSleep(29.4), '29m');
  });
});

describe('hydration pace on the tracking day’s own clock (STAT22-04)', () => {
  it('stays "behind" between midnight and the day boundary', () => {
    const day = '2026-10-31';
    const empty = buildEmptyState(day);
    const state = reducer(empty, { type: 'ADD_WATER', entry: { id: 'w1', at: instantOf(day, 12 * 60, NY), zone: NY, day, ml: 250, source: 'MANUAL' } });
    const late = instantOf(day, 23 * 60 + 59, NY);
    const afterMidnight = late + 3 * 60 * 60 * 1000; // 02:59 on 1 November, still tracking day 31 October
    assert.equal(trackingDayOf(afterMidnight, NY), day);
    const a = todaySummary(state, day, late, NY);
    const b = todaySummary(state, day, afterMidnight, NY);
    assert.equal(a.water.loggedMl, 250);
    assert.equal(b.water.loggedMl, 250);
    assert.equal(a.water.expectedMl, state.settings.waterGoalMl);
    assert.equal(b.water.expectedMl, a.water.expectedMl, 'midnight changes nothing about the day being summarised');
    assert.equal(b.water.onPace, false);
    assert.equal(b.water.catchUpMl, a.water.catchUpMl);
  });

  it('a new tracking day starts from zero as before', () => {
    const day = '2026-11-01';
    const state = buildEmptyState(day);
    const morning = instantOf(day, 3 * 60 + 30, NY); // 03:30: the new day, before the active window
    const s = todaySummary(state, day, morning, NY);
    assert.equal(s.water.expectedMl, 0);
    assert.equal(s.water.onPace, true);
  });
});

describe('the Mind ring and a met weekly quota (STAT22-05)', () => {
  it('asks nothing of Tuesday after Monday’s one session, and asks again once Tuesday starts', () => {
    const base = weeklyOnce('TIMER');
    const monday = reducer(base, { type: 'LOG_MIND', session: { id: 'm1', kind: 'MEDITATION', day: MON, zone: NY, startAt: instantOf(MON, 12 * 60, NY), endAt: instantOf(MON, 12 * 60 + 10, NY), minutes: 10 } });
    const tue = '2026-10-27';
    const noon = instantOf(tue, 12 * 60, NY);
    const habit = monday.habits.find((h) => h.id === 'h')!;
    const view = habitView(monday, habit, tue);
    assert.equal(view.periodDone, 1);
    assert.equal(view.periodQuota, 1);
    const quiet = todaySummary(monday, tue, noon, NY);
    assert.equal(quiet.mindTarget, 0, 'nothing owed on Tuesday');
    assert.equal(quiet.mindMinutes, 0);
    const started = reducer(monday, { type: 'LOG_MIND', session: { id: 'm2', kind: 'MEDITATION', day: tue, zone: NY, startAt: instantOf(tue, 8 * 60, NY), endAt: instantOf(tue, 8 * 60 + 4, NY), minutes: 4 } });
    const busy = todaySummary(started, tue, noon, NY);
    assert.equal(busy.mindTarget, 10, 'a day actually started asks for its whole target');
    assert.equal(busy.mindMinutes, 4);
  });
});

describe('light-theme inks written as small text (A11Y22-08)', () => {
  const c = colors.light;
  const hexToRgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const toHex = (rgb: number[]) => '#' + rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  const composite = (fg: string, alpha: number, bg: string) => toHex(hexToRgb(fg).map((v, i) => alpha * v + (1 - alpha) * hexToRgb(bg)[i]!));
  it('the Moderate evidence pill reads at AA on its own tint over every card surface', () => {
    for (const bg of [c.surface, c.surfaceRaised, c.bg]) {
      const tint = composite(c.greenMist, 0.16, bg);
      assert.ok(contrastRatio(tint, c.greenMist) >= 4.5, `${bg}: ${contrastRatio(tint, c.greenMist).toFixed(2)}`);
    }
  });
  it('the hydration ink reads at AA as a 17 px card title', () => {
    for (const bg of [c.surface, c.surfaceRaised]) assert.ok(contrastRatio(bg, c.cat.hydration) >= 4.5, `${bg}: ${contrastRatio(bg, c.cat.hydration).toFixed(2)}`);
  });
});

describe('the backup check-in (IDEA22)', () => {
  const now = instantOf('2026-10-26', 9 * 60, NY);
  it('says plainly when nothing was exported, and when the last export was', () => {
    assert.deepEqual(backupAge(undefined, now, NY), { text: 'No backup exported yet.', stale: true });
    assert.deepEqual(backupAge(instantOf('2026-10-26', 8 * 60, NY), now, NY), { text: 'Last exported today.', stale: false });
    assert.deepEqual(backupAge(instantOf('2026-10-25', 23 * 60, NY), now, NY), { text: 'Last exported yesterday.', stale: false });
    assert.deepEqual(backupAge(instantOf('2026-10-12', 12 * 60, NY), now, NY), { text: 'Last exported Oct 12, 14 days ago.', stale: false });
  });
  it('asks for a fresh copy after a month, without claiming the old one is anywhere', () => {
    const old = backupAge(instantOf('2026-09-10', 12 * 60, NY), now, NY);
    assert.equal(old.stale, true);
    assert.equal(old.text, 'Last exported Sep 10, 46 days ago. Export again to keep a recent copy.');
    assert.equal(BACKUP_STALE_DAYS, 30);
    assert.doesNotMatch(old.text, /safe|kept|Drive/);
  });
  it('a clock set back never writes a negative age', () => {
    assert.equal(backupAge(instantOf('2026-10-28', 12 * 60, NY), now, NY).text, 'Last exported today.');
  });
});
