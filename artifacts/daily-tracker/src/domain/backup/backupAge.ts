/**
 * The backup check-in: when a file was last exported, said plainly under the Export button. The app
 * only knows when it handed a file to the share sheet — where that file went, and whether it is
 * still there, is the other app's business — so the line never claims a copy is safe anywhere.
 */
import type { TrackerState } from '../../state/types';
import { formatDayShort } from '../time/format';
import { calendarDayOf, dayDiff } from '../time/trackingDay';

/** After this many days the line asks for a fresh export. */
export const BACKUP_STALE_DAYS = 30;

export interface BackupAge {
  text: string;
  /** No export yet, or the last one is BACKUP_STALE_DAYS or more old. */
  stale: boolean;
}

/**
 * The state as the export file should carry it: stamped with this export's own moment, so a restore
 * of someone's first backup does not say "No backup exported yet" and a restore of a later one does
 * not carry the export before it. The live settings take the same stamp only once the file was
 * handed over.
 */
export function withExportStamp(state: TrackerState, at: number): TrackerState {
  return { ...state, settings: { ...state.settings, lastExportAt: at } };
}

export function backupAge(lastExportAt: number | undefined, nowMs: number, zone: string): BackupAge {
  if (lastExportAt === undefined) return { text: 'No backup exported yet.', stale: true };
  const days = Math.max(0, dayDiff(calendarDayOf(lastExportAt, zone), calendarDayOf(nowMs, zone)));
  const when = days === 0 ? 'today' : days === 1 ? 'yesterday' : `${formatDayShort(calendarDayOf(lastExportAt, zone))}, ${days} days ago`;
  if (days >= BACKUP_STALE_DAYS) return { text: `Last exported ${when}. Export again to keep a recent copy.`, stale: true };
  return { text: `Last exported ${when}.`, stale: false };
}
