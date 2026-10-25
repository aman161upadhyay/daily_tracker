/**
 * Domain models. Pure TypeScript — no React Native imports here.
 *
 * Every timestamped row stores `at` (UTC ms), `zone` (IANA time zone at write
 * time) and `day` (the tracking day, computed once at write time). Entities
 * double as the export format: add fields with defaults, never rename or
 * remove them.
 */

export type Category = 'hydration' | 'movement' | 'mind' | 'cycle' | 'body' | 'fuel';

export type HabitType = 'YES_NO' | 'COUNT' | 'AMOUNT' | 'TIMER';

export type Cadence = 'DAILY' | 'WEEKLY' | 'MONTHLY';

export type EntrySource =
  | 'MANUAL'
  | 'AUTO_HC'
  | 'AUTO_WATER'
  | 'AUTO_TIMER'
  | 'AUTO_WIDGET';

export type NudgeKind = 'INTERVAL' | 'FIXED' | 'ROTATION' | 'EVENT' | 'CYCLE' | 'NONE';

export type SnackType =
  | 'SQUATS'
  | 'CALF_RAISES'
  | 'WALK'
  | 'STRETCH'
  | 'PUSH_UPS'
  | 'STAIRS'
  | 'VIGOROUS_MINUTE';

export type SnackTrigger = 'NUDGE' | 'WIDGET' | 'SUGAR_SHIELD' | 'MANUAL';

export type MindKind = 'MEDITATION' | 'BREATHING';

export type EvidenceGrade = 'Strong' | 'Moderate' | 'Emerging' | 'Guidance';

/** Icon keys are plain strings so the domain never depends on an icon library. */
export type HabitIcon =
  | 'drop'
  | 'meal'
  | 'squat'
  | 'calf'
  | 'walk'
  | 'stretch'
  | 'pushup'
  | 'stairs'
  | 'lightning'
  | 'barbell'
  | 'steps'
  | 'shield'
  | 'lotus'
  | 'wind'
  | 'moon'
  | 'journal'
  | 'heart'
  | 'leaf'
  | 'check';

export interface Habit {
  id: string;
  name: string;
  category: Category;
  type: HabitType;
  /** Display unit for COUNT / AMOUNT / TIMER habits ("reps", "ml", "min"). */
  unit: string;
  icon: HabitIcon;
  presetId?: string;
  /** Movement presets log through the snack log; this links the two. */
  snackType?: SnackType;
  /** Mind presets log through mind sessions; this links the two. */
  mindKind?: MindKind;
  createdDay: string;
  archived: boolean;
  pinned: boolean;
}

export interface HabitRule {
  habitId: string;
  /** Tracking day from which this rule applies (rule edits are versioned). */
  effectiveFrom: string;
  cadence: Cadence;
  /** For WEEKLY / MONTHLY: how many days per period count as success. */
  timesPerPeriod: number;
  /** Per-day target in the habit's unit (1 for YES_NO). */
  target: number;
  freezesPerMonth: number;
}

export interface HabitEntry {
  id: string;
  habitId: string;
  day: string;
  at: number;
  zone: string;
  value: number;
  source: EntrySource;
}

export interface WaterEntry {
  id: string;
  at: number;
  zone: string;
  day: string;
  ml: number;
  source: EntrySource;
}

export interface MovementSnack {
  id: string;
  at: number;
  zone: string;
  day: string;
  type: SnackType;
  reps?: number;
  seconds?: number;
  trigger: SnackTrigger;
}

export interface MindSession {
  id: string;
  startAt: number;
  endAt: number;
  zone: string;
  day: string;
  kind: MindKind;
  minutes: number;
}

export interface NudgePolicy {
  habitId: string;
  kind: NudgeKind;
  intervalMin?: number;
  /** Clock times as "HH:MM" for FIXED policies. */
  times?: string[];
  /** Minutes after midnight; falls back to the global active hours when omitted. */
  activeStartMin?: number;
  activeEndMin?: number;
  onlyWhenBehind: boolean;
  maxPerDay: number;
  enabled: boolean;
}

export interface PeriodSpan {
  start: string;
  end?: string;
}

export interface CycleSettings {
  avgCycleDays: number;
  periodDays: number;
  history: PeriodSpan[];
}

export type Units = 'ml' | 'oz';

export interface Settings {
  name: string;
  units: Units;
  waterGoalMl: number;
  /** Minutes after midnight. */
  activeStartMin: number;
  activeEndMin: number;
  dayBoundaryHour: number;
  nudgeIntervalMin: number;
  dailyNudgeCap: number;
  cycleEnabled: boolean;
  /** Ids of pinned summary cards in display order. */
  pinned: string[];
  sampleData: boolean;
  cycle: CycleSettings;
}

export const DEFAULT_SETTINGS: Settings = {
  name: '',
  units: 'ml',
  waterGoalMl: 2000,
  activeStartMin: 9 * 60,
  activeEndMin: 21 * 60,
  dayBoundaryHour: 3,
  nudgeIntervalMin: 60,
  dailyNudgeCap: 10,
  cycleEnabled: false,
  pinned: ['water', 'snacks', 'mind'],
  sampleData: false,
  cycle: { avgCycleDays: 28, periodDays: 5, history: [] },
};

export const SNACK_LABELS: Record<SnackType, { label: string; defaultReps?: number; defaultSeconds?: number; unit: string }> = {
  SQUATS: { label: 'Squats', defaultReps: 10, unit: 'reps' },
  CALF_RAISES: { label: 'Calf raises', defaultSeconds: 120, unit: 'sec' },
  WALK: { label: 'Walk', defaultSeconds: 300, unit: 'sec' },
  STRETCH: { label: 'Stretch', defaultSeconds: 120, unit: 'sec' },
  PUSH_UPS: { label: 'Push-ups', defaultReps: 10, unit: 'reps' },
  STAIRS: { label: 'Stair climbs', defaultReps: 3, unit: 'climbs' },
  VIGOROUS_MINUTE: { label: 'Vigorous minute', defaultSeconds: 60, unit: 'sec' },
};
