/**
 * Notification service — Android / iOS. Wraps expo-notifications so the rest
 * of the app only deals with the planner's `ScheduledNudge` list.
 *
 * Design:
 * - every planned nudge is scheduled with its deterministic id as the OS
 *   identifier, so re-planning is a diff: cancel what disappeared, add what is new
 * - a small ledger of what we scheduled (a record in the state's database) tells
 *   us which nudges the OS delivered while the app was not running; the provider
 *   turns those into FIRED events for caps and "already fired" slots
 * - button presses carry the nudge payload, so the handler never needs the plan
 * - exact alarms: expo-notifications uses them when the user allowed it
 *   (Android 12+); Settings offers the system screen (`openExactAlarmSettings`)
 */
import * as BackgroundTask from 'expo-background-task';
import Constants from 'expo-constants';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { Linking, Platform } from 'react-native';
import type { MindKind, Units } from '@/src/domain/models';
import { formatVolume } from '@/src/domain/time/format';
import type { NudgeChannel, ScheduledNudge } from '@/src/domain/nudges/planner';
import { MIND_END_ID, mindEndPayload, type NudgePayload } from '@/src/state/commands';
import { canScheduleExactAlarms } from '@/modules/exact-alarms';
import { createStore } from '@/src/data/createStore';
import { parseResponse } from './notificationPayload';
import { deliveries, journalWith, journalWithout, parseBookkeeping, type Bookkeeping, type FiredRecord, type LedgerEntry } from './deliveryJournal';
import { EMPTY_RESPONSES, parseResponses, pending, wasHandled, withFailed, withHandled, withReceived, type Responses } from './responseInbox';

export type { FiredRecord } from './deliveryJournal';

export type PermissionState = 'granted' | 'denied' | 'undetermined' | 'unsupported';

export interface NudgeResponse {
  payload: NudgePayload;
  action: string;
  /** Unique per OS response, used to apply each press once. */
  key: string;
  /** When the press reached us: the instant it is applied with, first time and on a replay alike. */
  receivedAt: number;
}

export const NOTIFICATIONS_SUPPORTED = true;
export const BACKGROUND_REPLAN_TASK = 'dailytracker-replan';
export const NUDGE_RESPONSE_TASK = 'dailytracker-nudge-response';

const ANDROID = Platform.OS === 'android';

/**
 * expo-notifications decides exact vs inexact when a request is submitted and never revisits it,
 * so a request made before the person allowed "Alarms & reminders" stays inexact (and one made
 * before they revoked it is gone at the OS level while still listed as pending). Folding the
 * capability into the signature re-submits every future request on either transition.
 */
const signature = (n: ScheduledNudge, exact: boolean | null) => `${n.at}|${n.day}|${n.habitIds.join(',')}|${(n.mergedIds ?? []).join(',')}|${n.title}|${n.body}|${exact === null ? '?' : exact ? 'x' : 'i'}`;

const CHANNELS: Record<NudgeChannel, { name: string; description: string; importance: Notifications.AndroidImportance; lockscreenVisibility?: Notifications.AndroidNotificationVisibility }> = {
  nudges: { name: 'Movement & habit nudges', description: 'Snack-sized reminders during your active hours.', importance: Notifications.AndroidImportance.DEFAULT },
  water: { name: 'Water', description: 'Pace checks, only when you are behind.', importance: Notifications.AndroidImportance.DEFAULT },
  summary: { name: 'Weekly summary', description: 'One message a week about how it went.', importance: Notifications.AndroidImportance.LOW },
  // Private on the lock screen: the text shows only once the phone is unlocked.
  cycle: {
    name: 'Cycle',
    description: 'Prompts around the expected day and the reminders you set. Hidden on the lock screen.',
    importance: Notifications.AndroidImportance.DEFAULT,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
  },
  mind: { name: 'Timer', description: 'The bell at the end of a meditation or breathing session.', importance: Notifications.AndroidImportance.HIGH },
};

