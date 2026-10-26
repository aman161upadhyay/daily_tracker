/**
 * Row-level SQLite store. Each collection in TrackerState maps to a table;
 * `persist` writes only the rows that changed between two states (items are
 * immutable, so identity tells us what changed).
 */
import { normalizeBody } from '@/src/domain/body/merge';
import type { BodySync, HeartDay, SleepNight, StepDay, WeightEntry, Workout } from '@/src/domain/body/types';
import type { Habit, HabitEntry, HabitRule, MindSession, MovementSnack, NudgeEvent, NudgePolicy, ScheduledEvent } from '@/src/domain/models';
import type { WaterEntry } from '@/src/domain/models';
import type { TrackerState } from '@/src/state/types';
import { diffById, normalizeSettings, StorageError, type TrackerStore } from '../store';
import type { SqlDriver, SqlValue } from './driver';
import { migrate } from './schema';

const KV_SETTINGS = 'settings';
const KV_SNOOZE = 'nudgeSnoozedUntil';
const KV_SWAP = 'nudgeSwap';
const KV_BODY_SYNC = 'bodySync';

type Row = Record<string, SqlValue>;

interface Table<T> {
  name: string;
  columns: string[];
  keyColumns: string[];
  key: (item: T) => string;
  toRow: (item: T) => SqlValue[];
  fromRow: (row: Row) => T;
  orderBy: string;
}

const bool = (b: boolean): number => (b ? 1 : 0);
const opt = <T extends string | number>(v: T | undefined): T | null => (v === undefined ? null : v);
const str = (row: Row, col: string): string => String(row[col]);
const num = (row: Row, col: string): number => Number(row[col]);
const optStr = (row: Row, col: string): string | undefined => (row[col] == null ? undefined : String(row[col]));
const optNum = (row: Row, col: string): number | undefined => (row[col] == null ? undefined : Number(row[col]));

/** Build an object without `undefined` keys so round-trips compare equal. */
function compact<T extends object>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out as T;
}

const HABIT: Table<Habit> = {
  name: 'habit',
  columns: ['id', 'name', 'category', 'type', 'unit', 'icon', 'preset_id', 'snack_type', 'mind_kind', 'created_day', 'archived', 'pinned'],
  keyColumns: ['id'],
  key: (h) => h.id,
  toRow: (h) => [h.id, h.name, h.category, h.type, h.unit, h.icon, opt(h.presetId), opt(h.snackType), opt(h.mindKind), h.createdDay, bool(h.archived), bool(h.pinned)],
  fromRow: (r) =>
    compact<Habit>({
      id: str(r, 'id'),
      name: str(r, 'name'),
      category: str(r, 'category') as Habit['category'],
      type: str(r, 'type') as Habit['type'],
      unit: str(r, 'unit'),
      icon: str(r, 'icon') as Habit['icon'],
      presetId: optStr(r, 'preset_id'),
      snackType: optStr(r, 'snack_type') as Habit['snackType'],
      mindKind: optStr(r, 'mind_kind') as Habit['mindKind'],
      createdDay: str(r, 'created_day'),
      archived: num(r, 'archived') === 1,
      pinned: num(r, 'pinned') === 1,
    }),
  orderBy: 'rowid',
};

const RULE: Table<HabitRule> = {
  name: 'habit_rule',
  columns: ['habit_id', 'effective_from', 'cadence', 'times_per_period', 'target', 'freezes_per_month'],
  keyColumns: ['habit_id', 'effective_from'],
  key: (r) => `${r.habitId}\u0000${r.effectiveFrom}`,
  toRow: (r) => [r.habitId, r.effectiveFrom, r.cadence, r.timesPerPeriod, r.target, r.freezesPerMonth],
  fromRow: (r) => ({
    habitId: str(r, 'habit_id'),
    effectiveFrom: str(r, 'effective_from'),
    cadence: str(r, 'cadence') as HabitRule['cadence'],
    timesPerPeriod: num(r, 'times_per_period'),
    target: num(r, 'target'),
    freezesPerMonth: num(r, 'freezes_per_month'),
  }),
  orderBy: 'rowid',
};

