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
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { Linking, Platform } from 'react-native';
import type { MindKind } from '@/src/domain/models';
import type { NudgeChannel, ScheduledNudge } from '@/src/domain/nudges/planner';
import type { NudgePayload } from '@/src/state/commands';
import { parseResponse } from './notificationPayload';

export type PermissionState = 'granted' | 'denied' | 'undetermined' | 'unsupported';

export interface FiredRecord {
  id: string;
  habitIds: string[];
  day: string;
  at: number;
}

export interface NudgeResponse {
  payload: NudgePayload;
  action: string;
  key: string;
}

export const NOTIFICATIONS_SUPPORTED = true;
export const BACKGROUND_REPLAN_TASK = 'dailytracker-replan';
export const NUDGE_RESPONSE_TASK = 'dailytracker-nudge-response';

const LEDGER_KEY = 'dailytracker.nudges.ledger.v1';
const HANDLED_KEY = 'dailytracker.nudges.handled.v1';
const MIND_END_ID = 'mind-end';
const ANDROID = Platform.OS === 'android';

/** What we last handed to the OS; `sig` changes when the time or the text changes. */
type LedgerEntry = FiredRecord & { sig: string };

const signature = (n: ScheduledNudge) => `${n.at}|${n.habitIds.join(',')}|${n.title}|${n.body}`;

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

/** Android 12+: the per-app "Alarms & reminders" screen. Elsewhere falls back to app settings. */
export async function openExactAlarmSettings(): Promise<void> {
  if (ANDROID && Number(Platform.Version) >= 31) {
    try {
      await Linking.sendIntent('android.settings.REQUEST_SCHEDULE_EXACT_ALARM');
      return;
    } catch {
      // fall through
    }
  }
  await Linking.openSettings();
}

/** Channels and action categories; cheap to call again (re-registers only when the tap size changes). */
export async function prepare(tapMl: number): Promise<void> {
  const signature = `${tapMl}`;
  if (prepared === signature) return;
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
      { identifier: 'WATER', buttonTitle: `+${tapMl} ml`, options: noOpen },
      { identifier: 'SNOOZE', buttonTitle: 'In 15 min', options: noOpen },
    ]),
    Notifications.setNotificationCategoryAsync('water-move', [
      { identifier: 'DONE', buttonTitle: 'Done', options: noOpen },
      { identifier: 'WATER', buttonTitle: `+${tapMl} ml`, options: noOpen },
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

/** How long an overdue, still-pending alarm is left alone before it is treated as lost. */
const OVERDUE_GRACE_MS = 30 * 60_000;

async function readLedger(): Promise<LedgerEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(LEDGER_KEY);
    return raw ? (JSON.parse(raw) as LedgerEntry[]) : [];
  } catch {
    return [];
  }
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

/**
 * Make the OS schedule match the plan. Returns what the OS delivered since the
 * previous sync (ledger entries whose time has passed), so the caller can record
 * FIRED events. A superseded call returns nothing: the newer sync reports it.
 */
export function syncPlan(plan: ScheduledNudge[], nowMs: number): Promise<FiredRecord[]> {
  return serialized(() => syncPlanNow(plan, nowMs), []);
}

async function syncPlanNow(plan: ScheduledNudge[], nowMs: number): Promise<FiredRecord[]> {
  const ledger = await readLedger();
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const pending = new Set(scheduled.map((r) => r.identifier));
  // Without exact-alarm access (the Android 14+ default) an alarm may still be pending minutes
  // after its time. Such an entry has not fired: leave it scheduled for a while rather than
  // cancelling it and counting it against the daily cap as if the user had seen it.
  const overdueKept = ledger.filter((e) => e.at <= nowMs && pending.has(e.id) && e.at > nowMs - OVERDUE_GRACE_MS);
  const keep = new Set(overdueKept.map((e) => e.id));
  const fired = ledger.filter((e) => e.at <= nowMs && !pending.has(e.id));

  const wanted = new Map(plan.map((n) => [n.id, n]));
  const ours = new Set<string>();
  const ledgerSig = new Map(ledger.map((e) => [e.id, e.sig]));

  for (const req of scheduled) {
    const id = req.identifier;
    if (id === MIND_END_ID) continue;
    if (keep.has(id)) {
      ours.add(id);
      continue;
    }
    const want = wanted.get(id);
    if (!want || ledgerSig.get(id) !== signature(want)) {
      await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
      continue;
    }
    ours.add(id);
  }

  // The ledger lists what is really pending: kept alarms plus what scheduling accepted. A request
  // the OS refused is not written down, so it is neither counted as fired nor marked delivered.
  const accepted = new Set<string>(ours);
  for (const n of plan) {
    if (ours.has(n.id) || n.at <= nowMs) continue;
    const payload: NudgePayload = {
      nudgeId: n.id,
      kind: n.kind,
      habitIds: n.habitIds,
      day: n.day,
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

  const nextLedger: LedgerEntry[] = [
    ...overdueKept,
    ...plan.filter((n) => n.at > nowMs && !keep.has(n.id) && accepted.has(n.id)).map((n) => ({ id: n.id, habitIds: n.habitIds, day: n.day, at: n.at, sig: signature(n) })),
  ];
  await AsyncStorage.setItem(LEDGER_KEY, JSON.stringify(nextLedger));
  return fired;
}

export function cancelAll(): Promise<void> {
  return serialized(async () => {
    await Notifications.cancelAllScheduledNotificationsAsync();
    await AsyncStorage.setItem(LEDGER_KEY, '[]');
  }, undefined);
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
  const seen = await withHandledLedger((keys) => keys.includes(key));
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
  const payload: NudgePayload = {
    nudgeId: MIND_END_ID,
    kind: 'MIND_END',
    habitIds: [],
    day: '',
    mind: { kind, minutes, startAt: endAtMs - minutes * 60_000 },
  };
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
