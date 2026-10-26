/**
 * The backup check-in: when a file was last exported, said plainly under the Export button. The app
 * only knows when it handed a file to the share sheet — where that file went, and whether it is
 * still there, is the other app's business — so the line never claims a copy is safe anywhere.
 */
import { formatDayShort } from '../time/format';
import { calendarDayOf, dayDiff } from '../time/trackingDay';

/** After this many days the line asks for a fresh export. */
export const BACKUP_STALE_DAYS = 30;

export interface BackupAge {
  text: string;
  /** No export yet, or the last one is BACKUP_STALE_DAYS or more old. */
  stale: boolean;
}

export function backupAge(lastExportAt: number | undefined, nowMs: number, zone: string): BackupAge {
  if (lastExportAt === undefined) return { text: 'No backup exported yet.', stale: true };
  const days = Math.max(0, dayDiff(calendarDayOf(lastExportAt, zone), calendarDayOf(nowMs, zone)));
  const when = days === 0 ? 'today' : days === 1 ? 'yesterday' : `${formatDayShort(calendarDayOf(lastExportAt, zone))}, ${days} days ago`;
  if (days >= BACKUP_STALE_DAYS) return { text: `Last exported ${when}. Export again to keep a recent copy.`, stale: true };
  return { text: `Last exported ${when}.`, stale: false };
}
