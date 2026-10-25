/**
 * Deterministic sample data so the design can be judged with realistic
 * history on first launch. "Start fresh" (Today chip or Settings) clears it.
 */
import { DEFAULT_SETTINGS, type Habit, type HabitEntry, type HabitRule, type MindSession, type MovementSnack, type NudgePolicy, type WaterEntry } from '@/src/domain/models';
import { addDays, minutesOfDay, wallClock, weekdayOf } from '@/src/domain/time/trackingDay';
import { PRESET_BY_ID, type Preset } from '@/src/library/presets';
import type { TrackerState } from './types';

const HISTORY_DAYS = 140;

/** mulberry32 — small, fast, deterministic. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

interface Profile {
  presetId: string;
  /** Adherence at the start and end of the 140-day history. */
  from: number;
  to: number;
  /** Today's progress as a fraction of the target (applied if the time of day allows). */
  todayFraction: number;
}

const PROFILES: Profile[] = [
  { presetId: 'water', from: 0.55, to: 0.85, todayFraction: 0.8 },
  { presetId: 'meditate', from: 0.9, to: 0.98, todayFraction: 1 },
  { presetId: 'pushup-snack', from: 0.7, to: 0.82, todayFraction: 0.67 },
  { presetId: 'squat-snack', from: 0.15, to: 0.62, todayFraction: 0.5 },
  { presetId: 'breathing', from: 0.5, to: 0.58, todayFraction: 0 },
  { presetId: 'walk-break', from: 0.3, to: 0.38, todayFraction: 0.25 },
  { presetId: 'wind-down', from: 0.35, to: 0.42, todayFraction: 0 },
  { presetId: 'calf-raises', from: 0.05, to: 0.12, todayFraction: 0 },
  { presetId: 'strength-session', from: 0.8, to: 0.85, todayFraction: 0 },
];

export function habitFromPreset(preset: Preset, id: string, createdDay: string): { habit: Habit; rule: HabitRule; policy: NudgePolicy } {
  const habit: Habit = {
    id,
    name: preset.name,
    category: preset.category,
    type: preset.type,
    unit: preset.unit,
    icon: preset.icon,
    presetId: preset.id,
    snackType: preset.snackType,
    mindKind: preset.mindKind,
    createdDay,
    archived: false,
    pinned: false,
  };
  const rule: HabitRule = {
    habitId: id,
    effectiveFrom: createdDay,
    cadence: preset.rule.cadence,
    timesPerPeriod: preset.rule.timesPerPeriod,
    target: preset.rule.target,
    freezesPerMonth: 2,
  };
  const policy: NudgePolicy = {
    habitId: id,
    kind: preset.policy.kind,
    intervalMin: preset.policy.intervalMin,
    times: preset.policy.times,
    onlyWhenBehind: preset.policy.onlyWhenBehind ?? false,
    maxPerDay: preset.policy.maxPerDay ?? 1,
    enabled: preset.policy.kind !== 'NONE',
  };
  return { habit, rule, policy };
}