const POLICY: Table<NudgePolicy> = {
  name: 'nudge_policy',
  columns: ['habit_id', 'kind', 'interval_min', 'times_json', 'active_start_min', 'active_end_min', 'only_when_behind', 'max_per_day', 'enabled'],
  keyColumns: ['habit_id'],
  key: (p) => p.habitId,
  toRow: (p) => [p.habitId, p.kind, opt(p.intervalMin), p.times ? JSON.stringify(p.times) : null, opt(p.activeStartMin), opt(p.activeEndMin), bool(p.onlyWhenBehind), p.maxPerDay, bool(p.enabled)],
  fromRow: (r) =>
    compact<NudgePolicy>({
      habitId: str(r, 'habit_id'),
      kind: str(r, 'kind') as NudgePolicy['kind'],
      intervalMin: optNum(r, 'interval_min'),
      times: r.times_json == null ? undefined : (JSON.parse(String(r.times_json)) as string[]),
      activeStartMin: optNum(r, 'active_start_min'),
      activeEndMin: optNum(r, 'active_end_min'),
      onlyWhenBehind: num(r, 'only_when_behind') === 1,
      maxPerDay: num(r, 'max_per_day'),
      enabled: num(r, 'enabled') === 1,
    }),
  orderBy: 'rowid',
};

const ENTRY: Table<HabitEntry> = {
  name: 'habit_entry',
  columns: ['id', 'habit_id', 'day', 'at', 'zone', 'value', 'source'],
  keyColumns: ['id'],
  key: (e) => e.id,
  toRow: (e) => [e.id, e.habitId, e.day, e.at, e.zone, e.value, e.source],
  fromRow: (r) => ({
    id: str(r, 'id'),
    habitId: str(r, 'habit_id'),
    day: str(r, 'day'),
    at: num(r, 'at'),
    zone: str(r, 'zone'),
    value: num(r, 'value'),
    source: str(r, 'source') as HabitEntry['source'],
  }),
  orderBy: 'at, rowid',
};

const WATER: Table<WaterEntry> = {
  name: 'water_entry',
  columns: ['id', 'at', 'zone', 'day', 'ml', 'source', 'external_id'],
  keyColumns: ['id'],
  key: (w) => w.id,
  toRow: (w) => [w.id, w.at, w.zone, w.day, w.ml, w.source, opt(w.externalId)],
  fromRow: (r) =>
    compact<WaterEntry>({
      id: str(r, 'id'),
      at: num(r, 'at'),
      zone: str(r, 'zone'),
      day: str(r, 'day'),
      ml: num(r, 'ml'),
      source: str(r, 'source') as WaterEntry['source'],
      externalId: optStr(r, 'external_id'),
    }),
  orderBy: 'at, rowid',
};

const SNACK: Table<MovementSnack> = {
  name: 'movement_snack',
  columns: ['id', 'at', 'zone', 'day', 'type', 'reps', 'seconds', 'trigger'],
  keyColumns: ['id'],
  key: (s) => s.id,
  toRow: (s) => [s.id, s.at, s.zone, s.day, s.type, opt(s.reps), opt(s.seconds), s.trigger],
  fromRow: (r) =>
    compact<MovementSnack>({
      id: str(r, 'id'),
      at: num(r, 'at'),
      zone: str(r, 'zone'),
      day: str(r, 'day'),
      type: str(r, 'type') as MovementSnack['type'],
      reps: optNum(r, 'reps'),
      seconds: optNum(r, 'seconds'),
      trigger: str(r, 'trigger') as MovementSnack['trigger'],
    }),
  orderBy: 'at, rowid',
};

const MIND: Table<MindSession> = {
  name: 'mind_session',
  columns: ['id', 'start_at', 'end_at', 'zone', 'day', 'kind', 'minutes'],
  keyColumns: ['id'],
  key: (m) => m.id,
  toRow: (m) => [m.id, m.startAt, m.endAt, m.zone, m.day, m.kind, m.minutes],
  fromRow: (r) => ({
    id: str(r, 'id'),
    startAt: num(r, 'start_at'),
    endAt: num(r, 'end_at'),
    zone: str(r, 'zone'),
    day: str(r, 'day'),
    kind: str(r, 'kind') as MindSession['kind'],
    minutes: num(r, 'minutes'),
  }),
  orderBy: 'start_at, rowid',
};