let prepared: string | null = null;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function toState(status: Notifications.PermissionStatus): PermissionState {
  if (status === Notifications.PermissionStatus.GRANTED) return 'granted';
  if (status === Notifications.PermissionStatus.DENIED) return 'denied';
  return 'undetermined';
}

export async function getPermission(): Promise<PermissionState> {
  const p = await Notifications.getPermissionsAsync();
  return toState(p.status);
}

export async function requestPermission(): Promise<PermissionState> {
  const p = await Notifications.requestPermissionsAsync();
  return toState(p.status);
}

export async function openNotificationSettings(): Promise<void> {
  await Linking.openSettings();
}

/**
 * Android 12+: whether reminders can fire at their exact minute. `null` where the phone cannot
 * tell us (Expo Go, a build without the local module); `true` on older Android.
 */
export function exactAlarmsAllowed(): boolean | null {
  if (!ANDROID) return true;
  if (Number(Platform.Version) < 31) return true;
  return canScheduleExactAlarms();
}

/**
 * Android 12+: this app's own "Alarms & reminders" screen. The intent needs the package as its
 * data, otherwise some phones show the list of every app (or nothing). Falls back to app settings.
 */
export async function openExactAlarmSettings(): Promise<void> {
  if (ANDROID && Number(Platform.Version) >= 31) {
    const pkg = Constants.expoConfig?.android?.package;
    try {
      await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.REQUEST_SCHEDULE_EXACT_ALARM, pkg ? { data: `package:${pkg}` } : undefined);
      return;
    } catch {
      // fall through
    }
  }
  await Linking.openSettings();
}

/** Channels and action categories; cheap to call again (re-registers only when the tap size changes). */
export async function prepare(tapMl: number, units: Units = 'ml'): Promise<void> {
  const signature = `${tapMl}|${units}`;
  if (prepared === signature) return;
  // The button says what it logs in the unit the app shows: "+8.5 oz" for a 250 ml tap in ounces.
  const tap = formatVolume(tapMl, units);
  const tapLabel = `+${tap.value} ${tap.unit}`;
  if (ANDROID) {
    await Promise.all(
      (Object.keys(CHANNELS) as NudgeChannel[]).map((id) =>
        Notifications.setNotificationChannelAsync(id, {
          name: CHANNELS[id].name,
          description: CHANNELS[id].description,
          importance: CHANNELS[id].importance,
          lightColor: '#1DB954',
          vibrationPattern: id === 'summary' ? undefined : [0, 120],
          ...(CHANNELS[id].lockscreenVisibility !== undefined ? { lockscreenVisibility: CHANNELS[id].lockscreenVisibility } : {}),
        }),
      ),
    );
  }
  const noOpen = { opensAppToForeground: false };
  await Promise.all([
    Notifications.setNotificationCategoryAsync('rotation', [
      { identifier: 'DONE', buttonTitle: 'Done', options: noOpen },
      { identifier: 'SNOOZE', buttonTitle: 'In 15 min', options: noOpen },
      { identifier: 'SWAP', buttonTitle: 'Swap', options: noOpen },
    ]),
    Notifications.setNotificationCategoryAsync('nudge', [
      { identifier: 'DONE', buttonTitle: 'Done', options: noOpen },
      { identifier: 'SNOOZE', buttonTitle: 'In 15 min', options: noOpen },
    ]),
    Notifications.setNotificationCategoryAsync('water', [
      { identifier: 'WATER', buttonTitle: tapLabel, options: noOpen },
      { identifier: 'SNOOZE', buttonTitle: 'In 15 min', options: noOpen },
    ]),
    Notifications.setNotificationCategoryAsync('water-move', [
      { identifier: 'DONE', buttonTitle: 'Done', options: noOpen },
      { identifier: 'WATER', buttonTitle: tapLabel, options: noOpen },
      { identifier: 'SNOOZE', buttonTitle: 'In 15 min', options: noOpen },
    ]),
    Notifications.setNotificationCategoryAsync('event', [
      { identifier: 'DONE', buttonTitle: 'Did it', options: noOpen },
      { identifier: 'SNOOZE', buttonTitle: 'In 15 min', options: noOpen },
    ]),
  ]);
  prepared = signature;
}

