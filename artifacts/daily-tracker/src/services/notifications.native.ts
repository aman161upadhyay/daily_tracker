/**
 * Notification service — Android / iOS. Wraps expo-notifications so the rest
 * of the app only deals with the planner's `ScheduledNudge` list.
 *
 * Design:
 * - every planned nudge is scheduled with its deterministic id as the OS
 *   identifier, so re-planning is a diff: cancel what disappeared, add what is new
 * - a small ledger of what we scheduled (AsyncStorage) tells us which nudges the
 *   OS delivered while the app was not running; the provider turns those into
 *   FIRED events for caps and "already fired" slots
 * - button presses carry the nudge payload, so the handler never needs the plan
 * - exact alarms: expo-notifications uses them when the user allowed it
 *   (Android 12+); Settings offers the system screen (`openExactAlarmSettings`)
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
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
import { parseResponse } from './notificationPayload';
import { EMPTY_BOOKKEEPING, deliveries, journalWith, journalWithout, parseBookkeeping, parseRecords, type Bookkeeping, type FiredRecord, type LedgerEntry } from './deliveryJournal';

export type { FiredRecord } from './deliveryJournal';

export type PermissionState = 'granted' | 'denied' | 'undetermined' | 'unsupported';

export interface NudgeResponse {
  payload: NudgePayload;
  action: string;
  key: string;
}

export const NOTIFICATIONS_SUPPORTED = true;
export const BACKGROUND_REPLAN_TASK = 'dailytracker-replan';
export const NUDGE_RESPONSE_TASK = 'dailytracker-nudge-response';

const BOOKKEEPING_KEY = 'dailytracker.nudges.bookkeeping.v1';
/** Earlier layouts (two keys); read once and folded into the bookkeeping record. */
const LEDGER_KEY = 'dailytracker.nudges.ledger.v1';
const JOURNAL_KEY = 'dailytracker.nudges.delivered.v1';
const HANDLED_KEY = 'dailytracker.nudges.handled.v1';
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
 * The bookkeeping record (see deliveryJournal). A storage read that fails is an error, not an
 * empty record: treating it as empty would let the write that follows forget the ledger (every
 * pending alarm would then be cancelled as not ours, every delivery lost) and the journal (the
 * deliveries it still owes the state). The sync that cannot read gives up and is retried later.
 */
async function readBookkeeping(): Promise<Bookkeeping> {
  const raw = await AsyncStorage.getItem(BOOKKEEPING_KEY);
  if (raw !== null) return parseBookkeeping(raw);
  // First read after an upgrade from the two-key layout: fold it in and drop the old keys.
  const [ledger, journal] = await AsyncStorage.multiGet([LEDGER_KEY, JOURNAL_KEY]);
  const legacy: Bookkeeping = { ...EMPTY_BOOKKEEPING, ledger: parseRecords<LedgerEntry>(ledger?.[1] ?? null), journal: parseRecords<FiredRecord>(journal?.[1] ?? null) };
  if (legacy.ledger.length > 0 || legacy.journal.length > 0) {
    await writeBookkeeping(legacy);
    await AsyncStorage.multiRemove([LEDGER_KEY, JOURNAL_KEY]).catch(() => {});
  }
  return legacy;
}

function writeBookkeeping(bk: Bookkeeping): Promise<void> {
  return AsyncStorage.setItem(BOOKKEEPING_KEY, JSON.stringify(bk));
}

/**
 * The state holding these deliveries is saved: they need not be replayed. Serialized with the
 * syncs, which are the only other writers of the record.
 */
export function acknowledgeDeliveries(records: readonly FiredRecord[]): Promise<void> {
  if (records.length === 0) return Promise.resolve();
  return queued(async () => {
    const bk = await readBookkeeping();
    if (bk.journal.length === 0) return;
    const journal = journalWithout(bk.journal, records);
    if (journal.length !== bk.journal.length) await writeBookkeeping({ ...bk, journal });
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
  const run = async () => (mine === syncGeneration ? job() : skipped);
  const out = syncQueue.then(run, run);
  syncQueue = out.catch(() => undefined);
  return out;
}

/** Same queue, never skipped: for work that must happen even when a newer sync is waiting behind it. */
function queued<T>(job: () => Promise<T>): Promise<T> {
  const out = syncQueue.then(job, job);
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
    const bk = await readBookkeeping();
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const { fired, live } = deliveries(bk, new Set(scheduled.map((r) => r.identifier)), nowMs);
    const journal = journalWith(bk.journal, fired, nowMs);
    // The deliveries are written down before anything can forget them; a dead sync's intents are
    // resolved into the ledger at the same time.
    if (fired.length > 0 || bk.cancelling.length > 0 || bk.scheduling.length > 0 || live.length !== bk.ledger.length || journal.length !== bk.journal.length) {
      await writeBookkeeping({ ledger: live, journal, cancelling: [], scheduling: [] });
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

async function syncPlanNow(plan: ScheduledNudge[], nowMs: number): Promise<FiredRecord[]> {
  const bk = await readBookkeeping();
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
  if (fired.length > 0 || cancelling.length > 0 || scheduling.length > 0 || bk.cancelling.length > 0 || bk.scheduling.length > 0) {
    await writeBookkeeping({ ledger: live, journal: owed, cancelling, scheduling: scheduling.map((n) => ledgerEntry(n, exact)) });
  }

  for (const id of cancelling) await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});

  // The ledger lists what is really pending: kept alarms plus what scheduling accepted. A request
  // the OS refused is not written down, so it is neither counted as fired nor marked delivered.
  const accepted = new Set<string>(ours);
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
    }
  }

  const ledger: LedgerEntry[] = [...overdueKept, ...plan.filter((n) => n.at > nowMs && !keep.has(n.id) && accepted.has(n.id)).map((n) => ledgerEntry(n, exact))];
  await writeBookkeeping({ ledger, journal: owed, cancelling: [], scheduling: [] });
  return owed;
}