const NUDGE_EVENT: Table<NudgeEvent> = {
  name: 'nudge_event',
  columns: ['id', 'nudge_id', 'habit_ids_json', 'at', 'zone', 'day', 'kind', 'until_ms'],
  keyColumns: ['id'],
  key: (e) => e.id,
  toRow: (e) => [e.id, e.nudgeId, JSON.stringify(e.habitIds), e.at, e.zone, e.day, e.kind, opt(e.untilMs)],
  fromRow: (r) =>
    compact<NudgeEvent>({
      id: str(r, 'id'),
      nudgeId: str(r, 'nudge_id'),
      habitIds: JSON.parse(str(r, 'habit_ids_json')) as string[],
      at: num(r, 'at'),
      zone: str(r, 'zone'),
      day: str(r, 'day'),
      kind: str(r, 'kind') as NudgeEvent['kind'],
      untilMs: optNum(r, 'until_ms'),
    }),
  orderBy: 'at, rowid',
};

const EVENT: Table<ScheduledEvent> = {
  name: 'scheduled_event',
  columns: ['id', 'habit_id', 'at', 'zone', 'day', 'title', 'body'],
  keyColumns: ['id'],
  key: (e) => e.id,
  toRow: (e) => [e.id, e.habitId, e.at, e.zone, e.day, e.title, e.body],
  fromRow: (r) => ({
    id: str(r, 'id'),
    habitId: str(r, 'habit_id'),
    at: num(r, 'at'),
    zone: str(r, 'zone'),
    day: str(r, 'day'),
    title: str(r, 'title'),
    body: str(r, 'body'),
  }),
  orderBy: 'at, rowid',
};

const STEP_DAY: Table<StepDay> = {
  name: 'step_day',
  columns: ['day', 'steps', 'origin'],
  keyColumns: ['day'],
  key: (s) => s.day,
  toRow: (s) => [s.day, s.steps, opt(s.origin)],
  fromRow: (r) => compact<StepDay>({ day: str(r, 'day'), steps: num(r, 'steps'), origin: optStr(r, 'origin') }),
  orderBy: 'day',
};

const SLEEP_NIGHT: Table<SleepNight> = {
  name: 'sleep_night',
  columns: ['id', 'start_at', 'end_at', 'day', 'minutes', 'deep_min', 'rem_min', 'light_min', 'awake_min', 'origin'],
  keyColumns: ['id'],
  key: (s) => s.id,
  toRow: (s) => [s.id, s.startAt, s.endAt, s.day, s.minutes, opt(s.deepMin), opt(s.remMin), opt(s.lightMin), opt(s.awakeMin), opt(s.origin)],
  fromRow: (r) =>
    compact<SleepNight>({
      id: str(r, 'id'),
      startAt: num(r, 'start_at'),
      endAt: num(r, 'end_at'),
      day: str(r, 'day'),
      minutes: num(r, 'minutes'),
      deepMin: optNum(r, 'deep_min'),
      remMin: optNum(r, 'rem_min'),
      lightMin: optNum(r, 'light_min'),
      awakeMin: optNum(r, 'awake_min'),
      origin: optStr(r, 'origin'),
    }),
  orderBy: 'start_at, rowid',
};

const HEART_DAY: Table<HeartDay> = {
  name: 'heart_day',
  columns: ['day', 'resting_bpm', 'min_bpm', 'avg_bpm', 'max_bpm'],
  keyColumns: ['day'],
  key: (h) => h.day,
  toRow: (h) => [h.day, opt(h.restingBpm), opt(h.minBpm), opt(h.avgBpm), opt(h.maxBpm)],
  fromRow: (r) =>
    compact<HeartDay>({ day: str(r, 'day'), restingBpm: optNum(r, 'resting_bpm'), minBpm: optNum(r, 'min_bpm'), avgBpm: optNum(r, 'avg_bpm'), maxBpm: optNum(r, 'max_bpm') }),
  orderBy: 'day',
};

const WEIGHT: Table<WeightEntry> = {
  name: 'weight_entry',
  columns: ['id', 'at', 'day', 'kg', 'origin'],
  keyColumns: ['id'],
  key: (w) => w.id,
  toRow: (w) => [w.id, w.at, w.day, w.kg, opt(w.origin)],
  fromRow: (r) => compact<WeightEntry>({ id: str(r, 'id'), at: num(r, 'at'), day: str(r, 'day'), kg: num(r, 'kg'), origin: optStr(r, 'origin') }),
  orderBy: 'at, rowid',
};