function categoryFor(n: ScheduledNudge): string | undefined {
  if (n.kind === 'SUMMARY' || n.kind === 'CYCLE') return undefined;
  if (n.kind === 'EVENT') return 'event';
  const hasWater = n.actions.includes('WATER');
  const hasDone = n.actions.includes('DONE');
  if (hasWater && hasDone) return 'water-move';
  if (hasWater) return 'water';
  if (n.actions.includes('SWAP')) return 'rotation';
  return 'nudge';
}

/**
 * The bookkeeping record (see deliveryJournal) lives beside the state, in its database: as
 * durable as the state, replaced together with it (an erase, a restored backup or the sample data
 * takes the old state's deliveries with it), and written compare-and-set — a write that finds the
 * record moved (another runtime's sync, or a replace) is refused rather than overwriting it.
 *
 * A read that fails is an error, not an empty record: treating it as empty would let the write
 * that follows forget the ledger (every pending alarm would then be cancelled as not ours, every
 * delivery lost) and the journal (the deliveries it still owes the state). The sync that cannot
 * read gives up and is retried later.
 */
const BOOKKEEPING_RECORD = 'nudges.bookkeeping';
const RESPONSES_RECORD = 'nudges.responses';

/** The record changed under this sync (a replace, or a sync on another runtime): it must start over, not overwrite. */
export class SupersededError extends Error {
  constructor() {
    super('The notification record changed while this sync ran.');
    this.name = 'SupersededError';
  }
}

interface ReadBookkeeping {
  bk: Bookkeeping;
  /** The record's version, for the compare-and-set write that follows (a replace moves it too). */
  raw: string;
}

async function readBookkeeping(): Promise<ReadBookkeeping> {
  const store = await createStore();
  const { value, version } = await store.readRecord(BOOKKEEPING_RECORD);
  return { bk: parseBookkeeping(value), raw: version };
}

/** Write the record if its version is still `expected`; returns the new version for the next write. */
async function writeBookkeeping(bk: Bookkeeping, expected: string): Promise<string> {
  const store = await createStore();
  const version = await store.writeRecord(BOOKKEEPING_RECORD, JSON.stringify(bk), expected);
  if (version === null) throw new SupersededError();
  return version;
}

/**
 * Whether the last reminder sync went through. A failure here (the OS list could not be read, a
 * request was refused, the record could not be written) stops the schedule from following the
 * plan while the app looks healthy otherwise; Settings → Reminders shows it and the scheduler
 * retries on its own.
 */
export interface SyncHealth {
  /** The last failure, or null while syncs succeed. */
  failure: { at: number; message: string } | null;
}

let health: SyncHealth = { failure: null };
const healthListeners = new Set<(h: SyncHealth) => void>();

function setHealth(next: SyncHealth): void {
  if (next.failure === health.failure) return;
  health = next;
  for (const l of healthListeners) {
    try {
      l(health);
    } catch (err) {
      console.warn('Sync health listener failed', err);
    }
  }
}

export function syncHealth(): SyncHealth {
  return health;
}

export function onSyncHealth(listener: (h: SyncHealth) => void): () => void {
  healthListeners.add(listener);
  return () => {
    healthListeners.delete(listener);
  };
}

/** Run a sync step, keeping the health up to date. A superseded sync is neither a failure nor a success. */
async function watched<T>(job: () => Promise<T>): Promise<T> {
  try {
    const out = await job();
    setHealth({ failure: null });
    return out;
  } catch (err) {
    if (!(err instanceof SupersededError)) setHealth({ failure: { at: Date.now(), message: err instanceof Error ? err.message : String(err) } });
    throw err;
  }
}

