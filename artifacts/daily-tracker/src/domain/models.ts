/**
 * Domain models. Pure TypeScript — no React Native imports here.
 *
 * Every timestamped row stores `at` (UTC ms), `zone` (IANA time zone at write
 * time) and `day` (the tracking day, computed once at write time). Entities
 * double as the export format: add fields with defaults, never rename or
 * remove them.
 */

export type Category = 'hydration' | 'movement' | 'mind' | 'cycle' | 'body' | 'fuel' | 'craft';

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
  | 'book'
  | 'pen'
  | 'code'
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
  /** Health Connect record id for imported drinks, so a re-read never adds them twice. */
  externalId?: string;
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

/**
 * What happened to a scheduled nudge; kept for 7 days to drive caps, snoozes and "already fired"
 * slots. WATER marks the drink half of a merged water + movement nudge as logged (the snooze that
 * follows it keeps the movement half open), so a replayed press never logs the drink twice.
 */
export type NudgeEventKind = 'FIRED' | 'DONE' | 'SNOOZED' | 'SWAPPED' | 'DISMISSED' | 'WATER';

export interface NudgeEvent {
  id: string;
  /** Deterministic planner id of the nudge this event belongs to. */
  nudgeId: string;
  habitIds: string[];
  at: number;
  zone: string;
  day: string;
  kind: NudgeEventKind;
  /** For SNOOZED: when the nudge should fire instead. */
  untilMs?: number;
}

/** A one-off nudge created by an in-app event (e.g. the Sugar Shield post-meal walk). */
export interface ScheduledEvent {
  id: string;
  habitId: string;
  at: number;
  zone: string;
  day: string;
  title: string;
  body: string;
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
  /** Calendar day the period started (unique per span). */
  start: string;
  end?: string;
  /** Left out of the prediction averages (an odd cycle the user excluded). */
  excluded?: boolean;
}

export type CycleReminderAnchor = 'BEFORE_PERIOD' | 'PHASE_START';
export type CyclePhaseKey = 'period' | 'fertile' | 'luteal';

/** A cycle-relative reminder ("Vitamin C, 5 days before the period"). */
export interface CycleReminder {
  id: string;
  label: string;
  anchor: CycleReminderAnchor;
  /** BEFORE_PERIOD: days before the expected start; PHASE_START: days after the phase begins. */
  offsetDays: number;
  phase?: CyclePhaseKey;
  /** Minutes after midnight (calendar day). */
  minute: number;
  enabled: boolean;
}

export interface CycleSettings {
  avgCycleDays: number;
  periodDays: number;
  /** Days from ovulation to the next period (10–16). */
  lutealDays: number;
  /** Hides the fertile window and ovulation (display only). */
  birthControl: boolean;
  /** Cycle notifications say only "You have a reminder", in the shade as well as on the lock screen. */
  discreet: boolean;
  reminders: CycleReminder[];
  history: PeriodSpan[];
}

export type Severity = 1 | 2 | 3;
export type Mood = 1 | 2 | 3 | 4 | 5;
export type Flow = 1 | 2 | 3;

/** What one calendar day felt like: flow, mood, symptoms with severity, a note. */
export interface CycleDayLog {
  day: string;
  flow?: Flow;
  mood?: Mood;
  symptoms: Record<string, Severity>;
  note?: string;
}

export const DEFAULT_CYCLE_REMINDERS: CycleReminder[] = [
  { id: 'vitamin-c', label: 'Vitamin C', anchor: 'BEFORE_PERIOD', offsetDays: 5, minute: 9 * 60, enabled: true },
];

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
  /** Set once the welcome flow finished (or sample data was chosen). */
  onboardingDone: boolean;
  /** Millilitres added by one tap of the water "+" button / widget. */
  tapSizeMl: number;
  /** Master switch for scheduled notifications (the OS permission is separate). */
  remindersEnabled: boolean;
  /** Off mode (travel, sick day): no nudges until this epoch ms. */
  offUntil?: number;
  /** "Your week" summary notification; weekday 0 = Monday … 6 = Sunday, minute after midnight. */
  weeklySummary: { enabled: boolean; weekday: number; minute: number };
  /** Habits the home-screen widget shows, in order (first = big tile). Empty = pick automatically. */
  widgetHabitIds: string[];
  /** The user connected Health Connect; reads happen on every foreground (and in the background when granted). */
  healthConnectEnabled: boolean;
  /** Colour theme; 'system' follows the phone. Dark is the designed default. */
  theme: ThemePreference;
  /** Biometric / screen-lock gate on open and after `appLock.afterMin` minutes in the background. */
  appLock: AppLockSettings;
  /**
   * Let Android's own backup keep a copy of the data (encrypted with the phone's
   * screen lock, Android 9+) in the user's Google account, so a new phone restores
   * it. Off = nothing ever leaves the phone unless the user exports a file.
   */
  cloudBackup: boolean;
}

export type ThemePreference = 'dark' | 'light' | 'system';

export interface AppLockSettings {
  enabled: boolean;
  /** Minutes in the background before the lock engages again; 0 = immediately. */
  afterMin: number;
}

export const APP_LOCK_DELAYS = [0, 1, 5, 15] as const;

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
  // Discreet by default: a cycle reminder on a lock screen names nothing until the person turns that on.
  cycle: { avgCycleDays: 28, periodDays: 5, lutealDays: 14, birthControl: false, discreet: true, reminders: DEFAULT_CYCLE_REMINDERS, history: [] },
  onboardingDone: false,
  tapSizeMl: 250,
  remindersEnabled: true,
  weeklySummary: { enabled: true, weekday: 6, minute: 18 * 60 },
  widgetHabitIds: [],
  healthConnectEnabled: false,
  theme: 'dark',
  appLock: { enabled: false, afterMin: 1 },
  cloudBackup: true,
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
