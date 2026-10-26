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
 * - automatic cadences (rotation, interval, water) stay inside active hours,
 *   snoozed or not; FIXED clock times are the user's explicit choice and may
 *   sit outside them
 * - never more than `dailyNudgeCap` automatic nudges per tracking day,
 *   counting the ones that already fired
 * - two nudges less than 5 minutes apart merge into one, and stay one: what
 *   happens to the merged notification happens to every slot in it
 * - a snooze moves only that nudge; a swap re-offers the slot with the next snack
 * - water nudges are dropped while on pace and stop at the goal
 * - a habit that is done for today (or for its week) emits nothing more
 * - off mode and the master switch silence everything
 * - DST transitions never double-fire or skip a day (wall-clock based slots)
 */
import type { NudgeEvent, NudgePolicy, ScheduledEvent, Settings, SnackType } from '../models';
import { SNACK_LABELS } from '../models';
import { formatVolume } from '../time/format';
import { DEFAULT_BOUNDARY_HOUR, addDays, calendarDayOf, instantOf, minutesOfDay, trackingDayOf, weekdayOf } from '../time/trackingDay';
import { expectedIntakeMl, isOnPace } from '../water/pace';

export type NudgeChannel = 'nudges' | 'water' | 'summary' | 'cycle' | 'mind';
export type NudgeActionKind = 'DONE' | 'SNOOZE' | 'SWAP' | 'WATER' | 'OPEN';
export type NudgeKindPlanned = 'ROTATION' | 'INTERVAL' | 'FIXED' | 'WATER' | 'EVENT' | 'SUMMARY' | 'CYCLE';

