/**
 * Home-screen widget bridge — web build. There is no widget here; everything
 * resolves immediately. Keep this file's exports identical to `widget.native.ts`.
 */
import type { TrackerState } from '@/src/state/types';

export const WIDGET_SUPPORTED: boolean = false;

export function registerWidgetTaskHandler(): void {}

export async function refreshWidgets(_state: TrackerState, _today: string, _nowMs: number, _zone: string): Promise<void> {}
