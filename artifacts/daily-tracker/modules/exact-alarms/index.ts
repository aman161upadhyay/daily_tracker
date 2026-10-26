/**
 * Exact-alarm status (Android 12+). A local Expo module: in Expo Go, on the web and on iOS the
 * native side is absent and the answer is "unknown" — callers then neither warn nor promise.
 */
import { requireOptionalNativeModule } from 'expo';

interface ExactAlarmsNative {
  canScheduleExactAlarms(): boolean;
}

const native = requireOptionalNativeModule<ExactAlarmsNative>('ExactAlarms');

/** true / false when the phone can tell us; null where the module is not built in. */
export function canScheduleExactAlarms(): boolean | null {
  if (!native) return null;
  try {
    return native.canScheduleExactAlarms();
  } catch {
    return null;
  }
}