export interface ScheduledNudge {
  /** Deterministic per (policy, slot); doubles as the OS notification identifier. */
  id: string;
  at: number;
  /** Tracking day the nudge belongs to (the daily cap and the per-habit budget count by it). */
  day: string;
  /**
   * Set on a merged notification: the slot ids it stands for (its own first). What happens to the
   * notification — it rings, is snoozed, is done — is recorded against every one of them, so no
   * constituent comes back on its own two minutes later.
   */
  mergedIds?: string[];
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
  /** Weekly / monthly habits: last tracking day of the period `donePeriod` refers to (slots up to it are settled too). */
  periodEndsOn?: string;
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
> & {
  /** The volume unit the person reads (water copy); ml when absent. */
  units?: Settings['units'];
};

export interface PlanInput {
  nowMs: number;
  zone: string;
  /** Tracking day — progress figures refer to it. */
  today: string;
  /** Hour the tracking day starts (`settings.dayBoundaryHour`); a clock time before it belongs to the previous tracking day. */
  boundaryHour?: number;
  settings: PlanSettings;
  habits: PlanHabit[];
  /**
   * Habits a one-off event may still ring for (every active habit, whatever its reminder policy,
   * plus the Sugar Shield placeholder). When given, events for any other habit — archived or
   * deleted after the event was scheduled — are skipped. Absent: every event is eligible.
   */
  eventHabitIds?: readonly string[];
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
/**
 * Hard ceiling on slots per series per day. Intervals are validated on import,
 * but the planner must never depend on that: a one-minute interval over a
 * 24-hour window is 1 440 slots, anything beyond that is a bug, not a plan.
 */
const MAX_SLOTS_PER_DAY = 1_500;
/** Interval in ms, never below one minute (a tiny or negative step would loop forever). */
function slotStep(intervalMin: number): number {
  return Math.max(1, Number.isFinite(intervalMin) ? Math.floor(intervalMin) : 1) * 60_000;
}

/**
 * Done and dismissed end a nudge for good; the others move it. WATER is not terminal on its own:
 * a drink on a merged water + movement nudge is followed by a SNOOZED that keeps the movement
 * half open (a water-only nudge records DONE as well).
 */
const TERMINAL: ReadonlySet<NudgeEvent['kind']> = new Set(['DONE', 'DISMISSED']);

/**
 * Latest event per nudge id — the only thing the planner needs from the history. A terminal
 * event (done, dismissed) outranks a snooze or swap whatever their timestamps say: the clock can
 * be set back between the two, and a settled nudge must never be re-offered.
 */
export function latestEvents(events: readonly NudgeEvent[]): Map<string, NudgeEvent> {
  const out = new Map<string, NudgeEvent>();
  for (const e of events) {
    const prev = out.get(e.nudgeId);
    if (!prev) {
      out.set(e.nudgeId, e);
      continue;
    }
    const rank = (x: NudgeEvent) => (TERMINAL.has(x.kind) ? 1 : 0);
    if (rank(e) > rank(prev) || (rank(e) === rank(prev) && e.at >= prev.at)) out.set(e.nudgeId, e);
  }
  return out;
}

/** The notification a slot's event arrived through: several slots merged into one ring once. */
const deliveryOf = (e: NudgeEvent) => e.via ?? e.nudgeId;

/** Slot ids outside the daily cap: the weekly summary, cycle prompts and reminders, one-off follow-ups. */
const EXEMPT_ID = /^(summary|cycle|event):/;

/** What rang on one tracking day, for the cap and the per-habit budgets. */
interface Deliveries {
  /** Notifications that count against the cap. */
  counted: number;
  /** Notifications each habit was named in. */
  perHabit: Map<string, number>;
}

/**
 * The deliveries of a tracking day, from every FIRED event — not from the latest event per slot,
 * which is the settlement view: a slot snoozed and rung again rang twice, and a snooze on top of a
 * ring does not un-ring it. A delivery is one notification at one time; the constituents of a
 * merged one share its id and time and count once. It counts against the cap only when one of
 * the slots in it was an automatic cadence: a weekly summary, a cycle prompt or a Sugar Shield
 * follow-up on its own is exempt when planned, so it is exempt once it rang too — or two exempt
 * rings would push a planned rotation slot out of a cap of three. A button pressed on the Today
 * card writes DONE without a ring, and that is not a delivery.
 */
function deliveriesOn(events: readonly NudgeEvent[], day: string): Deliveries {
  const counted = new Map<string, boolean>();
  const perHabit = new Map<string, Set<string>>();
  for (const e of events) {
    if (e.kind !== 'FIRED' || e.day !== day) continue;
    const delivery = `${deliveryOf(e)}|${e.at}`;
    counted.set(delivery, (counted.get(delivery) ?? false) || !EXEMPT_ID.test(e.nudgeId));
    for (const id of e.habitIds) {
      let s = perHabit.get(id);
      if (!s) perHabit.set(id, (s = new Set()));
      s.add(delivery);
    }
  }
  let n = 0;
  for (const c of counted.values()) if (c) n += 1;
  return { counted: n, perHabit: new Map([...perHabit].map(([id, s]) => [id, s.size])) };
}

/** Notification titles get one line in the shade; a long habit name (up to 80 characters in the editor) is cut with an ellipsis. */
export const TITLE_MAX = 40;
export function shortName(name: string): string {
  const t = name.trim();
  return t.length <= TITLE_MAX ? t : `${t.slice(0, TITLE_MAX - 1).trimEnd()}…`;
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
  /** One short line naming what this is, for the body of a merged notification. */
  line: string;
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
  /** Inside the pause-aware window the OS will actually be asked to ring in. */
  const placeable = (at: number) => at >= earliest && at <= horizonEnd;
  // Ids are per wall-clock minute. On the night DST ends the clock shows one hour twice, so two
  // elapsed-hour slots can share a minute; the first keeps the id, the second is dropped (one
  // reminder fewer on a 25-hour day, never two notifications fighting over one identifier). A
  // dropped candidate spends nothing: budgets and the rotation move only on what was kept.
  const seen = new Set<string>();
  const push = (c: Candidate): boolean => {
    if (!placeable(c.at) || seen.has(c.id)) return false;
    seen.add(c.id);
    candidates.push(c);
    return true;
  };
  const boundary = input.boundaryHour ?? DEFAULT_BOUNDARY_HOUR;
  /** The tracking day a clock time belongs to: progress, budgets and the cap are all kept by it. */
  const dayOf = (at: number) => trackingDayOf(at, zone, boundary);
  /** Whether a clock time belongs to the tracking day the progress figures describe. */
  const inToday = (at: number) => dayOf(at) === input.today;
  /**
   * Nothing more wanted for the tracking day the slot falls in: a 1:30 am reminder is judged by the
   * evening before it, and a weekly quota met on Monday settles the rest of that week's slots too.
   */
  const settled = (h: PlanHabit, at: number) => {
    const d = dayOf(at);
    if (d === input.today) return h.doneToday || h.donePeriod;
    return h.donePeriod && h.periodEndsOn !== undefined && d > input.today && d <= h.periodEndsOn;
  };

  /** Apply snooze / swap / fired bookkeeping to a slot; returns the effective time or null. */
  const effectiveAt = (id: string, at: number): number | null => {
    const e = latest.get(id);
    if (!e) return at > nowMs ? at : null;
    if (e.kind === 'SNOOZED') return e.untilMs !== undefined && e.untilMs > nowMs ? e.untilMs : null;
    if (e.kind === 'SWAPPED') return Math.max(at, nowMs + MIN_LEAD_MS);
    return null; // fired, done or dismissed: never again
  };

  // Per-habit budgets by tracking day: what already rang that day plus what is planned now (past,
  // undelivered slots do not count). Built when a day's first slot asks for it.
  const delivered = new Map<string, Deliveries>();
  const deliveredOn = (day: string) => {
    let d = delivered.get(day);
    if (!d) delivered.set(day, (d = deliveriesOn(input.nudgeEvents, day)));
    return d;
  };
  const budgetFor = (day: string) => deliveredOn(day).perHabit;

  for (const day of days) {
    const activeStart = instantOf(day, settings.activeStartMin, zone);
    const activeEnd = instantOf(day, settings.activeEndMin, zone);
    const activeOk = activeEnd > activeStart;

    // ── Movement rotation: one shared series of slots ─────────────────────
    const rotation = input.habits.filter((h) => h.movement && h.policy.enabled && (h.policy.kind === 'ROTATION' || h.policy.kind === 'INTERVAL'));
    if (activeOk && rotation.length > 0 && settings.nudgeIntervalMin > 0) {
      // Today's last snack anchors today's series; on any other day's window it lies outside the
      // window and the series starts at the active start.
      const lastSnack = Math.max(...rotation.map((h) => h.lastLogMs ?? 0));
      const anchor = Math.max(lastSnack, activeStart);
      // The Today card's "snooze all": slots before it collapse onto it (the merge step folds them into one).
      const snoozedUntil = input.snoozedUntilMs && input.snoozedUntilMs > nowMs ? input.snoozedUntilMs : 0;
      let ordinal = 0;
      const rotStep = slotStep(settings.nudgeIntervalMin);
      let rotSlots = 0;
      for (let at = anchor + rotStep; at < activeEnd && rotSlots++ < MAX_SLOTS_PER_DAY; at += rotStep) {
        const minute = minutesOfDay(at, zone);
        const id = `rot:${day}:${minute}`;
        const when = effectiveAt(id, Math.max(at, snoozedUntil));
        if (when === null) continue;
        // A slot inside a pause (or past the horizon) is never offered, so it neither spends the
        // habit's daily budget nor advances the rotation: the first real slot matches the card. A
        // snooze (or snooze-all) that lands past the end of the active hours is over for the day.
        if (!placeable(when) || when >= activeEnd) continue;
        // Nothing wanted for the tracking day this slot falls in — but the window may cross the day
        // boundary (an active end after 3 am), and the slots past it belong to a fresh day with fresh
        // quotas: they are judged on their own, not dropped with the settled ones before them.
        const eligible = rotation.filter((h) => !settled(h, at));
        if (eligible.length === 0) continue;
        const slotDay = dayOf(at);
        const perHabit = budgetFor(slotDay);
        const hasRoom = (h: PlanHabit) => (perHabit.get(h.id) ?? 0) < h.policy.maxPerDay;
        // The rotation advances once per completed snack (and per swap), exactly like the Today card,
        // so the first pending slot always matches what the card shows. Past slots do not move it.
        const base = slotDay === input.today ? input.rotationCompletedToday + input.swapOffset : 0;
        const history = latest.get(id);
        let item: PlanHabit | undefined;
        if (history?.kind === 'SNOOZED') {
          // A snooze re-offers the same snack (a merged notification named several habits; the
          // snack among them is the one to bring back).
          item = eligible.find((h) => history.habitIds.includes(h.id) && hasRoom(h));
        } else if (history?.kind === 'SWAPPED') {
          // A swap offers the next snack after the one declined.
          const i = eligible.findIndex((h) => history.habitIds.includes(h.id));
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
        if (!item) continue; // every budget spent for this slot's day; a later day's slots start afresh
        const kept = push({
          id,
          at: when,
          day: slotDay,
          habitIds: [item.id],
          title: 'Movement snack',
          body: `${snackLine(item.snackType, item.name)} — ${shortName(item.name).toLowerCase()}`,
          line: `${snackLine(item.snackType, item.name)} (${shortName(item.name)})`,
          channel: 'nudges',
          kind: 'ROTATION',
          actions: eligible.length > 1 ? ['DONE', 'SNOOZE', 'SWAP'] : ['DONE', 'SNOOZE'],
          snackType: item.snackType,
          counted: true,
        });
        if (!kept) continue;
        ordinal += 1;
        perHabit.set(item.id, (perHabit.get(item.id) ?? 0) + 1);
      }
    }

    // ── Other interval habits (non-movement, e.g. a custom "sip tea" every 2 h) ──
    for (const h of input.habits) {
      if (h.movement || !h.policy.enabled || h.policy.kind !== 'INTERVAL' || !(h.policy.intervalMin! >= 1)) continue;
      const start = h.policy.activeStartMin !== undefined ? instantOf(day, h.policy.activeStartMin, zone) : activeStart;
      const end = h.policy.activeEndMin !== undefined ? instantOf(day, h.policy.activeEndMin, zone) : activeEnd;
      if (end <= start) continue;
      const anchor = Math.max(h.lastLogMs ?? 0, start);
      let slots = 0;
      const step = slotStep(h.policy.intervalMin!);
      for (let at = anchor + step; at < end && slots++ < MAX_SLOTS_PER_DAY; at += step) {
        if (settled(h, at)) continue;
        if (h.policy.onlyWhenBehind && inToday(at)) {
          const elapsed = (at - start) / (end - start);
          if (h.todayRatio >= elapsed) continue;
        }
        const id = `int:${h.id}:${day}:${minutesOfDay(at, zone)}`;
        const when = effectiveAt(id, at);
        // Fired, done or dismissed: already in the day's budget below. Elapsed and never delivered
        // (the phone was off, the slot was paused): not a reminder the person got, so not counted.
        if (when === null) continue;
        if (!placeable(when) || when >= end) continue; // paused, beyond the horizon or snoozed past the window: not offered, not counted
        // The per-day budget, like the rotation's: what rang that tracking day plus what is planned
        // for it. A window that crosses the day boundary spends two days' budgets, not one twice over.
        const perHabit = budgetFor(dayOf(at));
        if ((perHabit.get(h.id) ?? 0) >= h.policy.maxPerDay) continue;
        const kept = push({
          id,
          at: when,
          day: dayOf(at),
          habitIds: [h.id],
          title: shortName(h.name),
          body: 'Time for it — tap Done when you have.',
          line: shortName(h.name),
          channel: 'nudges',
          kind: 'INTERVAL',
          actions: ['DONE', 'SNOOZE'],
          counted: true,
        });
        if (kept) perHabit.set(h.id, (perHabit.get(h.id) ?? 0) + 1);
      }
    }

    // ── Fixed clock times ────────────────────────────────────────────────
    for (const h of input.habits) {
      if (!h.policy.enabled || h.policy.kind !== 'FIXED' || !h.policy.times?.length) continue;
      // The times are placed on the calendar day `day`; a weekday choice is about that date.
      if (h.policy.weekdays?.length && !h.policy.weekdays.includes(weekdayOf(day))) continue;
      for (const hhmm of h.policy.times) {
        const [hh, mm] = hhmm.split(':').map(Number);
        // Stored times are validated on the way in; a bad one from an old file is skipped, never placed.
        if (!Number.isInteger(hh) || !Number.isInteger(mm) || hh! < 0 || hh! > 23 || mm! < 0 || mm! > 59) continue;
        const at = instantOf(day, hh! * 60 + mm!, zone);
        if (settled(h, at)) continue;
        if (inToday(at) && h.policy.onlyWhenBehind && h.todayRatio >= 0.6) continue;
        const id = `fix:${h.id}:${day}:${hhmm}`;
        const when = effectiveAt(id, at);
        if (when === null) continue; // delivered or settled: in the budget already; missed: not a reminder received
        if (!placeable(when)) continue;
        const perHabit = budgetFor(dayOf(at));
        if ((perHabit.get(h.id) ?? 0) >= h.policy.maxPerDay) continue;
        const kept = push({
          id,
          at: when,
          day: dayOf(at),
          habitIds: [h.id],
          title: shortName(h.name),
          body: h.movement ? snackLine(h.snackType, h.name) : 'Scheduled reminder — tap Done when you have.',
          line: h.movement && h.snackType ? `${snackLine(h.snackType, h.name)} (${shortName(h.name)})` : shortName(h.name),
          channel: 'nudges',
          kind: 'FIXED',
          actions: ['DONE', 'SNOOZE'],
          snackType: h.snackType,
          counted: true,
        });
        if (kept) perHabit.set(h.id, (perHabit.get(h.id) ?? 0) + 1);
      }
    }

    // ── Water: pace-aware checks, one interval after the last tap ────────
    const water = input.water;
    if (water && activeOk && water.intervalMin >= 1) {
      // Today's taps anchor today's series; on another day's window the last tap lies outside it.
      const anchor = Math.max(water.lastTapMs ?? 0, activeStart);
      const waterStep = slotStep(water.intervalMin);
      let waterSlots = 0;
      for (let at = anchor + waterStep; at < activeEnd && waterSlots++ < MAX_SLOTS_PER_DAY; at += waterStep) {
        // What is logged counts for the tracking day the slot falls in; any other day starts at zero.
        const logged = inToday(at) ? water.loggedMl : 0;
        if (logged >= settings.waterGoalMl) continue;
        const minute = minutesOfDay(at, zone);
        const expected = expectedIntakeMl(minute, settings.activeStartMin, settings.activeEndMin, settings.waterGoalMl);
        if (isOnPace(logged, expected, settings.tapSizeMl)) continue;
        const id = `water:${day}:${minute}`;
        const when = effectiveAt(id, at);
        if (when === null || when >= activeEnd) continue;
        const behind = Math.max(0, expected - logged);
        // In the unit the person reads: "8.5 oz behind", not "250 ml" for someone who set ounces.
        const gap = formatVolume(Math.ceil(behind / 50) * 50, settings.units ?? 'ml');
        push({
          id,
          at: when,
          day: dayOf(at),
          habitIds: [water.habitId],
          title: 'Water',
          body: behind > 0 ? `About ${gap.value} ${gap.unit} behind pace — a glass now keeps you on track.` : 'A glass now keeps you on pace.',
          line: behind > 0 ? `Water (about ${gap.value} ${gap.unit} behind pace)` : 'Water',
          channel: 'water',
          kind: 'WATER',
          actions: ['WATER', 'SNOOZE'],
          waterMl: settings.tapSizeMl,
          counted: true,
        });
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
          day: dayOf(at),
          habitIds: [],
          title: input.weekSummary.title,
          body: input.weekSummary.body,
          line: input.weekSummary.title,
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
          day: dayOf(when),
          habitIds: [],
          title: discreet ? DISCREET_TITLE : 'Cycle',
          body: discreet ? DISCREET_BODY : 'Around the expected day — log it when it starts.',
          line: discreet ? DISCREET_TITLE : 'Cycle',
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
        day: dayOf(when),
        habitIds: [],
        title: discreet ? DISCREET_TITLE : r.label,
        body: discreet ? DISCREET_BODY : 'A cycle reminder you set.',
        line: discreet ? DISCREET_TITLE : r.label,
        channel: 'cycle',
        kind: 'CYCLE',
        actions: ['OPEN'],
        counted: false,
      });
    }
  }

  // ── One-off events (Sugar Shield follow-up) ────────────────────────────
  // Only for habits still in play: an archived or deleted habit's follow-up is never rung. (The
  // Sugar Shield habit itself has an EVENT policy and so is not in `input.habits`.)
  const live = input.eventHabitIds ? new Set(input.eventHabitIds) : null;
  for (const e of input.events) {
    if (live && !live.has(e.habitId)) continue;
    const id = `event:${e.id}`;
    const when = effectiveAt(id, e.at);
    if (when === null) continue;
    push({
      id,
      at: when,
      day: dayOf(when),
      habitIds: [e.habitId],
      title: e.title,
      body: e.body,
      line: e.title,
      channel: 'nudges',
      kind: 'EVENT',
      actions: ['DONE', 'SNOOZE'],
      snackType: 'WALK',
      counted: false,
    });
  }

  candidates.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));

