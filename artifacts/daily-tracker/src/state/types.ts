import type {
  Habit,
  HabitEntry,
  HabitRule,
  MindSession,
  MovementSnack,
  NudgePolicy,
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
  settings: Settings;
  /** Epoch ms until which the live nudge is snoozed. */
  nudgeSnoozedUntil?: number;
  /** Manual "Swap" presses advance the rotation for the rest of the day. */
  nudgeSwap?: { day: string; offset: number };
}

export const STORAGE_KEY = 'dailytracker.state.v1';
