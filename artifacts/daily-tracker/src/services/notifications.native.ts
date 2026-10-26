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
import { isNudgePayload, type NudgePayload } from '@/src/state/commands';

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

async function readLedger(): Promise<LedgerEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(LEDGER_KEY);
    return raw ? (JSON.parse(raw) as LedgerEntry[]) : [];
  } catch {
    return [];
  }
}

/**
 * Make the OS schedule match the plan. Returns what the OS delivered since the
 * previous sync (ledger entries whose time has passed), so the caller can record
 * FIRED events.
 */
export async function syncPlan(plan: ScheduledNudge[], nowMs: number): Promise<FiredRecord[]> {
  const ledger = await readLedger();
  const fired = ledger.filter((e) => e.at <= nowMs);

  const wanted = new Map(plan.map((n) => [n.id, n]));
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const ours = new Set<string>();
  const ledgerSig = new Map(ledger.map((e) => [e.id, e.sig]));

  for (const req of scheduled) {
    const id = req.identifier;
    if (id === MIND_END_ID) continue;
    const want = wanted.get(id);
    if (!want || ledgerSig.get(id) !== signature(want)) {
      await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
      continue;
    }
    ours.add(id);
  }

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
    } catch (err) {
      console.warn('Could not schedule', n.id, err);
    }
  }

  const nextLedger: LedgerEntry[] = plan.filter((n) => n.at > nowMs).map((n) => ({ id: n.id, habitIds: n.habitIds, day: n.day, at: n.at, sig: signature(n) }));
  await AsyncStorage.setItem(LEDGER_KEY, JSON.stringify(nextLedger));
  return fired;
}

export async function cancelAll(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
  await AsyncStorage.setItem(LEDGER_KEY, '[]');
}

function toResponse(r: Notifications.NotificationResponse): NudgeResponse | null {
  const data = r.notification.request.content.data;
  if (!isNudgePayload(data)) return null;
  const action = r.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER ? 'TAP' : r.actionIdentifier;
  return { payload: data, action, key: `${r.notification.request.identifier}|${action}|${r.notification.date}` };
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

/**
 * Claim a response before applying it; returns false when it was already
 * claimed (the same press can reach the headless task and the foreground
 * listener). A claim whose handling then fails must be released with
 * `unmarkHandled`, otherwise the press is lost for good.
 */
export async function markHandled(key: string): Promise<boolean> {
  return withHandledLedger((keys) => {
    if (keys.includes(key)) return false;
    keys.push(key);
    return true;
  });
}

export async function unmarkHandled(key: string): Promise<void> {
  await withHandledLedger((keys) => {
    const i = keys.indexOf(key);
    if (i >= 0) keys.splice(i, 1);
  });
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