  // ── Merge anything closer than 5 minutes, within one tracking day ──────
  // A merged notification keeps the earlier slot's time and day, and every slot in it is recorded
  // as delivered on that day. Two slots a minute apart across the 3 am boundary stay separate: a
  // slot planned against tomorrow's budget must not be charged to today's.
  const merged: Candidate[] = [];
  for (const c of candidates) {
    const last = merged[merged.length - 1];
    if (last && c.at - last.at < MERGE_WINDOW_MS && c.day === last.day && last.kind !== 'SUMMARY' && c.kind !== 'SUMMARY' && last.kind !== 'CYCLE' && c.kind !== 'CYCLE') {
      merged[merged.length - 1] = mergeTwo(last, c);
      continue;
    }
    merged.push(c);
  }

  // ── Daily cap on automatic nudges, per tracking day ────────────────────
  const used = new Map<string, number>();
  const out: ScheduledNudge[] = [];
  for (const c of merged) {
    if (c.counted) {
      const n = used.get(c.day) ?? deliveredOn(c.day).counted;
      if (n >= settings.dailyNudgeCap) continue;
      used.set(c.day, n + 1);
    }
    const { counted: _counted, line: _line, ...nudge } = c;
    out.push(nudge);
  }
  return out;
}

/** Two nudges within the merge window become one; the body names each habit so a Done on it is informed. */
function mergeTwo(a: Candidate, b: Candidate): Candidate {
  const habitIds = [...a.habitIds, ...b.habitIds.filter((id) => !a.habitIds.includes(id))];
  const hasWater = a.kind === 'WATER' || b.kind === 'WATER';
  const movement = (c: Candidate) => c.kind === 'ROTATION' || (!!c.snackType && c.kind !== 'WATER');
  const actions: NudgeActionKind[] = ['DONE', 'SNOOZE'];
  if (hasWater) actions.splice(1, 0, 'WATER');
  const title = hasWater ? (movement(a) || movement(b) ? 'Water & a movement snack' : 'Water & a reminder') : 'Time for a break';
  return {
    ...a,
    mergedIds: [...(a.mergedIds ?? [a.id]), ...(b.mergedIds ?? [b.id])],
    habitIds,
    title,
    body: `${a.line} · ${b.line}`,
    line: `${a.line} · ${b.line}`,
    channel: a.channel === 'water' ? b.channel : a.channel,
    actions,
    snackType: a.snackType ?? b.snackType,
    waterMl: a.waterMl ?? b.waterMl,
    counted: a.counted || b.counted,
  };
}
