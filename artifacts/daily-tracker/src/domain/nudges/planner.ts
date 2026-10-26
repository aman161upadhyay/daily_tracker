/**
 * The nudge planner (IMPLEMENTATION_PLAN §5.4).
 *
 * Pure function: given "now", the habits with their policies and today's
 * progress, recent nudge events and the user's settings, return every
 * notification that should exist in the OS for the next ~36 hours. The
 * caller diffs this list against what is scheduled, so the planner must be
 * deterministic: the same inputs give the same ids and times.
 *
 * Invariants (all covered by tests/planner.test.ts):
 * - automatic cadences (rotation, interval, water) stay inside active hours;
 *   FIXED clock times are the user's explicit choice and may sit outside them
 * - never more than `dailyNudgeCap` automatic nudges per calendar day,
 *   counting the ones that already fired
 * - two nudges less than 5 minutes apart merge into one
 * - a snooze moves only that nudge; a swap re-offers the slot with the next snack
 * - water nudges are dropped while on pace and stop at the goal
 * - a habit that is done for today (or for its week) emits nothing more
 * - off mode and the master switch silence everything
 * - DST transitions never double-fire or skip a day (wall-clock based slots)
 */
import type { NudgeEvent, NudgePolicy, ScheduledEvent, Settings, SnackType } from '../models';
import { SNACK_LABELS } from '../models';
import { addDays, calendarDayOf, instantOf, minutesOfDay, weekdayOf } from '../time/trackingDay';
import { expectedIntakeMl, isOnPace } from '../water/pace';

export type NudgeChannel = 'nudges' | 'water' | 'summary' | 'cycle' | 'mind';
export type NudgeActionKind = 'DONE' | 'SNOOZE' | 'SWAP' | 'WATER' | 'OPEN';
export type NudgeKindPlanned = 'ROTATION' | 'INTERVAL' | 'FIXED' | 'WATER' | 'EVENT' | 'SUMMARY' | 'CYCLE';

export interface ScheduledNudge {
  /** Deterministic per (policy, slot); doubles as the OS notification identifier. */
  id: string;
  at: number;
  /** Calendar day the nudge belongs to (for the daily cap). */
  day: string;
  habitIds: string[];
  title: string;
  body: string;
  channel: NudgeChannel;
  kind: NudgeKindPlanned;
  actions: NudgeActionKind[];
  /** Snack to log when "Done" is pressed on a movement nudge. */
  snackType?: SnackType;
  /** Millilitres the "+water" action adds. */
  waterMl?: number;
}

export interface PlanHabit {
  id: string;
  name: string;
  policy: NudgePolicy;
  snackType?: SnackType;
  /** Whether today's target is already met. */
  doneToday: boolean;
  /** Weekly / monthly habits: the period's quota is met, nothing more needed. */
  donePeriod: boolean;
  /** Progress towards today's target, 0..1+. */
  todayRatio: number;
  /** Last log today (epoch ms); anchors interval slots. */
  lastLogMs?: number;
  /** Which habits count as "movement" for the rotation; set for snack presets. */
  movement: boolean;
}

export interface PlanWater {
  habitId: string;
  loggedMl: number;
  lastTapMs?: number;
  intervalMin: number;
}

export type PlanSettings = Pick<
  Settings,
  'activeStartMin' | 'activeEndMin' | 'dailyNudgeCap' | 'nudgeIntervalMin' | 'remindersEnabled' | 'offUntil' | 'weeklySummary' | 'waterGoalMl' | 'tapSizeMl'
>;