/**
 * The state holding these deliveries is saved: they need not be replayed. Serialized with the
 * syncs, which are the only other writers of the record.
 */
export function acknowledgeDeliveries(records: readonly FiredRecord[]): Promise<void> {
  if (records.length === 0) return Promise.resolve();
  return queued(async () => {
    const { bk, raw } = await readBookkeeping();
    if (bk.journal.length === 0) return;
    const journal = journalWithout(bk.journal, records);
    if (journal.length !== bk.journal.length) await writeBookkeeping({ ...bk, journal }, raw);
  });
}

/**
 * One schedule change at a time. Two syncs interleaving (a debounced re-plan and
 * the foreground re-sync, or a headless re-plan on the same runtime) would each
 * read the OS list, cancel and schedule against a stale picture, and the last
 * ledger write would describe neither. A sync that was superseded while it
 * waited is skipped: the newer one carries the newer plan.
 */
let syncQueue: Promise<unknown> = Promise.resolve();
let syncGeneration = 0;

function serialized<T>(job: () => Promise<T>, skipped: T): Promise<T> {
  const mine = ++syncGeneration;
  const run = async () => (mine === syncGeneration ? watched(job) : skipped);
  const out = syncQueue.then(run, run);
  syncQueue = out.catch(() => undefined);
  return out;
}

/** Same queue, never skipped: for work that must happen even when a newer sync is waiting behind it. */
function queued<T>(job: () => Promise<T>): Promise<T> {
  const run = () => watched(job);
  const out = syncQueue.then(run, run);
  syncQueue = out.catch(() => undefined);
  return out;
}

/**
 * What the OS delivered and the state has not been confirmed to hold yet: ledger entries that are
 * no longer pending, plus earlier reports still in the journal. Does not touch the schedule.
 * Callers fold these into the state before they derive the next plan: a plan built before the
 * deliveries are known still counts the delivered slots as free and overspends the daily cap.
 */
export function firedSinceLastSync(nowMs: number): Promise<FiredRecord[]> {
  return serialized(async () => {
    const { bk, raw } = await readBookkeeping();
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const { fired, live } = deliveries(bk, new Set(scheduled.map((r) => r.identifier)), nowMs);
    const journal = journalWith(bk.journal, fired, nowMs);
    // The deliveries are written down before anything can forget them; a dead sync's intents are
    // resolved into the ledger at the same time.
    if (fired.length > 0 || bk.cancelling.length > 0 || bk.scheduling.length > 0 || live.length !== bk.ledger.length || journal.length !== bk.journal.length) {
      await writeBookkeeping({ ledger: live, journal, cancelling: [], scheduling: [] }, raw);
    }
    return journal;
  }, []);
}

/**
 * Make the OS schedule match the plan. Returns what the OS delivered and is still owed to the
 * state (journaled before the ledger forgets it), so the caller can record FIRED events. A
 * superseded call returns nothing: the newer sync reports it.
 */
export function syncPlan(plan: ScheduledNudge[], nowMs: number): Promise<FiredRecord[]> {
  return serialized(() => syncPlanNow(plan, nowMs), []);
}

/** A plan entry as the ledger records it. */
function ledgerEntry(n: ScheduledNudge, exact: boolean | null): LedgerEntry {
  return { id: n.id, habitIds: n.habitIds, day: n.day, at: n.at, ...(n.mergedIds ? { mergedIds: n.mergedIds } : {}), sig: signature(n, exact) };
}

/**
 * Cancel each id; returns the ones the OS refused. A refused cancel leaves the alarm standing,
 * so its entry must stay in the ledger (a ring from it is then counted, and the next sync tries
 * again) — dropping it would make that ring unaccountable.
 */
