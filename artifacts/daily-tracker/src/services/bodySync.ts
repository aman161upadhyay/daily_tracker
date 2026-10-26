/**
 * One Health Connect sync = read a window of days, fold it into the state.
 * Used by the app (on foreground, "Sync now", right after connecting) and by
 * the 3-hourly background task when background reads were granted.
 *
 * Window rule: the first sync reads 30 days; later syncs re-read a rolling
 * week — from the day before the last sync, but never less than the last
 * seven days (data arrives late: a watch syncs hours after the night, a
 * workout logged two days after the fact, Samsung Health rewrites yesterday's
 * step total) — up to today, capped at 14 days. A record type granted later
 * than the others gets its own 30-day first read.
 */
import { autoTickActions } from '@/src/state/bodyCommands';
import type { CommandContext } from '@/src/state/commands';
import type { Action } from '@/src/state/reducer';
import type { TrackerState } from '@/src/state/types';
import type { BodyRecordType } from '@/src/domain/body/types';
import { addDays, calendarDayOf } from '@/src/domain/time/trackingDay';
import { currentAccess, readBatch } from './healthConnect';

export const FIRST_SYNC_DAYS = 30;
export const MAX_RESYNC_DAYS = 14;
/** Every sync re-reads at least this many days: late records land where they belong. */
export const ROLLING_DAYS = 7;

/** Granted types that never had their first, 30-day read (or lost it when access was taken away). */
export function pendingBackfill(state: TrackerState, granted: readonly BodyRecordType[]): BodyRecordType[] {
  const done = new Set(state.body.sync.backfilled ?? (state.body.sync.lastSyncAt === undefined ? [] : state.body.sync.granted));
  return granted.filter((g) => !done.has(g));
}

export function syncWindow(state: TrackerState, ctx: CommandContext, granted: readonly BodyRecordType[] = state.body.sync.granted): { fromDay: string; toDay: string } {
  const toDay = calendarDayOf(ctx.nowMs, ctx.zone);
  const last = state.body.sync.lastSyncAt;
  if (last === undefined || pendingBackfill(state, granted).length > 0) return { fromDay: addDays(toDay, -(FIRST_SYNC_DAYS - 1)), toDay };
  const lastDay = calendarDayOf(last, ctx.zone);
  const sinceLast = addDays(lastDay < toDay ? lastDay : toDay, -1);
  const rolling = addDays(toDay, -(ROLLING_DAYS - 1));
  const wanted = sinceLast < rolling ? sinceLast : rolling;
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
  const window = syncWindow(before, ctx, access.granted);
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
        // a watermark never moves backwards. A complete read covered exactly the granted types with
        // the window they needed, so those — and only those — have had their history read: a type
        // taken away leaves the list, and gets its 30 days again if it is granted back later.
        ...(error ? {} : { lastSyncAt: Math.max(ctx.nowMs, state.body.sync.lastSyncAt ?? 0), backfilled: [...access.granted] }),
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