export interface PlanInput {
  nowMs: number;
  zone: string;
  /** Tracking day (3 am boundary) — progress figures refer to it. */
  today: string;
  settings: PlanSettings;
  habits: PlanHabit[];
  water?: PlanWater;
  /** Movement snacks completed today (excluding Sugar Shield). */
  rotationCompletedToday: number;
  /** Manual swaps today (advances the rotation). */
  swapOffset: number;
  /** Live "snooze all movement" from the Today card. */
  snoozedUntilMs?: number;
  events: ScheduledEvent[];
  nudgeEvents: NudgeEvent[];
  /** Pre-rendered weekly summary text (the planner does not know the stats). */
  weekSummary?: { title: string; body: string };
  /** Cycle prompt: the day a period is expected, when tracking is on and none is logged. */
  cycleExpectedDay?: string;
  /** Cycle-relative reminders ("Vitamin C") already resolved to the day they fire next. */
  cycleReminders?: { id: string; day: string; minute: number; label: string }[];
  /** Discreet mode: every cycle notification reads "You have a reminder". */
  cycleDiscreet?: boolean;
  horizonMs?: number;
}

export const DISCREET_TITLE = 'Daily Tracker';
export const DISCREET_BODY = 'You have a reminder.';

export const DEFAULT_HORIZON_MS = 36 * 60 * 60_000;
export const MERGE_WINDOW_MS = 5 * 60_000;
export const SNOOZE_MINUTES = 15;
const MIN_LEAD_MS = 45_000;

/** Latest event per nudge id — the only thing the planner needs from the history. */
export function latestEvents(events: readonly NudgeEvent[]): Map<string, NudgeEvent> {
  const out = new Map<string, NudgeEvent>();
  for (const e of events) {
    const prev = out.get(e.nudgeId);
    if (!prev || e.at >= prev.at) out.set(e.nudgeId, e);
  }
  return out;
}

function firedCount(latest: Map<string, NudgeEvent>, day: string): number {
  let n = 0;
  for (const e of latest.values()) if (e.day === day && e.kind !== 'SNOOZED') n += 1;
  return n;
}

/** How many nudges each habit already received today (fired, done or dismissed). */
function firedPerHabit(latest: Map<string, NudgeEvent>, day: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of latest.values()) {
    if (e.day !== day || e.kind === 'SNOOZED') continue;
    for (const id of e.habitIds) out.set(id, (out.get(id) ?? 0) + 1);
  }
  return out;
}

function snackLine(type: SnackType | undefined, name: string): string {
  if (!type) return name;
  const meta = SNACK_LABELS[type];
  if (meta.defaultReps) return `${meta.defaultReps} ${meta.label.toLowerCase()}`;
  if (meta.defaultSeconds) {
    const min = meta.defaultSeconds / 60;
    return `${min % 1 === 0 ? min : min.toFixed(1)}-min ${meta.label.toLowerCase()}`;
  }
  return name;
}

interface Candidate extends ScheduledNudge {
  /** Automatic cadences count against the daily cap; events and summaries do not. */
  counted: boolean;
}