/**
 * Take every alarm down. By default what already rang stays owed to the state (reminders switched
 * off, the app locked); `forget` also drops that — for a state that is being replaced (erase, a
 * restored backup, the sample data), whose deliveries would otherwise be folded into the new one.
 */
export function cancelAll(options: { forget?: boolean } = {}): Promise<void> {
  // Never skipped for a newer sync: that sync would otherwise plan from a state whose record this
  // call was meant to clear, and a "reminders off" that is skipped leaves the alarms standing.
  return queued(async () => {
    if (options.forget) {
      // The record goes first: alarms still pending after a death in between are not in any
      // ledger, so the next sync cancels them as not ours.
      await writeBookkeeping({ ...EMPTY_BOOKKEEPING });
      await Notifications.cancelAllScheduledNotificationsAsync();
      return;
    }
    const bk = await readBookkeeping();
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const nowMs = Date.now();
    const pending = new Set(scheduled.map((r) => r.identifier));
    const { fired, live } = deliveries(bk, pending, nowMs);
    const journal = journalWith(bk.journal, fired, nowMs);
    // Everything pending is about to be cancelled: written down first, so a death between the
    // cancel and the final write does not read the gone alarms as rung.
    await writeBookkeeping({ ledger: live, journal, cancelling: live.map((e) => e.id), scheduling: [] });
    await Notifications.cancelAllScheduledNotificationsAsync();
    await writeBookkeeping({ ledger: [], journal, cancelling: [], scheduling: [] });
  });
}

/** Foreground responses arrive mapped (`content.data`); the parser also accepts the raw bundle shape. */
function toResponse(r: Notifications.NotificationResponse): NudgeResponse | null {
  const parsed = parseResponse(r);
  return parsed ? { payload: parsed.payload, action: parsed.action, key: parsed.key } : null;
}

export function addResponseListener(onResponse: (r: NudgeResponse) => void): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener((r) => {
    const parsed = toResponse(r);
    if (parsed) onResponse(parsed);
  });
  return () => sub.remove();
}

/** The response that launched the app (if any); cleared so it is not replayed. */
export async function consumeLaunchResponse(): Promise<NudgeResponse | null> {
  const last = await Notifications.getLastNotificationResponseAsync();
  if (!last) return null;
  await Notifications.clearLastNotificationResponseAsync().catch(() => {});
  return toResponse(last);
}

// The handled-key ledger is read-modify-write; one queue per runtime keeps two
// responses arriving together (a button press plus the launch response) from
// both claiming the same key.
let handledQueue: Promise<unknown> = Promise.resolve();

function withHandledLedger<T>(job: (keys: string[]) => Promise<T> | T): Promise<T> {
  // `handledQueue` never rejects (see below), so a plain `then` serializes correctly.
  const run = handledQueue.then(async () => {
    const raw = await AsyncStorage.getItem(HANDLED_KEY);
    let keys: string[] = [];
    try {
      keys = raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      keys = [];
    }
    if (!Array.isArray(keys)) keys = [];
    const before = JSON.stringify(keys);
    const out = await job(keys);
    const after = JSON.stringify(keys.slice(-50));
    if (after !== before) await AsyncStorage.setItem(HANDLED_KEY, after);
    return out;
  });
  handledQueue = run.catch(() => undefined);
  return run;
}

const inFlight = new Set<string>();

/**
 * Start handling a response. False when the same press is being handled right
 * now in this runtime (headless task plus foreground listener) or was handled
 * by an earlier process. The durable mark is written only after the state
 * write committed (`endHandling`), so a crash in between replays the press
 * instead of losing it; the ledger of nudge events, written in the same
 * transaction as the log, makes that replay a no-op.
 */
export async function beginHandling(key: string): Promise<boolean> {
  if (inFlight.has(key)) return false;
  inFlight.add(key);
  let seen: boolean;
  try {
    seen = await withHandledLedger((keys) => keys.includes(key));
  } catch (err) {
    // A claim that could not be checked is released, or the press would stay blocked in this
    // runtime for good; the caller fails and the press is replayed.
    inFlight.delete(key);
    throw err;
  }
  if (seen) inFlight.delete(key);
  return !seen;
}

/** Finish handling: a committed write marks the key for good; a failure just releases it. */
export async function endHandling(key: string, committed: boolean): Promise<void> {
  try {
    if (committed) {
      await withHandledLedger((keys) => {
        if (!keys.includes(key)) keys.push(key);
      });
    }
  } finally {
    inFlight.delete(key);
  }
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
