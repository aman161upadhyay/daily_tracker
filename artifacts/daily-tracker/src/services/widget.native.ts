/**
 * Home-screen widget bridge (Android dev/release builds only). Keep this file's
 * exports identical to `widget.ts`. react-native-android-widget is required
 * lazily: importing it in Expo Go throws at load ("AndroidWidget could not be
 * found"), which would take every screen down with it.
 */
import { isRunningInExpoGo } from 'expo';
import { Platform } from 'react-native';
import type { TrackerState } from '@/src/state/types';
import { widgetModel } from '@/src/widget/model';

export const WIDGET_SUPPORTED: boolean = Platform.OS === 'android' && !isRunningInExpoGo();

type Rnaw = typeof import('react-native-android-widget');
type Handler = typeof import('@/src/widget/handler');

/** Called once from the entry file so the OS can run clicks and updates without the UI. */
export function registerWidgetTaskHandler(): void {
  if (!WIDGET_SUPPORTED) return;
  const rnaw = require('react-native-android-widget') as Rnaw;
  const handler = require('@/src/widget/handler') as Handler;
  rnaw.registerWidgetTaskHandler(handler.widgetTaskHandler);
}

/**
 * Redraw every placed widget from `state`. Resolves immediately where widgets do not exist. The
 * drawing itself is the headless task's `drawAllWidgets`: one widget at a time, each render awaited,
 * a throw inside a tree drawing the fallback tile on that widget instead of leaving an old number.
 */
export async function refreshWidgets(state: TrackerState, today: string, nowMs: number, zone: string): Promise<void> {
  if (!WIDGET_SUPPORTED) return;
  const handler = require('@/src/widget/handler') as Handler;
  await handler.drawAllWidgets(widgetModel(state, today, nowMs, zone));
}
