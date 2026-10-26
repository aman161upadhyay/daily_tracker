import type { BodyState } from '@/src/domain/body/types';
import type {
  CycleDayLog,
  Habit,
  HabitEntry,
  HabitRule,
  MindSession,
  MovementSnack,
  NudgeEvent,
  NudgePolicy,
  ScheduledEvent,
  Settings,
  WaterEntry,
} from '@/src/domain/models';

export interface TrackerState {
  version: 1;
  habits: Habit[];
  rules: HabitRule[];
  policies: NudgePolicy[];
  entries: HabitEntry[];
  water: WaterEntry[];
  snacks: MovementSnack[];
  mind: MindSession[];
  /** What happened to recent nudges (fired / done / snoozed…), pruned to 7 days. */
  nudgeEvents: NudgeEvent[];
  /** Pending one-off nudges created in-app (Sugar Shield follow-up); pruned once past. */
  events: ScheduledEvent[];
  settings: Settings;
  /** Health Connect mirrors (steps, sleep, heart, weight, workouts) and the sync status. */
  body: BodyState;
  /** Cycle day sheet: flow, mood, symptoms and notes per calendar day. */
  cycleLogs: CycleDayLog[];
  /** Epoch ms until which the live nudge is snoozed. */
  nudgeSnoozedUntil?: number;
  /** Manual "Swap" presses advance the rotation for the rest of the day. */
  nudgeSwap?: { day: string; offset: number };
}

export const STORAGE_KEY = 'dailytracker.state.v1';
