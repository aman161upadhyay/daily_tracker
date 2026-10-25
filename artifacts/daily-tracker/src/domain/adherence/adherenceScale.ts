/**
 * The adherence scale from DESIGN_SYSTEM.md §2.4.
 *
 * Every habit row, ring segment and heatmap cell is colored by adherence
 * a ∈ [0, 1]: pale gold (dormant) → lime (warming) → light green (building)
 * → Spotify green (on track) → green with a violet hue + gold frame (flow).
 *
 * Colors apply to fills only, never to text.
 */
import { mixOklch } from '../color/oklch';

export type AdherenceStage = 'dormant' | 'warming' | 'building' | 'onTrack' | 'flow';

export const ADHERENCE_STOPS: ReadonlyArray<{ at: number; hex: string; stage: AdherenceStage }> = [
  { at: 0.0, hex: '#F2E3A9', stage: 'dormant' }, // goldPale
  { at: 0.25, hex: '#D7E58C', stage: 'warming' }, // lime
  { at: 0.5, hex: '#8BE3A2', stage: 'building' }, // greenMist
  { at: 0.75, hex: '#1DB954', stage: 'onTrack' }, // green
  { at: 1.0, hex: '#1DB954', stage: 'flow' },
];

export const FLOW_THRESHOLD = 0.9;
export const FLOW_GRADIENT: readonly [string, string] = ['#1DB954', '#8B5CF6'];

export function clamp01(v: number): number {
  if (Number.isNaN(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function adherenceStage(a: number): AdherenceStage {
  const v = clamp01(a);
  if (v >= FLOW_THRESHOLD) return 'flow';
  if (v >= 0.75) return 'onTrack';
  if (v >= 0.5) return 'building';
  if (v >= 0.25) return 'warming';
  return 'dormant';
}

export const STAGE_LABELS: Record<AdherenceStage, string> = {
  dormant: 'Dormant',
  warming: 'Warming up',
  building: 'Building',
  onTrack: 'On track',
  flow: 'In flow',
};

/** Solid fill color for an adherence value (OKLCH-interpolated between stops). */
export function adherenceColor(a: number): string {
  const v = clamp01(a);
  for (let i = 0; i < ADHERENCE_STOPS.length - 1; i++) {
    const from = ADHERENCE_STOPS[i]!;
    const to = ADHERENCE_STOPS[i + 1]!;
    if (v <= to.at) {
      if (from.hex === to.hex) return from.hex;
      const t = (v - from.at) / (to.at - from.at);
      return mixOklch(from.hex, to.hex, t);
    }
  }
  return ADHERENCE_STOPS[ADHERENCE_STOPS.length - 1]!.hex;
}

/** Precomputed lookup (step 0.05) for UI-thread color interpolation. */
export const ADHERENCE_LUT_INPUT: number[] = Array.from({ length: 21 }, (_, i) => i / 20);
export const ADHERENCE_LUT_OUTPUT: string[] = ADHERENCE_LUT_INPUT.map((v) => adherenceColor(v));
