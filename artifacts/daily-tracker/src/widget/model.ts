/**
 * What the home-screen widget shows, computed from state: up to three tiles,
 * each a habit with a ring, a short value and a caption. Pure (no React, no
 * clock) so it is unit-tested and shared by the in-app refresh and the
 * headless click handler.
 */
import colors from '@/constants/colors';
import type { Habit } from '@/src/domain/models';
import { SNACK_LABELS } from '@/src/domain/models';
import { nextRotationItem } from '@/src/domain/nudges/nextNudge';
import { formatNumber } from '@/src/domain/time/format';
import { activeHabits, habitView, rotationItems, todaySummary, waterHabit } from '@/src/state/selectors';
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
}

export interface WidgetModel {
  day: string;
  tiles: WidgetTile[];
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
}

/** "750 ml", "1.3 L", "42 oz" — short enough for a ring. */
export function shortVolume(ml: number, units: 'ml' | 'oz'): string {
  if (units === 'oz') return `${formatNumber(ml / 29.5735)} oz`;
  if (ml >= 1000) {
    const litres = Math.round(ml / 100) / 10;
    return `${litres % 1 === 0 ? litres.toFixed(0) : litres.toFixed(1)} L`;
  }
  return `${formatNumber(ml)} ml`;
}

/** The snack habit the rotation suggests next (what a tap on the automatic movement tile logs). */
export function rotationHabit(state: TrackerState, today: string): Habit | undefined {
  const items = rotationItems(state);
  const completed = state.snacks.filter((x) => x.day === today && x.trigger !== 'SUGAR_SHIELD').length;
  const swap = state.nudgeSwap?.day === today ? state.nudgeSwap.offset : 0;
  const item = nextRotationItem(items, completed + swap);
  const id = item?.habitId;
  return id ? state.habits.find((h) => h.id === id && !h.archived) : undefined;
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
  const base = { habitId: habit.id, kind: 'habit' as const, name: habit.name, ratio: clamp01(view.todayRatio), done, color };

  if (habit.type === 'YES_NO') {
    const caption = weekly ? `${view.periodDone ?? 0} of ${view.rule.timesPerPeriod} days` : doneToday ? 'Done' : 'Tap to log';
    return { ...base, value: doneToday ? '✓' : '–', caption };
  }
  const unit = habit.snackType ? SNACK_LABELS[habit.snackType].unit : habit.unit;
  const value = doneToday && habit.type !== 'TIMER' && !habit.snackType ? '✓' : formatNumber(view.todayValue);
  const caption = weekly
    ? `${view.periodDone ?? 0} of ${view.rule.timesPerPeriod} days`
    : habit.snackType
      ? `of ${formatNumber(view.target)} ${view.target === 1 ? 'set' : 'sets'}`
      : `of ${formatNumber(view.target)} ${unit}`.trimEnd();
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
      return {
        habitId: habit.id,
        kind: 'rotation',
        name: habit.name,
        value: String(summary.snacksDone),
        caption: `of ${summary.snacksTarget} snacks`,
        ratio: clamp01(summary.rings.movement),
        done: summary.snacksTarget > 0 && summary.snacksDone >= summary.snacksTarget,
        color: colors.dark.cat.movement,
      };
    }
    return habitTile(state, habit, today);
  });
  return { day: today, tiles };
}

/** Stable key: when it changes, the widget needs a redraw. */
export function widgetModelKey(model: WidgetModel): string {
  return `${model.day}|${model.tiles.map((t) => `${t.habitId}:${t.name}:${t.value}:${t.caption}:${t.ratio.toFixed(3)}`).join('|')}`;
}