export function buildSampleState(today: string, zone: string, nowMs: number): TrackerState {
  const rand = prng(20261025);
  const nowMin = minutesOfDay(nowMs, zone);

  // Map a (day, minute) pair to an epoch instant using today's UTC offset.
  const w = wallClock(nowMs, zone);
  const localAsUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  const offsetMs = localAsUtc - Math.floor(nowMs / 1000) * 1000;
  const at = (day: string, minute: number): number => {
    const [y, m, d] = day.split('-').map(Number);
    return Date.UTC(y!, m! - 1, d!, 0, minute) - offsetMs;
  };

  const createdDay = addDays(today, -(HISTORY_DAYS - 1));
  const habits: Habit[] = [];
  const rules: HabitRule[] = [];
  const policies: NudgePolicy[] = [];
  const entries: HabitEntry[] = [];
  const water: WaterEntry[] = [];
  const snacks: MovementSnack[] = [];
  const mind: MindSession[] = [];

  let seq = 0;
  const nextId = (prefix: string) => `${prefix}_${(seq++).toString(36)}`;

  const settings = { ...DEFAULT_SETTINGS, name: 'Aman', sampleData: true, cycleEnabled: true, onboardingDone: true };
  const goalMl = settings.waterGoalMl;

  for (const profile of PROFILES) {
    const preset = PRESET_BY_ID[profile.presetId]!;
    const { habit, rule, policy } = habitFromPreset(preset, `h_${preset.id}`, createdDay);
    habits.push(habit);
    rules.push(rule);
    policies.push(policy);

    for (let k = HISTORY_DAYS - 1; k >= 0; k--) {
      const day = addDays(today, -k);
      const isToday = k === 0;
      const f = (HISTORY_DAYS - 1 - k) / (HISTORY_DAYS - 1);
      const p = profile.from + (profile.to - profile.from) * f;

      if (preset.id === 'water') {
        let total: number;
        if (isToday) {
          const elapsed = clamp((nowMin - settings.activeStartMin) / (settings.activeEndMin - settings.activeStartMin), 0, 1);
          total = Math.round((goalMl * elapsed * profile.todayFraction) / 50) * 50;
        } else {
          total = Math.round((goalMl * clamp(p + (rand() - 0.5) * 0.5, 0, 1.15)) / 50) * 50;
        }
        let minute = 7 * 60 + Math.floor(rand() * 60);
        const lastMinute = isToday ? nowMin : 22 * 60;
        let remaining = total;
        while (remaining > 0 && minute <= lastMinute) {
          const ml = remaining >= 350 && rand() < 0.3 ? 350 : remaining >= 250 ? 250 : Math.min(remaining, 150);
          water.push({ id: nextId('w'), at: at(day, minute), zone, day, ml, source: rand() < 0.4 ? 'AUTO_WIDGET' : 'MANUAL' });
          remaining -= ml;
          minute += 60 + Math.floor(rand() * 90);
        }
        continue;
      }

      if (habit.snackType) {
        const target = rule.target;
        let n: number;
        if (isToday) {
          n = Math.round(target * profile.todayFraction);
        } else {
          n = Math.round(target * clamp(p + (rand() - 0.5) * 0.6, 0, 1.2));
        }
        let minute = settings.activeStartMin + 30 + Math.floor(rand() * 30);
        for (let i = 0; i < n; i++) {
          if (isToday && minute > nowMin - 10) break;
          snacks.push({
            id: nextId('s'),
            at: at(day, minute),
            zone,
            day,
            type: habit.snackType,
            reps: preset.snackType === 'SQUATS' || preset.snackType === 'PUSH_UPS' ? 10 : undefined,
            seconds: preset.snackType === 'WALK' ? 300 : preset.snackType === 'CALF_RAISES' || preset.snackType === 'STRETCH' ? 120 : undefined,
            trigger: rand() < 0.6 ? 'NUDGE' : 'MANUAL',
          });
          minute += 75 + Math.floor(rand() * 60);
        }
        continue;
      }

      if (habit.mindKind) {
        const done = isToday ? profile.todayFraction >= 1 && nowMin > 8 * 60 : rand() < p;
        if (!done) continue;
        const minutes = habit.mindKind === 'MEDITATION' ? (rand() < 0.15 ? 20 : 13) : 5;
        const startMinute = habit.mindKind === 'MEDITATION' ? 7 * 60 + 20 + Math.floor(rand() * 30) : 15 * 60 + Math.floor(rand() * 30);
        mind.push({
          id: nextId('m'),
          startAt: at(day, startMinute),
          endAt: at(day, startMinute + minutes),
          zone,
          day,
          kind: habit.mindKind,
          minutes,
        });
        continue;
      }

      if (rule.cadence === 'WEEKLY') {
        const wd = weekdayOf(day);
        if (wd !== 1 && wd !== 3) continue;
        if (isToday || rand() >= p) continue;
        entries.push({ id: nextId('e'), habitId: habit.id, day, at: at(day, 18 * 60 + 30), zone, value: 1, source: 'MANUAL' });
        continue;
      }

      // YES_NO daily (wind-down)
      if (isToday) continue;
      if (rand() < p) {
        entries.push({ id: nextId('e'), habitId: habit.id, day, at: at(day, 22 * 60 + 40), zone, value: 1, source: 'MANUAL' });
      }
    }
  }

  // Cycle history: four cycles of 28–30 days, the last one started 19 days ago.
  const lastStart = addDays(today, -19);
  const history = [
    { start: addDays(lastStart, -87), end: addDays(lastStart, -83) },
    { start: addDays(lastStart, -58), end: addDays(lastStart, -54) },
    { start: addDays(lastStart, -29), end: addDays(lastStart, -25) },
    { start: lastStart, end: addDays(lastStart, 4) },
  ];

  return {
    version: 1,
    habits,
    rules,
    policies,
    entries,
    water,
    snacks,
    mind,
    nudgeEvents: [],
    events: [],
    settings: { ...settings, cycle: { avgCycleDays: 29, periodDays: 5, history } },
  };
}

/** A fresh start keeps the water habit (the app's core) and nothing else. */
export function buildEmptyState(today: string, keepSettings?: TrackerState['settings'], opts: { withWater?: boolean } = {}): TrackerState {
  const base = keepSettings ?? DEFAULT_SETTINGS;
  const state: TrackerState = {
    version: 1,
    habits: [],
    rules: [],
    policies: [],
    entries: [],
    water: [],
    snacks: [],
    mind: [],
    nudgeEvents: [],
    events: [],
    settings: { ...base, sampleData: false, cycle: { ...base.cycle, history: [] } },
  };
  if (opts.withWater ?? true) {
    const { habit, rule, policy } = habitFromPreset(PRESET_BY_ID.water!, 'h_water', today);
    state.habits.push(habit);
    state.rules.push(rule);
    state.policies.push(policy);
  }
  return state;
}