const WORKOUT: Table<Workout> = {
  name: 'workout',
  columns: ['id', 'start_at', 'end_at', 'day', 'type', 'title', 'minutes', 'origin', 'hidden'],
  keyColumns: ['id'],
  key: (w) => w.id,
  toRow: (w) => [w.id, w.startAt, w.endAt, w.day, w.type, opt(w.title), w.minutes, opt(w.origin), bool(w.hidden)],
  fromRow: (r) =>
    compact<Workout>({
      id: str(r, 'id'),
      startAt: num(r, 'start_at'),
      endAt: num(r, 'end_at'),
      day: str(r, 'day'),
      type: num(r, 'type'),
      title: optStr(r, 'title'),
      minutes: num(r, 'minutes'),
      origin: optStr(r, 'origin'),
      hidden: num(r, 'hidden') === 1,
    }),
  orderBy: 'start_at, rowid',
};

const ALL_TABLES = [HABIT, RULE, POLICY, ENTRY, WATER, SNACK, MIND, NUDGE_EVENT, EVENT, STEP_DAY, SLEEP_NIGHT, HEART_DAY, WEIGHT, WORKOUT] as const;

function upsertSql<T>(t: Table<T>): string {
  const placeholders = t.columns.map(() => '?').join(', ');
  const updates = t.columns.filter((c) => !t.keyColumns.includes(c)).map((c) => `${c} = excluded.${c}`);
  const conflict = updates.length > 0 ? `DO UPDATE SET ${updates.join(', ')}` : 'DO NOTHING';
  return `INSERT INTO ${t.name} (${t.columns.join(', ')}) VALUES (${placeholders}) ON CONFLICT (${t.keyColumns.join(', ')}) ${conflict}`;
}

function deleteSql<T>(t: Table<T>): string {
  return `DELETE FROM ${t.name} WHERE ${t.keyColumns.map((c) => `${c} = ?`).join(' AND ')}`;
}

function keyParams(key: string): SqlValue[] {
  return key.split('\u0000');
}

export class SqliteStore implements TrackerStore {
  private constructor(private readonly db: SqlDriver) {}

  static async open(db: SqlDriver): Promise<SqliteStore> {
    try {
      await migrate(db);
    } catch (err) {
      throw new StorageError('Could not prepare the database.', err);
    }
    return new SqliteStore(db);
  }

  async load(): Promise<TrackerState | null> {
    const kv = await this.readKv();
    const settingsJson = kv.get(KV_SETTINGS);
    if (settingsJson === undefined) return null;
    const [habits, rules, policies, entries, water, snacks, mind, nudgeEvents, events, steps, sleep, heart, weight, workouts] = await Promise.all([
      this.readAll(HABIT),
      this.readAll(RULE),
      this.readAll(POLICY),
      this.readAll(ENTRY),
      this.readAll(WATER),
      this.readAll(SNACK),
      this.readAll(MIND),
      this.readAll(NUDGE_EVENT),
      this.readAll(EVENT),
      this.readAll(STEP_DAY),
      this.readAll(SLEEP_NIGHT),
      this.readAll(HEART_DAY),
      this.readAll(WEIGHT),
      this.readAll(WORKOUT),
    ]);
    const snooze = kv.get(KV_SNOOZE);
    const swap = kv.get(KV_SWAP);
    const bodySyncJson = kv.get(KV_BODY_SYNC);
    const sync: BodySync | undefined = bodySyncJson === undefined ? undefined : (JSON.parse(bodySyncJson) as BodySync);
    return compact<TrackerState>({
      version: 1,
      habits,
      rules,
      policies,
      entries,
      water,
      snacks,
      mind,
      nudgeEvents,
      events,
      settings: normalizeSettings(JSON.parse(settingsJson)),
      body: normalizeBody({ steps, sleep, heart, weight, workouts, sync }),
      nudgeSnoozedUntil: snooze === undefined ? undefined : Number(snooze),
      nudgeSwap: swap === undefined ? undefined : (JSON.parse(swap) as TrackerState['nudgeSwap']),
    });
  }

