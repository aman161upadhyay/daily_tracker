/**
 * Native (Android / iOS): row-level SQLite via expo-sqlite. Keep this file's
 * exports identical to `createStore.ts`.
 *
 * One connection per JavaScript runtime, and every load / persist / replace
 * runs through a single queue: the UI provider, a notification button handled
 * in the background and a widget tap can all reach the database from the same
 * runtime, and two interleaved `withTransactionAsync` calls on one connection
 * fail ("cannot start a transaction within a transaction"). `busy_timeout`
 * covers the rarer case of a second process (a headless instance) holding
 * the write lock for a moment.
 */
import * as SQLite from 'expo-sqlite';
import { SqliteStore } from './sql/sqliteStore';
import { StorageError, type TrackerStore } from './store';

export const DATABASE_NAME = 'dailytracker.db';

let opening: Promise<SqliteStore> | null = null;
let queue: Promise<unknown> = Promise.resolve();

/** Run `job` after every previously queued job, whether those succeeded or failed. */
function serialized<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job, job);
  queue = run.catch(() => undefined);
  return run;
}

async function open(): Promise<SqliteStore> {
  let db: SQLite.SQLiteDatabase;
  try {
    db = await SQLite.openDatabaseAsync(DATABASE_NAME);
    await db.execAsync('PRAGMA journal_mode = WAL');
    await db.execAsync('PRAGMA busy_timeout = 5000');
  } catch (err) {
    throw new StorageError('Could not open the database.', err);
  }
  return SqliteStore.open(db);
}

export async function createStore(): Promise<TrackerStore> {
  if (!opening) {
    opening = open().catch((err) => {
      opening = null; // let the next caller retry instead of caching the failure
      throw err;
    });
  }
  const store = await opening;
  return {
    load: () => serialized(() => store.load()),
    persist: (prev, next) => serialized(() => store.persist(prev, next)),
    replace: (state) => serialized(() => store.replace(state)),
  };
}
