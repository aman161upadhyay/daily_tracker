/**
 * What the home-screen widget shows, computed from state: up to three tiles,
 * each a habit with a ring, a short value and a caption. Pure (no React, no
 * clock) so it is unit-tested and shared by the in-app refresh and the
 * headless click handler.
 */
import colors from '@/constants/colors';
import type { Habit } from '@/src/domain/models';
import { formatNumber, formatOneDecimal, mlToOz } from '@/src/domain/time/format';
import { activeHabits, habitView, rotationHabit, todaySummary, waterHabit } from '@/src/state/selectors';
import { parseDay, weekdayOf } from '@/src/domain/time/trackingDay';

export { rotationHabit } from '@/src/state/selectors';
import type { TrackerState } from '@/src/state/types';

/** Name registered in app.json; the OS identifies the widget by it. */
export const WIDGET_NAME = 'Tracker';
export const WIDGET_MAX_TILES = 3;

export interface WidgetTile {
  habitId: string;
  /** `rotation` = the automatic movement tile: whole-day movement progress, tap logs the snack that is up next. */
  kind: 'water' | 'rotation' | 'habit';
  /** Label under the ring. */
  name: string;
  /** Big text inside the ring, e.g. "1.3 L", "6", "✓". */
  value: string;
  /** Small text under the name, e.g. "of 2 L", "of 10 pages", "done". */
  caption: string;
  /** 0..1, clamped. */
  ratio: number;
  done: boolean;
  color: string;
  /** The Steps habit: its count comes from the phone or the app, a tap on the ring logs nothing. */
  steps?: boolean;
}

