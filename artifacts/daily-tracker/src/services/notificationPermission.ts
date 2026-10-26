/**
 * What the notification permission means for the person, from what Android and Expo report.
 *
 * On Android 13+ Expo answers "denied" whenever notifications are not enabled for the app — and
 * on a fresh install they are not, because the POST_NOTIFICATIONS runtime permission has not been
 * asked for yet (expo-notifications' NotificationPermissionsModule: `!areEnabled -> DENIED`). Read
 * as "blocked", that hid the Allow button from every new install and sent people to the system
 * settings for a permission the app had never requested. So the runtime permission is read on its
 * own: not granted and still askable means "ask", granted at the system level but switched off in
 * the app's notification settings means "blocked" (only the settings can turn it back on).
 */
export type PermissionState = 'granted' | 'denied' | 'undetermined' | 'unsupported';

export interface PermissionFacts {
  /** Expo's answer. */
  status: 'granted' | 'denied' | 'undetermined';
  /** Expo's: false once Android will not show the dialog again (denied twice on Android 13+). */
  canAskAgain: boolean;
  /** Android 13+: whether POST_NOTIFICATIONS itself is granted; null where there is no such runtime permission (older Android, other platforms). */
  runtimeGranted: boolean | null;
}

export function classifyPermission(f: PermissionFacts): PermissionState {
  if (f.status === 'granted') return 'granted';
  if (f.runtimeGranted === true) return 'denied'; // the permission is there; notifications were switched off in the app's settings
  if (f.runtimeGranted === false) return f.canAskAgain ? 'undetermined' : 'denied'; // never asked, or denied once: Android shows the dialog again
  if (f.status === 'denied') return f.canAskAgain ? 'undetermined' : 'denied';
  return 'undetermined';
}