export function planNudges(input: PlanInput): ScheduledNudge[] {
  const { nowMs, zone, settings } = input;
  if (!settings.remindersEnabled) return [];
  const horizonEnd = nowMs + (input.horizonMs ?? DEFAULT_HORIZON_MS);
  const earliest = Math.max(nowMs + MIN_LEAD_MS, settings.offUntil ?? 0);
  const latest = latestEvents(input.nudgeEvents);

  const days: string[] = [];
  const firstDay = calendarDayOf(nowMs, zone);
  for (let i = 0; i < 3; i++) days.push(addDays(firstDay, i));

  const candidates: Candidate[] = [];
  const push = (c: Candidate) => {
    if (c.at < earliest || c.at > horizonEnd) return;
    candidates.push(c);
  };

  /** Apply snooze / swap / fired bookkeeping to a slot; returns the effective time or null. */
  const effectiveAt = (id: string, at: number): number | null => {
    const e = latest.get(id);
    if (!e) return at > nowMs ? at : null;
    if (e.kind === 'SNOOZED') return e.untilMs !== undefined && e.untilMs > nowMs ? e.untilMs : null;
    if (e.kind === 'SWAPPED') return Math.max(at, nowMs + MIN_LEAD_MS);
    return null; // fired, done or dismissed: never again
  };

  for (const day of days) {
    const isToday = day === input.today;
    const activeStart = instantOf(day, settings.activeStartMin, zone);
    const activeEnd = instantOf(day, settings.activeEndMin, zone);
    const activeOk = activeEnd > activeStart;

    // ── Movement rotation: one shared series of slots ─────────────────────
    const rotation = input.habits.filter((h) => h.movement && h.policy.enabled && (h.policy.kind === 'ROTATION' || h.policy.kind === 'INTERVAL'));
    if (activeOk && rotation.length > 0 && settings.nudgeIntervalMin > 0) {
      const lastSnack = isToday ? Math.max(...rotation.map((h) => h.lastLogMs ?? 0)) : 0;
      const anchor = Math.max(lastSnack, activeStart);
      // The Today card's "snooze all": slots before it collapse onto it (the merge step folds them into one).
      const snoozedUntil = isToday && input.snoozedUntilMs && input.snoozedUntilMs > nowMs ? input.snoozedUntilMs : 0;
      const eligible = rotation.filter((h) => !(isToday && (h.doneToday || h.donePeriod)));
      // Per-habit budget: what already fired today plus what we plan now (past, undelivered slots do not count).
      const perHabit = isToday ? firedPerHabit(latest, day) : new Map<string, number>();
      const hasRoom = (h: PlanHabit) => (perHabit.get(h.id) ?? 0) < h.policy.maxPerDay;
      // The rotation advances once per completed snack (and per swap), exactly like the Today card,
      // so the first pending slot always matches what the card shows. Past slots do not move it.
      const base = isToday ? input.rotationCompletedToday + input.swapOffset : 0;
      let ordinal = 0;
      for (let at = anchor + settings.nudgeIntervalMin * 60_000; at < activeEnd && eligible.length > 0; at += settings.nudgeIntervalMin * 60_000) {
        const minute = minutesOfDay(at, zone);
        const id = `rot:${day}:${minute}`;
        const when = effectiveAt(id, Math.max(at, snoozedUntil));
        if (when === null) continue;
        const history = latest.get(id);
        let item: PlanHabit | undefined;
        if (history?.kind === 'SNOOZED') {
          // A snooze re-offers the same snack.
          item = eligible.find((h) => h.id === history.habitIds[0] && hasRoom(h));
        } else if (history?.kind === 'SWAPPED') {
          // A swap offers the next snack after the one declined.
          const i = eligible.findIndex((h) => h.id === history.habitIds[0]);
          for (let k = 1; k <= eligible.length && i >= 0; k++) {
            const cand = eligible[(i + k) % eligible.length]!;
            if (hasRoom(cand)) {
              item = cand;
              break;
            }
          }
        }
        if (!item) {
          for (let k = 0; k < eligible.length; k++) {
            const cand = eligible[(base + ordinal + k) % eligible.length]!;
            if (hasRoom(cand)) {
              item = cand;
              break;
            }
          }
        }
        if (!item) break;
        ordinal += 1;
        perHabit.set(item.id, (perHabit.get(item.id) ?? 0) + 1);
        push({
          id,
          at: when,
          day,
          habitIds: [item.id],
          title: 'Movement snack',
          body: `${snackLine(item.snackType, item.name)} — ${item.name.toLowerCase()}`,
          channel: 'nudges',
          kind: 'ROTATION',
          actions: eligible.length > 1 ? ['DONE', 'SNOOZE', 'SWAP'] : ['DONE', 'SNOOZE'],
          snackType: item.snackType,
          counted: true,
        });
      }
    }

    // ── Other interval habits (non-movement, e.g. a custom "sip tea" every 2 h) ──
    for (const h of input.habits) {
      if (h.movement || !h.policy.enabled || h.policy.kind !== 'INTERVAL' || !h.policy.intervalMin) continue;
      if (isToday && (h.doneToday || h.donePeriod)) continue;
      const start = h.policy.activeStartMin !== undefined ? instantOf(day, h.policy.activeStartMin, zone) : activeStart;
      const end = h.policy.activeEndMin !== undefined ? instantOf(day, h.policy.activeEndMin, zone) : activeEnd;
      if (end <= start) continue;
      const anchor = Math.max(isToday ? (h.lastLogMs ?? 0) : 0, start);
      let n = 0;
      for (let at = anchor + h.policy.intervalMin * 60_000; at < end && n < h.policy.maxPerDay; at += h.policy.intervalMin * 60_000) {
        if (h.policy.onlyWhenBehind && isToday) {
          const elapsed = (at - start) / (end - start);
          if (h.todayRatio >= elapsed) continue;
        }
        const id = `int:${h.id}:${day}:${minutesOfDay(at, zone)}`;
        n += 1;
        const when = effectiveAt(id, at);
        if (when === null) continue;
        push({
          id,
          at: when,
          day,
          habitIds: [h.id],
          title: h.name,
          body: 'Time for it — tap Done when you have.',
          channel: 'nudges',
          kind: 'INTERVAL',
          actions: ['DONE', 'SNOOZE'],
          counted: true,
        });
      }
    }

    // ── Fixed clock times ────────────────────────────────────────────────
    for (const h of input.habits) {
      if (!h.policy.enabled || h.policy.kind !== 'FIXED' || !h.policy.times?.length) continue;
      if (isToday && (h.doneToday || h.donePeriod)) continue;
      if (isToday && h.policy.onlyWhenBehind && h.todayRatio >= 0.6) continue;
      let n = 0;
      for (const hhmm of h.policy.times) {
        const [hh, mm] = hhmm.split(':').map(Number);
        if (hh === undefined || mm === undefined || Number.isNaN(hh) || Number.isNaN(mm)) continue;
        if (n >= h.policy.maxPerDay) break;
        const at = instantOf(day, hh * 60 + mm, zone);
        const id = `fix:${h.id}:${day}:${hhmm}`;
        n += 1;
        const when = effectiveAt(id, at);
        if (when === null) continue;
        push({
          id,
          at: when,
          day,
          habitIds: [h.id],
          title: h.name,
          body: h.movement ? snackLine(h.snackType, h.name) : 'Scheduled reminder — tap Done when you have.',
          channel: 'nudges',
          kind: 'FIXED',
          actions: ['DONE', 'SNOOZE'],
          snackType: h.snackType,
          counted: true,
        });
      }
    }

    // ── Water: pace-aware checks, one interval after the last tap ────────
    const water = input.water;
    if (water && activeOk && water.intervalMin > 0) {
      const logged = isToday ? water.loggedMl : 0;
      if (logged < settings.waterGoalMl) {
        const anchor = Math.max(isToday ? (water.lastTapMs ?? 0) : 0, activeStart);
        for (let at = anchor + water.intervalMin * 60_000; at < activeEnd; at += water.intervalMin * 60_000) {
          const minute = minutesOfDay(at, zone);
          const expected = expectedIntakeMl(minute, settings.activeStartMin, settings.activeEndMin, settings.waterGoalMl);
          if (isOnPace(logged, expected, settings.tapSizeMl)) continue;
          const id = `water:${day}:${minute}`;
          const when = effectiveAt(id, at);
          if (when === null) continue;
          const behind = Math.max(0, expected - logged);
          push({
            id,
            at: when,
            day,
            habitIds: [water.habitId],
            title: 'Water',
            body: behind > 0 ? `About ${Math.ceil(behind / 50) * 50} ml behind pace — a glass now keeps you on track.` : 'A glass now keeps you on pace.',
            channel: 'water',
            kind: 'WATER',
            actions: ['WATER', 'SNOOZE'],
            waterMl: settings.tapSizeMl,
            counted: true,
          });
        }
      }
    }

    // ── Weekly summary ───────────────────────────────────────────────────
    if (settings.weeklySummary.enabled && input.weekSummary && weekdayOf(day) === settings.weeklySummary.weekday) {
      const at = instantOf(day, settings.weeklySummary.minute, zone);
      const id = `summary:${day}`;
      if (!latest.has(id)) {
        push({
          id,
          at,
          day,
          habitIds: [],
          title: input.weekSummary.title,
          body: input.weekSummary.body,
          channel: 'summary',
          kind: 'SUMMARY',
          actions: ['OPEN'],
          counted: false,
        });
      }
    }

    // ── Cycle: a prompt on the expected day, plus cycle-relative reminders ──
    const discreet = !!input.cycleDiscreet;
    if (input.cycleExpectedDay === day) {
      const id = `cycle:${day}`;
      const when = effectiveAt(id, instantOf(day, 9 * 60, zone));
      if (when !== null) {
        push({
          id,
          at: when,
          day,
          habitIds: [],
          title: discreet ? DISCREET_TITLE : 'Cycle',
          body: discreet ? DISCREET_BODY : 'Around the expected day — log it when it starts.',
          channel: 'cycle',
          kind: 'CYCLE',
          actions: ['OPEN'],
          counted: false,
        });
      }
    }
    for (const r of input.cycleReminders ?? []) {
      if (r.day !== day) continue;
      const id = `cycle:r:${r.id}:${day}`;
      const when = effectiveAt(id, instantOf(day, r.minute, zone));
      if (when === null) continue;
      push({
        id,
        at: when,
        day,
        habitIds: [],
        title: discreet ? DISCREET_TITLE : r.label,
        body: discreet ? DISCREET_BODY : 'A cycle reminder you set.',
        channel: 'cycle',
        kind: 'CYCLE',
        actions: ['OPEN'],
        counted: false,
      });
    }
  }

  // ── One-off events (Sugar Shield follow-up) ────────────────────────────
  for (const e of input.events) {
    const id = `event:${e.id}`;
    const when = effectiveAt(id, e.at);
    if (when === null) continue;
    push({
      id,
      at: when,
      day: calendarDayOf(when, zone),
      habitIds: [e.habitId],
      title: e.title,
      body: e.body,
      channel: 'nudges',
      kind: 'EVENT',
      actions: ['DONE', 'SNOOZE'],
      snackType: 'WALK',
      counted: false,
    });
  }

  candidates.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));

  // ── Merge anything closer than 5 minutes ───────────────────────────────
  const merged: Candidate[] = [];
  for (const c of candidates) {
    const last = merged[merged.length - 1];
    if (last && c.at - last.at < MERGE_WINDOW_MS && last.kind !== 'SUMMARY' && c.kind !== 'SUMMARY' && last.kind !== 'CYCLE' && c.kind !== 'CYCLE') {
      merged[merged.length - 1] = mergeTwo(last, c);
      continue;
    }
    merged.push(c);
  }

  // ── Daily cap on automatic nudges ──────────────────────────────────────
  const used = new Map<string, number>();
  for (const day of days) used.set(day, firedCount(latest, day));
  const out: ScheduledNudge[] = [];
  for (const c of merged) {
    if (c.counted) {
      const n = used.get(c.day) ?? 0;
      if (n >= settings.dailyNudgeCap) continue;
      used.set(c.day, n + 1);
    }
    const { counted: _counted, ...nudge } = c;
    out.push(nudge);
  }
  return out;
}

function mergeTwo(a: Candidate, b: Candidate): Candidate {
  const habitIds = [...a.habitIds, ...b.habitIds.filter((id) => !a.habitIds.includes(id))];
  const lines = [a.body, b.body].map((x) => x.split(' — ')[0]!.replace(/\.$/, ''));
  const hasWater = a.kind === 'WATER' || b.kind === 'WATER';
  const actions: NudgeActionKind[] = ['DONE', 'SNOOZE'];
  if (hasWater) actions.splice(1, 0, 'WATER');
  return {
    ...a,
    habitIds,
    title: hasWater ? 'Water & a movement snack' : 'Time for a break',
    body: lines.join(' · '),
    channel: a.channel === 'water' ? b.channel : a.channel,
    actions,
    snackType: a.snackType ?? b.snackType,
    waterMl: a.waterMl ?? b.waterMl,
    counted: a.counted || b.counted,
  };
}
