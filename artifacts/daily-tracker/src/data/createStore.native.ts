/**
 * Native (Android / iOS): row-level SQLite via expo-sqlite. Keep this file's
 * exports identical to `createStore.ts`.
 */
import * as SQLite from 'expo-sqlite';
import { SqliteStore } from './sql/sqliteStore';
import { StorageError, type TrackerStore } from './store';

export const DATABASE_NAME = 'dailytracker.db';

export async function createStore(): Promise<TrackerStore> {
  let db: SQLite.SQLiteDatabase;
  try {
    db = await SQLite.openDatabaseAsync(DATABASE_NAME);
    await db.execAsync('PRAGMA journal_mode = WAL');
  } catch (err) {
    throw new StorageError('Could not open the database.', err);
  }
  return SqliteStore.open(db);
}