  async persist(prev: TrackerState, next: TrackerState): Promise<void> {
    if (prev === next) return;
    await this.db.withTransactionAsync(async () => {
      await this.sync(HABIT, prev.habits, next.habits);
      await this.sync(RULE, prev.rules, next.rules);
      await this.sync(POLICY, prev.policies, next.policies);
      await this.sync(ENTRY, prev.entries, next.entries);
      await this.sync(WATER, prev.water, next.water);
      await this.sync(SNACK, prev.snacks, next.snacks);
      await this.sync(MIND, prev.mind, next.mind);
      await this.sync(NUDGE_EVENT, prev.nudgeEvents, next.nudgeEvents);
      await this.sync(EVENT, prev.events, next.events);
      await this.sync(STEP_DAY, prev.body.steps, next.body.steps);
      await this.sync(SLEEP_NIGHT, prev.body.sleep, next.body.sleep);
      await this.sync(HEART_DAY, prev.body.heart, next.body.heart);
      await this.sync(WEIGHT, prev.body.weight, next.body.weight);
      await this.sync(WORKOUT, prev.body.workouts, next.body.workouts);
      if (prev.body.sync !== next.body.sync) await this.writeKv(KV_BODY_SYNC, JSON.stringify(next.body.sync));
      if (prev.settings !== next.settings) await this.writeKv(KV_SETTINGS, JSON.stringify(next.settings));
      if (prev.nudgeSnoozedUntil !== next.nudgeSnoozedUntil) await this.writeKv(KV_SNOOZE, next.nudgeSnoozedUntil === undefined ? null : String(next.nudgeSnoozedUntil));
      if (prev.nudgeSwap !== next.nudgeSwap) await this.writeKv(KV_SWAP, next.nudgeSwap === undefined ? null : JSON.stringify(next.nudgeSwap));
    });
  }

  async replace(state: TrackerState): Promise<void> {
    await this.db.withTransactionAsync(async () => {
      for (const t of ALL_TABLES) await this.db.execAsync(`DELETE FROM ${t.name}`);
      await this.db.execAsync('DELETE FROM kv');
      await this.insertAll(HABIT, state.habits);
      await this.insertAll(RULE, state.rules);
      await this.insertAll(POLICY, state.policies);
      await this.insertAll(ENTRY, state.entries);
      await this.insertAll(WATER, state.water);
      await this.insertAll(SNACK, state.snacks);
      await this.insertAll(MIND, state.mind);
      await this.insertAll(NUDGE_EVENT, state.nudgeEvents);
      await this.insertAll(EVENT, state.events);
      await this.insertAll(STEP_DAY, state.body.steps);
      await this.insertAll(SLEEP_NIGHT, state.body.sleep);
      await this.insertAll(HEART_DAY, state.body.heart);
      await this.insertAll(WEIGHT, state.body.weight);
      await this.insertAll(WORKOUT, state.body.workouts);
      await this.writeKv(KV_BODY_SYNC, JSON.stringify(state.body.sync));
      await this.writeKv(KV_SETTINGS, JSON.stringify(state.settings));
      await this.writeKv(KV_SNOOZE, state.nudgeSnoozedUntil === undefined ? null : String(state.nudgeSnoozedUntil));
      await this.writeKv(KV_SWAP, state.nudgeSwap === undefined ? null : JSON.stringify(state.nudgeSwap));
    });
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private async readAll<T>(t: Table<T>): Promise<T[]> {
    const rows = await this.db.getAllAsync<Row>(`SELECT ${t.columns.join(', ')} FROM ${t.name} ORDER BY ${t.orderBy}`, []);
    return rows.map(t.fromRow);
  }

  private async readKv(): Promise<Map<string, string>> {
    const rows = await this.db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM kv', []);
    return new Map(rows.map((r) => [r.key, r.value]));
  }

  private async writeKv(key: string, value: string | null): Promise<void> {
    if (value === null) await this.db.runAsync('DELETE FROM kv WHERE key = ?', [key]);
    else await this.db.runAsync('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', [key, value]);
  }

  private async insertAll<T>(t: Table<T>, items: readonly T[]): Promise<void> {
    const sql = upsertSql(t);
    for (const item of items) await this.db.runAsync(sql, t.toRow(item));
  }

  private async sync<T>(t: Table<T>, prev: readonly T[], next: readonly T[]): Promise<void> {
    const { upsert, remove } = diffById(prev, next, t.key);
    if (remove.length > 0) {
      const sql = deleteSql(t);
      for (const key of remove) await this.db.runAsync(sql, keyParams(key));
    }
    if (upsert.length > 0) {
      const sql = upsertSql(t);
      for (const item of upsert) await this.db.runAsync(sql, t.toRow(item));
    }
  }
}
