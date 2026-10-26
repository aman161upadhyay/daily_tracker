/**
 * One Health Connect sync = read a window of days, fold it into the state.
 * Used by the app (on foreground, "Sync now", right after connecting) and by
 * the 3-hourly background task when background reads were granted.
 *
 * Window rule: the first sync reads 30 days; later syncs re-read from the day
 * before the last sync (data arrives late: a watch syncs hours after the
 * night, Samsung Health rewrites yesterday's step total) up to today, capped
 * at 14 days.
 */
import { autoTickActions } from '@/src/state/bodyCommands';
import type { CommandContext } from '@/src/state/commands';
import type { Action } from '@/src/state/reducer';
import type { TrackerState } from '@/src/state/types';
import { addDays, calendarDayOf } from '@/src/domain/time/trackingDay';
import { currentAccess, readBatch } from './healthConnect';

export const FIRST_SYNC_DAYS = 30;
export const MAX_RESYNC_DAYS = 14;

export function syncWindow(state: TrackerState, ctx: CommandContext): { fromDay: string; toDay: string } {
  const toDay = calendarDayOf(ctx.nowMs, ctx.zone);
  const last = state.body.sync.lastSyncAt;
  if (last === undefined) return { fromDay: addDays(toDay, -(FIRST_SYNC_DAYS - 1)), toDay };
  const lastDay = calendarDayOf(last, ctx.zone);
  const wanted = addDays(lastDay < toDay ? lastDay : toDay, -1);
  const floor = addDays(toDay, -(MAX_RESYNC_DAYS - 1));
  return { fromDay: wanted < floor ? floor : wanted, toDay };
}

export interface SyncResult {
  /** Actions for the state as it was when the read finished (convenience for the database path). */
  actions: Action[];
  /**
   * The same actions decided against a given state: callers that apply through the running app
   * build them from the newest state, so the auto-ticks and the sync record never trail a log
   * made while the read was in flight.
   */
  build: (state: TrackerState) => Action[];
  /** Human-readable problem, also stored on the state as `body.sync.lastError`. */
  error?: string;
  imported: number;
}

/**
 * Read and turn the result into actions (not applied here, so the app and the
 * headless path can each apply them their own way). Throws only when Health
 * Connect itself is unreachable; per-type failures come back as `error`.
 */
/** One read at a time, whoever asks (the screen, the foreground sync, the background task). */
let inflight: Promise<unknown> = Promise.resolve();

/**
 * Reads are serialised across every caller: the background task and the screen can both ask
 * while the app is alive, and two overlapping reads would let the older one land last — writing
 * yesterday's step total over today's and moving the watermark backwards.
 */
export function performBodySync(source: TrackerState | (() => TrackerState), ctx: CommandContext): Promise<SyncResult> {
  const job = () => readAndBuild(source, ctx);
  const run = inflight.then(job, job);
  inflight = run.catch(() => undefined);
  return run;
}

async function readAndBuild(source: TrackerState | (() => TrackerState), ctx: CommandContext): Promise<SyncResult> {
  const access = await currentAccess();
  if (access.granted.length === 0) {
    const error = 'Health Connect access was removed. Connect again to keep importing.';
    const actions: Action[] = [{ type: 'BODY_SYNC', patch: { granted: [], background: false, lastError: error } }];
    return { actions, build: () => actions, error, imported: 0 };
  }
  const before = typeof source === 'function' ? source() : source;
  const window = syncWindow(before, ctx);
  const { batch, errors } = await readBatch({ ...window, zone: ctx.zone, boundaryHour: before.settings.dayBoundaryHour }, access.granted);
  // A complete read may also remove what Health Connect no longer has (see BodyBatch.window).
  if (errors.length === 0) batch.window = window;
  const imported = (batch.steps?.length ?? 0) + (batch.sleep?.length ?? 0) + (batch.heart?.length ?? 0) + (batch.weight?.length ?? 0) + (batch.workouts?.length ?? 0) + (batch.hydration?.length ?? 0);
  const error = errors.length > 0 ? `Could not read ${errors.map((e) => e.type).join(', ')}: ${errors[0]!.message}` : undefined;
  const build = (state: TrackerState): Action[] => [
    { type: 'IMPORT_BODY', batch },
    ...autoTickActions(state, batch, ctx),
    {
      type: 'BODY_SYNC',
      patch: {
        granted: access.granted,
        background: access.background,
        lastError: error,
        // A partly failed read keeps the old watermark so the missed days are read again next time;
        // a watermark never moves backwards.
        ...(error ? {} : { lastSyncAt: Math.max(ctx.nowMs, state.body.sync.lastSyncAt ?? 0) }),
      },
    },
  ];
  // The read takes a while; decide the auto-ticks against the state as it is now, not as it was.
  return { actions: build(typeof source === 'function' ? source() : source), build, error, imported };
}

export function describeSyncError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.length > 160 ? `${msg.slice(0, 157)}…` : msg;
}
