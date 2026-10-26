/**
 * Versioned schema. Every change to a table is a NEW entry appended here;
 * never edit a shipped migration. The current version lives in
 * `PRAGMA user_version`.
 *
 * Hand-written SQL rather than an ORM so that headless writers (notification
 * actions, the widget) can share the schema without pulling in a runtime.
 */
import type { SqlDriver } from './driver';

export const MIGRATIONS: readonly string[] = [
  // v1 — initial schema
  `
  CREATE TABLE IF NOT EXISTS habit (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    type TEXT NOT NULL,
    unit TEXT NOT NULL,
    icon TEXT NOT NULL,
    preset_id TEXT,
    snack_type TEXT,
    mind_kind TEXT,
    created_day TEXT NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0,
    pinned INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS habit_rule (
    habit_id TEXT NOT NULL,
    effective_from TEXT NOT NULL,
    cadence TEXT NOT NULL,
    times_per_period INTEGER NOT NULL,
    target REAL NOT NULL,
    freezes_per_month INTEGER NOT NULL,
    PRIMARY KEY (habit_id, effective_from)
  );
  CREATE TABLE IF NOT EXISTS nudge_policy (
    habit_id TEXT PRIMARY KEY NOT NULL,
    kind TEXT NOT NULL,
    interval_min INTEGER,
    times_json TEXT,
    active_start_min INTEGER,
    active_end_min INTEGER,
    only_when_behind INTEGER NOT NULL DEFAULT 0,
    max_per_day INTEGER NOT NULL DEFAULT 1,
    enabled INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS habit_entry (
    id TEXT PRIMARY KEY NOT NULL,
    habit_id TEXT NOT NULL,
    day TEXT NOT NULL,
    at INTEGER NOT NULL,
    zone TEXT NOT NULL,
    value REAL NOT NULL,
    source TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS habit_entry_habit_day ON habit_entry (habit_id, day);
  CREATE TABLE IF NOT EXISTS water_entry (
    id TEXT PRIMARY KEY NOT NULL,
    at INTEGER NOT NULL,
    zone TEXT NOT NULL,
    day TEXT NOT NULL,
    ml INTEGER NOT NULL,
    source TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS water_entry_day ON water_entry (day);
  CREATE TABLE IF NOT EXISTS movement_snack (
    id TEXT PRIMARY KEY NOT NULL,
    at INTEGER NOT NULL,
    zone TEXT NOT NULL,
    day TEXT NOT NULL,
    type TEXT NOT NULL,
    reps INTEGER,
    seconds INTEGER,
    trigger TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS movement_snack_day ON movement_snack (day);
  CREATE TABLE IF NOT EXISTS mind_session (
    id TEXT PRIMARY KEY NOT NULL,
    start_at INTEGER NOT NULL,
    end_at INTEGER NOT NULL,
    zone TEXT NOT NULL,
    day TEXT NOT NULL,
    kind TEXT NOT NULL,
    minutes INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS mind_session_day ON mind_session (day);
  CREATE TABLE IF NOT EXISTS kv (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );
  `,
  // v2 — nudge engine: what happened to each nudge, and one-off in-app events
  `
  CREATE TABLE IF NOT EXISTS nudge_event (
    id TEXT PRIMARY KEY NOT NULL,
    nudge_id TEXT NOT NULL,
    habit_ids_json TEXT NOT NULL,
    at INTEGER NOT NULL,
    zone TEXT NOT NULL,
    day TEXT NOT NULL,
    kind TEXT NOT NULL,
    until_ms INTEGER
  );
  CREATE INDEX IF NOT EXISTS nudge_event_day ON nudge_event (day);
  CREATE TABLE IF NOT EXISTS scheduled_event (
    id TEXT PRIMARY KEY NOT NULL,
    habit_id TEXT NOT NULL,
    at INTEGER NOT NULL,
    zone TEXT NOT NULL,
    day TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL
  );
  `,
  // v3 — Health Connect mirrors, and the record id on imported drinks
  `
  ALTER TABLE water_entry ADD COLUMN external_id TEXT;
  CREATE TABLE IF NOT EXISTS step_day (
    day TEXT PRIMARY KEY NOT NULL,
    steps INTEGER NOT NULL,
    origin TEXT
  );
  CREATE TABLE IF NOT EXISTS sleep_night (
    id TEXT PRIMARY KEY NOT NULL,
    start_at INTEGER NOT NULL,
    end_at INTEGER NOT NULL,
    day TEXT NOT NULL,
    minutes INTEGER NOT NULL,
    deep_min INTEGER,
    rem_min INTEGER,
    light_min INTEGER,
    awake_min INTEGER,
    origin TEXT
  );
  CREATE INDEX IF NOT EXISTS sleep_night_day ON sleep_night (day);
  CREATE TABLE IF NOT EXISTS heart_day (
    day TEXT PRIMARY KEY NOT NULL,
    resting_bpm INTEGER,
    min_bpm INTEGER,
    avg_bpm INTEGER,
    max_bpm INTEGER
  );
  CREATE TABLE IF NOT EXISTS weight_entry (
    id TEXT PRIMARY KEY NOT NULL,
    at INTEGER NOT NULL,
    day TEXT NOT NULL,
    kg REAL NOT NULL,
    origin TEXT
  );
  CREATE TABLE IF NOT EXISTS workout (
    id TEXT PRIMARY KEY NOT NULL,
    start_at INTEGER NOT NULL,
    end_at INTEGER NOT NULL,
    day TEXT NOT NULL,
    type INTEGER NOT NULL,
    title TEXT,
    minutes INTEGER NOT NULL,
    origin TEXT,
    hidden INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS workout_day ON workout (day);
  `,
  // v4 — the cycle day sheet (flow, mood, symptoms, note per calendar day)
  `
  CREATE TABLE IF NOT EXISTS cycle_day (
    day TEXT PRIMARY KEY NOT NULL,
    flow INTEGER,
    mood INTEGER,
    symptoms_json TEXT NOT NULL,
    note TEXT
  );
  `,
  // v5 — a nudge that rang inside a merged notification remembers which one
  `
  ALTER TABLE nudge_event ADD COLUMN via TEXT;
  `,
  // v6 — set-time reminders can ring on chosen weekdays only
  `
  ALTER TABLE nudge_policy ADD COLUMN weekdays_json TEXT;
  `,
];

export const SCHEMA_VERSION = MIGRATIONS.length;

export async function migrate(db: SqlDriver): Promise<{ from: number; to: number }> {
  const rows = await db.getAllAsync<{ user_version: number }>('PRAGMA user_version', []);
  const from = rows[0]?.user_version ?? 0;
  if (from > SCHEMA_VERSION) {
    throw new Error(`Database is from a newer version of the app (schema ${from}, this build knows ${SCHEMA_VERSION}).`);
  }
  for (let v = from; v < SCHEMA_VERSION; v++) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(MIGRATIONS[v]!);
      await db.execAsync(`PRAGMA user_version = ${v + 1}`);
    });
  }
  return { from, to: SCHEMA_VERSION };
}
