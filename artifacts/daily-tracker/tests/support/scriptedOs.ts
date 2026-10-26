/**
 * The notification service imports Expo and React Native modules, so tests load it through
 * `node:module` hooks that hand it stand-ins: the OS is scripted (schedules held in a map, with a
 * hook to suspend a call), the key-value storage behind the records is in memory. The service's
 * own logic — queues, generations, bookkeeping, the validity checks — is the real code. Shared by
 * the rounds that drive the real service (18, 21).
 */
import { createRequire, registerHooks } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export interface ScriptedOs {
  scheduled: Map<string, { identifier: string; content: unknown; trigger: unknown }>;
  log: [op: string, id: string][];
  /** Returns a promise to suspend the named call until it resolves, or undefined to let it run. */
  hold?: (op: string, id: string) => Promise<void> | undefined;
  /** Called when the schedule list is read. */
  onRead?: () => void;
  /** Called when a channel is (re)registered — inside prepare(). */
  onChannel?: () => Promise<void> | void;
  kvWrites: number;
}

type Native = typeof import('../../src/services/notifications.native');
type Replan = typeof import('../../src/services/replan');

let loaded: { native: Native; replan: Replan } | null = null;

/** Loads the native service (and the re-plan module on top of it) once, behind the stand-ins. */
export function loadNotificationService(): { native: Native; replan: Replan; os: ScriptedOs } {
  const g = globalThis as unknown as { __r18os: ScriptedOs };
  g.__r18os ??= { scheduled: new Map(), log: [], kvWrites: 0 };
  const os = g.__r18os;
  if (loaded) return { ...loaded, os };
  const root = path.resolve(__dirname, '..', '..');
  const nativeUrl = pathToFileURL(path.join(root, 'src/services/notifications.native.ts')).href;
  const stubs: Record<string, string> = {
    'expo-notifications': `
      const os = globalThis.__r18os;
      exports.AndroidImportance = { MIN: 1, LOW: 2, DEFAULT: 3, HIGH: 4, MAX: 5 };
      exports.AndroidNotificationVisibility = { PUBLIC: 1, PRIVATE: 0, SECRET: -1 };
      exports.SchedulableTriggerInputTypes = { DATE: 'date' };
      exports.PermissionStatus = { GRANTED: 'granted', DENIED: 'denied', UNDETERMINED: 'undetermined' };
      exports.setNotificationHandler = () => {};
      exports.setNotificationChannelAsync = async () => { await os.onChannel?.(); };
      exports.setNotificationCategoryAsync = async () => {};
      exports.getAllScheduledNotificationsAsync = async () => { os.onRead?.(); return [...os.scheduled.values()].map((r) => ({ identifier: r.identifier, content: r.content, trigger: r.trigger })); };
      exports.cancelScheduledNotificationAsync = async (id) => { os.log.push(['cancel', id]); await os.hold?.('cancel', id); os.scheduled.delete(id); };
      exports.scheduleNotificationAsync = async (req) => { os.log.push(['schedule', req.identifier]); await os.hold?.('schedule', req.identifier); os.scheduled.set(req.identifier, req); return req.identifier; };
      exports.addNotificationResponseReceivedListener = () => ({ remove() {} });
      exports.getLastNotificationResponseAsync = async () => null;
      exports.clearLastNotificationResponseAsync = async () => {};
    `,
    'expo-background-task': `exports.BackgroundTaskStatus = { Available: 1 }; exports.getStatusAsync = async () => 1; exports.registerTaskAsync = async () => {};`,
    'expo-task-manager': `exports.isTaskDefined = () => false; exports.defineTask = () => {};`,
    'expo-intent-launcher': `exports.ActivityAction = {}; exports.startActivityAsync = async () => {};`,
    'expo-constants': `exports.__esModule = true; exports.default = { expoConfig: { android: { package: 'app.test' } } };`,
    'react-native': `
      exports.Platform = { OS: 'android', Version: 34 };
      exports.PermissionsAndroid = { PERMISSIONS: { POST_NOTIFICATIONS: 'android.permission.POST_NOTIFICATIONS' }, check: async () => true };
      exports.Linking = { openSettings: async () => {} };
    `,
    '@/modules/exact-alarms': `exports.canScheduleExactAlarms = () => true;`,
    '@react-native-async-storage/async-storage': `
      const kv = new Map();
      exports.__esModule = true;
      exports.default = {
        getItem: async (k) => (kv.has(k) ? kv.get(k) : null),
        setItem: async (k, v) => { globalThis.__r18os.kvWrites += 1; kv.set(k, v); },
        removeItem: async (k) => { kv.delete(k); },
      };
    `,
  };
  const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier in stubs) return { url: `r18:${specifier}`, shortCircuit: true };
      // The re-plan module imports the platform twin; here that is the native one under test.
      if (specifier === './notifications' && context.parentURL?.endsWith('/src/services/replan.ts')) return { url: nativeUrl, shortCircuit: true };
      return nextResolve(specifier, context);
    },
    load(url, context, nextLoad) {
      if (url.startsWith('r18:')) return { format: 'commonjs', shortCircuit: true, source: stubs[url.slice(4)] };
      return nextLoad(url, context);
    },
  });
  try {
    const requireHere = createRequire(path.join(root, 'package.json'));
    const native = requireHere('./src/services/notifications.native.ts') as Native;
    const replan = requireHere('./src/services/replan.ts') as Replan;
    loaded = { native, replan };
    return { native, replan, os };
  } finally {
    // The modules are in the require cache now; later requires of them need no hooks.
    hooks.deregister();
  }
}

export const tick = () => new Promise<void>((r) => setImmediate(r));
export const resetOs = (os: ScriptedOs) => {
  os.scheduled.clear();
  os.log.length = 0;
  os.hold = undefined;
  os.onRead = undefined;
  os.onChannel = undefined;
  os.kvWrites = 0;
};