export interface WidgetModel {
  day: string;
  tiles: WidgetTile[];
  /** Something went wrong on the way here (storage failed): shown instead of pretending nothing is set up. */
  notice?: string;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** "Mon 26": the tracking day the tiles describe, so a redraw the OS delayed cannot pass yesterday off as today. */
export function widgetDayLabel(day: string): string {
  if (!day) return '';
  return `${WEEKDAYS[weekdayOf(day)]} ${parseDay(day).day}`;
}

/** Ring values stay short: "12,500" steps become "12.5k" (the caption still carries the unit). */
export function compactValue(n: number): string {
  if (Math.abs(n) >= 10000) {
    const k = Math.round(n / 100) / 10;
    return `${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}k`;
  }
  return formatNumber(n);
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
}

/** "750 ml", "1.3 L", "8.5 oz", "42 oz" — short enough for a ring (ounces keep one decimal under 100). */
export function shortVolume(ml: number, units: 'ml' | 'oz'): string {
  if (units === 'oz') {
    const oz = mlToOz(ml);
    return `${oz >= 100 ? formatNumber(oz) : formatOneDecimal(oz)} oz`;
  }
  if (ml >= 1000) {
    const litres = Math.round(ml / 100) / 10;
    return `${litres % 1 === 0 ? litres.toFixed(0) : litres.toFixed(1)} L`;
  }
  return `${formatNumber(ml)} ml`;
}

/**
 * Habits the widget shows, in order: the ones chosen in Settings, else water, the movement
 * rotation and mind, topped up with the first other active habits.
 */
export function widgetHabits(state: TrackerState, today: string): Habit[] {
  const active = activeHabits(state);
  const chosen = state.settings.widgetHabitIds
    .map((id) => active.find((h) => h.id === id))
    .filter((h): h is Habit => h !== undefined);
  if (chosen.length > 0) return chosen.slice(0, WIDGET_MAX_TILES);

  const auto: Habit[] = [];
  const push = (h: Habit | undefined) => {
    if (h && !auto.includes(h) && auto.length < WIDGET_MAX_TILES) auto.push(h);
  };
  push(waterHabit(state));
  push(rotationHabit(state, today));
  push(active.find((h) => h.mindKind));
  for (const h of active) push(h.presetId === 'sugar-shield' ? undefined : h);
  return auto;
}

function habitTile(state: TrackerState, habit: Habit, today: string): WidgetTile {
  const view = habitView(state, habit, today);
  const color = colors.dark.cat[habit.category];
  const weekly = view.rule.cadence !== 'DAILY';
  const doneToday = view.todayValue >= view.target;
  const done = weekly ? view.todayRatio >= 1 : doneToday;
  const base = { habitId: habit.id, kind: 'habit' as const, name: habit.name, ratio: clamp01(view.todayRatio), done, color, ...(habit.presetId === 'steps' ? { steps: true } : {}) };

  if (habit.type === 'YES_NO') {
    const caption = weekly ? `${view.periodDone ?? 0} of ${view.periodQuota ?? view.rule.timesPerPeriod} days` : doneToday ? 'Done' : 'Tap to log';
    return { ...base, value: doneToday ? '✓' : '–', caption };
  }
  // A snack habit counts in its own unit ("4 walks", "2 climbs", "6 sets"), as its row does; "sets" fits only the squat kind.
  const unit = habit.snackType ? habit.unit || (view.target === 1 ? 'set' : 'sets') : habit.unit;
  const value = doneToday && habit.type !== 'TIMER' && !habit.snackType ? '✓' : compactValue(view.todayValue);
  const caption = weekly ? `${view.periodDone ?? 0} of ${view.periodQuota ?? view.rule.timesPerPeriod} days` : `of ${formatNumber(view.target)} ${unit}`.trimEnd();
  return { ...base, value, caption };
}

export function widgetModel(state: TrackerState, today: string, nowMs: number, zone: string): WidgetModel {
  const summary = todaySummary(state, today, nowMs, zone);
  const automatic = state.settings.widgetHabitIds.length === 0;
  const tiles = widgetHabits(state, today).map((habit): WidgetTile => {
    if (habit.presetId === 'water') {
      const logged = summary.water.loggedMl;
      return {
        habitId: habit.id,
        kind: 'water',
        name: habit.name,
        value: shortVolume(logged, state.settings.units),
        caption: `of ${shortVolume(state.settings.waterGoalMl, state.settings.units)}`,
        ratio: clamp01(summary.rings.hydration),
        done: logged >= state.settings.waterGoalMl,
        color: colors.dark.cat.hydration,
      };
    }
    if (automatic && habit.snackType) {
      // A met week or month ("nothing due", a full ring on Today) reads the same here: "of 0 snacks"
      // under a full ring looked broken. A day with nothing asked and nothing met stays "today".
      const settled = summary.snacksSettled;
      return {
        habitId: habit.id,
        kind: 'rotation',
        name: habit.name,
        value: String(summary.snacksDone),
        caption: summary.snacksTarget > 0 ? `of ${summary.snacksTarget} snacks` : settled ? 'nothing due' : 'snacks today',
        ratio: clamp01(summary.rings.movement),
        done: settled || (summary.snacksTarget > 0 && summary.snacksDone >= summary.snacksTarget),
        color: colors.dark.cat.movement,
      };
    }
    return habitTile(state, habit, today);
  });
  return { day: today, tiles };
}

/** What TalkBack reads for a ring: the progress, then what a tap does (pure, so tests can read it). */
export function ringLabel(tile: WidgetTile): string {
  const progress = `${tile.name}: ${tile.value} ${tile.caption}`.trim();
  // A tap logs only what the tap handler would log: a met daily target and the Steps count take no more (widgetTapActions).
  const action = tile.kind === 'water' ? 'Double-tap to log a glass.' : tile.kind === 'rotation' ? 'Double-tap to log the next snack.' : tile.steps ? 'Opens the habit.' : tile.done ? 'Done for today.' : 'Double-tap to log it.';
  return `${progress}. ${action}`;
}

/** Stable key: when it changes, the widget needs a redraw. */
export function widgetModelKey(model: WidgetModel): string {
  return `${model.day}|${model.notice ?? ''}|${model.tiles.map((t) => `${t.habitId}:${t.name}:${t.value}:${t.caption}:${t.ratio.toFixed(3)}`).join('|')}`;
}