async function cancelEach(ids: readonly string[]): Promise<Set<string>> {
  const failed = new Set<string>();
  for (const id of ids) {
    try {
      await Notifications.cancelScheduledNotificationAsync(id);
    } catch (err) {
      console.warn('Could not cancel', id, err);
      failed.add(id);
    }
  }
  return failed;
}

async function syncPlanNow(plan: ScheduledNudge[], nowMs: number): Promise<FiredRecord[]> {
  const { bk, raw } = await readBookkeeping();
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const pending = new Set(scheduled.map((r) => r.identifier));
  const { fired, overdueKept, live } = deliveries(bk, pending, nowMs);
  const owed = journalWith(bk.journal, fired, nowMs);
  const keep = new Set(overdueKept.map((e) => e.id));

  const wanted = new Map(plan.map((n) => [n.id, n]));
  const ours = new Set<string>();
  const ledgerSig = new Map(live.map((e) => [e.id, e.sig]));
  const exact = exactAlarmsAllowed();

  const cancelling: string[] = [];
  for (const req of scheduled) {
    const id = req.identifier;
    if (id === MIND_END_ID) continue;
    if (keep.has(id)) {
      ours.add(id);
      continue;
    }
    const want = wanted.get(id);
    if (!want || ledgerSig.get(id) !== signature(want, exact)) cancelling.push(id);
    else ours.add(id);
  }
  const scheduling = plan.filter((n) => !ours.has(n.id) && n.at > nowMs);

  // Before the OS changes: what rang must not be forgotten, and what is about to be cancelled or
  // scheduled must be readable by the next sync if this one dies half-way (see deliveryJournal).
  let stored = raw;
  if (fired.length > 0 || cancelling.length > 0 || scheduling.length > 0 || bk.cancelling.length > 0 || bk.scheduling.length > 0 || live.length !== bk.ledger.length || owed.length !== bk.journal.length) {
    stored = await writeBookkeeping({ ledger: live, journal: owed, cancelling, scheduling: scheduling.map((n) => ledgerEntry(n, exact)) }, raw);
  }

  const refused = await cancelEach(cancelling);

  // The ledger lists what is really pending: kept alarms plus what scheduling accepted. A request
  // the OS refused is not written down, so it is neither counted as fired nor marked delivered.
  const accepted = new Set<string>(ours);
  let unscheduled = 0;
  for (const n of scheduling) {
    const payload: NudgePayload = {
      nudgeId: n.id,
      kind: n.kind,
      habitIds: n.habitIds,
      day: n.day,
      ...(n.mergedIds ? { mergedIds: n.mergedIds } : {}),
      ...(n.snackType ? { snackType: n.snackType } : {}),
      ...(n.waterMl ? { waterMl: n.waterMl } : {}),
    };
    try {
      await Notifications.scheduleNotificationAsync({
        identifier: n.id,
        content: {
          title: n.title,
          body: n.body,
          data: { ...payload },
          categoryIdentifier: categoryFor(n),
          sound: n.kind === 'SUMMARY' ? undefined : 'default',
          ...(ANDROID ? { color: '#1DB954' } : {}),
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: n.at, channelId: n.channel },
      });
      accepted.add(n.id);
    } catch (err) {
      console.warn('Could not schedule', n.id, err);
      unscheduled += 1;
    }
  }

  // An alarm whose cancel was refused and that was not scheduled anew under its id is still the
  // OS's, and still ours to account for.
  const standing = live.filter((e) => refused.has(e.id) && !accepted.has(e.id) && !keep.has(e.id));
  const ledger: LedgerEntry[] = [...overdueKept, ...plan.filter((n) => n.at > nowMs && !keep.has(n.id) && accepted.has(n.id)).map((n) => ledgerEntry(n, exact)), ...standing];
  await writeBookkeeping({ ledger, journal: owed, cancelling: [], scheduling: [] }, stored);
  // The ledger is honest about what the OS refused; the sync itself is not a success. Thrown
  // after the write so the schedule is accounted for, and so the caller tries again (and the
  // reminder health shows it) instead of leaving the plan half-applied until the next change.
  if (unscheduled > 0 || refused.size > 0) throw new OsRefusedError(unscheduled, refused.size);
  return owed;
}

