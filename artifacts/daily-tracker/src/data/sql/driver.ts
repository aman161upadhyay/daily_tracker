/**
 * The slice of expo-sqlite's async API the store needs. `expo-sqlite`'s
 * `SQLiteDatabase` satisfies it structurally; tests use `node:sqlite`.
 */
export type SqlValue = string | number | null;

export interface SqlDriver {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params: SqlValue[]): Promise<unknown>;
  getAllAsync<T>(sql: string, params: SqlValue[]): Promise<T[]>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}