/** The OS turned some schedule or cancel requests down; the ledger already reflects what stands. */
export class OsRefusedError extends Error {
  constructor(
    readonly unscheduled: number,
    readonly uncancelled: number,
  ) {
    super(
      [unscheduled > 0 ? `${unscheduled} reminder${unscheduled === 1 ? '' : 's'} could not be scheduled` : '', uncancelled > 0 ? `${uncancelled} old reminder${uncancelled === 1 ? '' : 's'} could not be cancelled` : '']
        .filter(Boolean)
        .join('; ') + '. Will try again.',
    );
    this.name = 'OsRefusedError';
  }
}

/**
 * Take every reminder down (reminders switched off, the app locked). What already rang stays
 * owed to the state. The meditation bell is not a reminder: a session running while reminders
 * are switched off keeps its end. A replaced state needs no call here — its record goes with it
 * (TrackerStore.replace), and the next sync cancels the old alarms as not ours.
 */
export function cancelAll(): Promise<void> {
  // Never skipped for a newer sync: a "reminders off" that is skipped leaves the alarms standing.
  return queued(async () => {
    const { bk, raw } = await readBookkeeping();
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const nowMs = Date.now();
    const pending = new Set(scheduled.map((r) => r.identifier));
    const { fired, live } = deliveries(bk, pending, nowMs);
    const journal = journalWith(bk.journal, fired, nowMs);
    const ids = scheduled.map((r) => r.identifier).filter((id) => id !== MIND_END_ID);
    // Everything pending is about to be cancelled: written down first, so a death between the
    // cancel and the final write does not read the gone alarms as rung.
    const stored = await writeBookkeeping({ ledger: live, journal, cancelling: ids, scheduling: [] }, raw);
    const refused = await cancelEach(ids);
    await writeBookkeeping({ ledger: live.filter((e) => refused.has(e.id)), journal, cancelling: [], scheduling: [] }, stored);
    if (refused.size > 0) throw new OsRefusedError(0, refused.size);
  });
}

/** Foreground responses arrive mapped (`content.data`); the parser also accepts the raw bundle shape. */
function toResponse(r: Notifications.NotificationResponse): NudgeResponse | null {
  const parsed = parseResponse(r);
  return parsed ? { payload: parsed.payload, action: parsed.action, key: parsed.key, receivedAt: Date.now() } : null;
}

export function addResponseListener(onResponse: (r: NudgeResponse) => void): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener((r) => {
    const parsed = toResponse(r);
    if (parsed) onResponse(parsed);
  });
  return () => sub.remove();
}

/**
 * The response that launched the app (if any). Not cleared here: the caller clears it with
 * `clearLaunchResponse` once the press is in the inbox, so a death in between replays it rather
 * than losing it (the inbox dedupes a press that is read twice).
 */
export async function launchResponse(): Promise<NudgeResponse | null> {
  const last = await Notifications.getLastNotificationResponseAsync();
  return last ? toResponse(last) : null;
}

export async function clearLaunchResponse(): Promise<void> {
  await Notifications.clearLastNotificationResponseAsync().catch(() => {});
}

// The responses record is read-modify-write; one queue per runtime keeps two presses arriving
// together (a button press plus the launch response) from both claiming the same key. Another
// runtime's write is caught by the compare-and-set and retried from a fresh read.
let responsesQueue: Promise<unknown> = Promise.resolve();

function withResponses<T>(job: (r: Responses) => { next: Responses; out: T }): Promise<T> {
  const run = async () => {
    const store = await createStore();
    for (let attempt = 0; attempt < 3; attempt++) {
      const { value, version } = await store.readRecord(RESPONSES_RECORD);
      const { next, out } = job(parseResponses(value));
      const text = JSON.stringify(next);
      if (text === (value ?? JSON.stringify(EMPTY_RESPONSES)) || (await store.writeRecord(RESPONSES_RECORD, text, version)) !== null) return out;
    }
    throw new SupersededError();
  };
  const out = responsesQueue.then(run, run);
  responsesQueue = out.catch(() => undefined);
  return out;
}

const inFlight = new Set<string>();

/**
 * Start handling a press. False when the same press is being handled right now in this runtime
 * (headless task plus foreground listener) or was applied by an earlier process. The press is
 * written to the inbox first, so a crash before the state write lands replays it (see
 * responseInbox); the mark that ends the replay is written only after the state write committed.
 */
export async function beginHandling(r: NudgeResponse): Promise<boolean> {
  if (inFlight.has(r.key)) return false;
  inFlight.add(r.key);
  let fresh: boolean;
  try {
    fresh = await withResponses((rec) => {
      if (wasHandled(rec, r.key)) return { next: rec, out: false };
      return { next: withReceived(rec, { key: r.key, payload: r.payload, action: r.action, receivedAt: r.receivedAt }, r.receivedAt), out: true };
    });
  } catch (err) {
    // A claim that could not be written is released, or the press would stay blocked in this
    // runtime for good; the caller fails and the OS's own replay (if any) tries again.
    inFlight.delete(r.key);
    throw err;
  }
  if (!fresh) inFlight.delete(r.key);
  return fresh;
}

/** Finish handling: a committed write marks the press for good; a failure leaves it in the inbox, one try spent. */
export async function endHandling(key: string, committed: boolean): Promise<void> {
  try {
    const nowMs = Date.now();
    await withResponses((rec) => ({ next: committed ? withHandled(rec, key, nowMs) : withFailed(rec, key, nowMs), out: undefined }));
  } finally {
    inFlight.delete(key);
  }
}

/** Presses written down and not yet confirmed applied, oldest first (see responseInbox). */
export async function pendingResponses(): Promise<NudgeResponse[]> {
  const store = await createStore();
  const rec = parseResponses((await store.readRecord(RESPONSES_RECORD)).value);
  return pending(rec, Date.now())
    .filter((p) => !inFlight.has(p.key))
    .map((p) => ({ payload: p.payload, action: p.action, key: p.key, receivedAt: p.receivedAt }));
}

export async function scheduleMindEnd(endAtMs: number, minutes: number, kind: MindKind): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(MIND_END_ID).catch(() => {});
  const payload = mindEndPayload(endAtMs, minutes, kind);
  await Notifications.scheduleNotificationAsync({
    identifier: MIND_END_ID,
    content: { title: 'Session complete', body: `${minutes} minutes of ${kind === 'BREATHING' ? 'breathing' : 'meditation'}. Tap if it was not logged.`, sound: 'default', data: { ...payload } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: endAtMs, channelId: 'mind' },
  });
}

export async function cancelMindEnd(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(MIND_END_ID).catch(() => {});
}

/** Every ~3 h the OS lets us re-plan so tomorrow's nudges exist even if the app stays closed. */
export async function registerBackgroundReplan(): Promise<'registered' | 'unavailable'> {
  try {
    const status = await BackgroundTask.getStatusAsync();
    if (status !== BackgroundTask.BackgroundTaskStatus.Available) return 'unavailable';
    if (!TaskManager.isTaskDefined(BACKGROUND_REPLAN_TASK)) return 'unavailable';
    await BackgroundTask.registerTaskAsync(BACKGROUND_REPLAN_TASK, { minimumInterval: 180 });
    return 'registered';
  } catch (err) {
    // Expo Go has no background tasks; a dev build does.
    console.log('Background re-plan unavailable:', err instanceof Error ? err.message : String(err));
    return 'unavailable';
  }
}
